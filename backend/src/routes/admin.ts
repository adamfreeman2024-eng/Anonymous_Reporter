import { Router, type Request, type Response } from "express";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import { appendAudit } from "../services/auditTrail.js";

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
  return adminRole(req) !== null;
}

export type AdminRole = "operator" | "viewer";

function bearerToken(req: Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
}

function tokenMatches(token: string, key: string | undefined): boolean {
  if (!key || !token) return false;
  const a = digest(token);
  const b = digest(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Operator key wins. Viewer key is read-only. Production with no keys fails closed. */
export function adminRole(req: Request): AdminRole | null {
  const operator = process.env.OPERATOR_API_KEY?.trim();
  const viewer = process.env.ADMIN_VIEWER_KEY?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const token = bearerToken(req);

  if (!operator && !viewer) return isProduction ? null : "operator";
  if (tokenMatches(token, operator)) return "operator";
  if (tokenMatches(token, viewer)) return "viewer";
  return null;
}

export function isOperator(req: Request): boolean {
  return adminRole(req) === "operator";
}

adminRouter.get("/stats", async (req: Request, res: Response) => {
  const role = adminRole(req);
  if (!role) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  void appendAudit({
    ts: new Date().toISOString(),
    event: "admin_read",
    role,
  });

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
      role,
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
