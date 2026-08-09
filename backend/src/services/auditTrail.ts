import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Audit trail service — append-only JSONL log of HCS submissions.
 * The blind proxy never logs plaintext or identifying metadata;
 * it logs only the cryptographic hash + tracking seed + destination.
 *
 * B-4 (2026-08-08): daily rotation + retention.
 * - Logs written to `data/audit-YYYY-MM-DD.jsonl` (one file per day).
 * - Old files older than AUDIT_RETENTION_DAYS (default 730 = 2 years,
 *   ministry requirement) are archived-deleted best-effort.
 * - Best-effort: audit write failures must never fail the report.
 */

function auditDir(): string {
  return process.env.AUDIT_LOG_PATH
    ? dirname(process.env.AUDIT_LOG_PATH)
    : "data";
}

function todayTag(): string {
  return new Date().toISOString().slice(0, 10);
}

function logPath(): string {
  const explicit = process.env.AUDIT_LOG_PATH;
  if (explicit) {
    // If operator set a fixed path, keep it (single-file mode, no rotation).
    return explicit;
  }
  return join(auditDir(), `audit-${todayTag()}.jsonl`);
}

function retentionDays(): number {
  const n = Number(process.env.AUDIT_RETENTION_DAYS || "730");
  return Number.isFinite(n) && n > 0 ? n : 730;
}

let lastCleanup = 0;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000; // every 6h

export interface AuditEntry {
  ts: string;
  event: "hcs_submitted" | "hcs_failed";
  payloadHash: string;
  trackingSeed?: string;
  destination?: string;
  transactionId?: string;
  error?: string;
}

/** Delete rotated audit files older than retention (best-effort, throttled). */
export async function maybeCleanupOldAudits(now = Date.now()): Promise<void> {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  try {
    const dir = auditDir();
    const cutoff = now - retentionDays() * 24 * 60 * 60 * 1000;
    const entries = await readdir(dir).catch(() => []);
    for (const name of entries) {
      if (!/^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      const full = join(dir, name);
      const st = await stat(full).catch(() => null);
      if (st && st.mtimeMs < cutoff) {
        await rm(full, { force: true }).catch(() => undefined);
        console.log(`[audit] archived/removed ${name} (past ${retentionDays()}d retention)`);
      }
    }
  } catch (err) {
    console.error(
      "[audit] cleanup failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await mkdir(auditDir(), { recursive: true });
    await appendFile(logPath(), JSON.stringify(entry) + "\n", "utf8");
    // Best-effort rotation cleanup (throttled internally).
    await maybeCleanupOldAudits();
  } catch (err) {
    // Non-blocking: audit failures must not break report submission.
    console.error(
      "[audit] write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
