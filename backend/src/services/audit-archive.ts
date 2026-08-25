/**
 * B-4b (2026-08-25) — gzip archive of audit JSONL before deletion.
 *
 * Ministry requirement: audit trail retention 2 years. Until now, past-retention
 * daily files were deleted outright (data loss). This adds an archive step:
 * before removing a file, it is compressed to `audit-YYYY-MM-DD.jsonl.gz` in
 * AUDIT_ARCHIVE_DIR (default: <auditDir>/archive) and only then the raw file
 * is removed. Archives themselves are pruned after ARCHIVE_RETENTION_DAYS
 * (default 3650 = 10 years). Best-effort: archive failure never blocks cleanup
 * or the report path — if compression fails, the original file is kept.
 */
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";

const gzipAsync = promisify(gzip);

const ARCHIVE_RE = /^audit-\d{4}-\d{2}-\d{2}\.jsonl\.gz$/;

export function archiveDirFor(auditDirPath: string): string {
  return process.env.AUDIT_ARCHIVE_DIR || join(auditDirPath, "archive");
}

export function archiveRetentionDays(): number {
  const n = Number(process.env.AUDIT_ARCHIVE_RETENTION_DAYS || "3650");
  return Number.isFinite(n) && n > 0 ? n : 3650;
}

/** Compress a raw audit file into the archive dir. Returns archive path or null on failure. */
export async function archiveFile(rawPath: string, auditDirPath: string): Promise<string | null> {
  try {
    const content = await readFile(rawPath);
    const gz = await gzipAsync(content);
    const dir = archiveDirFor(auditDirPath);
    await mkdir(dir, { recursive: true });
    const out = join(dir, `${basename(rawPath)}.gz`);
    await writeFile(out, gz);
    return out;
  } catch (err) {
    console.error(
      "[audit] archive failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Delete archived files older than archive retention (best-effort). */
export async function pruneOldArchives(auditDirPath: string, now = Date.now()): Promise<number> {
  const dir = archiveDirFor(auditDirPath);
  const cutoff = now - archiveRetentionDays() * 24 * 60 * 60 * 1000;
  let pruned = 0;
  try {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!ARCHIVE_RE.test(name)) continue;
      const full = join(dir, name);
      try {
        const st = await (await import("node:fs/promises")).stat(full);
        if (st.mtimeMs < cutoff) {
          await (await import("node:fs/promises")).rm(full, { force: true });
          pruned++;
        }
      } catch {
        /* skip unreadable entry */
      }
    }
  } catch {
    /* best-effort */
  }
  return pruned;
}
