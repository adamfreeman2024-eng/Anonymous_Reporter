import { Router, type Request, type Response } from "express";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";

/**
 * Admin stats (Phase 4 — Ministry dashboard, skeleton).
 * Reads the append-only audit trail (never plaintext) and returns aggregate counts.
 * Guarded by OPERATOR_API_KEY (Bearer). In production the key is REQUIRED —
 * the endpoint fails closed (401) when the key is unset.
 */

export const adminRouter = Router();

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isAuthorized(req: Request): boolean {
  const key = process.env.OPERATOR_API_KEY?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!key) {
    // Dev mode: open. Production: fail closed.
    return !isProduction;
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;

  if (!token) {
    return false;
  }

  // Constant-time comparison — prevents timing side-channel on the admin key.
  const a = digest(token);
  const b = digest(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

adminRouter.get("/stats", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // B-4: aggregate across rotated daily audit files (audit-YYYY-MM-DD.jsonl),
    // or the single explicit AUDIT_LOG_PATH when set.
    const explicit = process.env.AUDIT_LOG_PATH;
    const dir = explicit ? dirname(explicit) : "data";
    const names = explicit
      ? [explicit]
      : (await readdir(dir).catch(() => []))
          .filter((n) => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
          .sort();
    let total = 0;
    const byEvent: Record<string, number> = {};
    const byDestination: Record<string, number> = {};
    let lastTimestamp: string | null = null;
    for (const name of names) {
      const raw = await readFile(join(dir, name), "utf8").catch(() => "");
      const lines = raw.split("\n").filter(Boolean);
      total += lines.length;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as {
            event?: string;
            destination?: string;
            ts?: string;
          };
          if (entry.event) byEvent[entry.event] = (byEvent[entry.event] ?? 0) + 1;
          if (entry.destination)
            byDestination[entry.destination] = (byDestination[entry.destination] ?? 0) + 1;
          if (entry.ts) lastTimestamp = entry.ts;
        } catch {
          // skip malformed lines
        }
      }
    }

    res.json({
      ok: true,
      total,
      files: names.length,
      byEvent,
      byDestination,
      lastSubmission: lastTimestamp,
      note: "aggregates from audit trail only — no plaintext, no identity",
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "stats failed",
    });
  }
});
