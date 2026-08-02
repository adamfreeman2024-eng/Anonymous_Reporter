import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Audit trail service — append-only JSONL log of HCS submissions.
 * The blind proxy never logs plaintext or identifying metadata;
 * it logs only the cryptographic hash + tracking seed + destination.
 *
 * Path configurable via AUDIT_LOG_PATH (default: data/audit.jsonl).
 * Best-effort: audit write failures must never fail the report.
 */

function logPath(): string {
  return process.env.AUDIT_LOG_PATH || "data/audit.jsonl";
}

export interface AuditEntry {
  ts: string;
  event: "hcs_submitted" | "hcs_failed";
  payloadHash: string;
  trackingSeed?: string;
  destination?: string;
  transactionId?: string;
  error?: string;
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await mkdir(dirname(logPath()), { recursive: true });
    await appendFile(logPath(), JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // Non-blocking: audit failures must not break report submission.
    console.error(
      "[audit] write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
