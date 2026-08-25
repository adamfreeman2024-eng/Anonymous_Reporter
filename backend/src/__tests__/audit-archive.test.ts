/**
 * B-4b (2026-08-25) — audit gzip archive tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { archiveFile, pruneOldArchives, archiveDirFor } from "../services/audit-archive.js";

let dir: string;

describe("audit-archive (B-4b)", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-audit-"));
    delete process.env.AUDIT_ARCHIVE_DIR;
  });
  afterEach(async () => {
    delete process.env.AUDIT_ARCHIVE_DIR;
  });

  it("archives a raw jsonl file to .gz in the archive dir", async () => {
    const raw = join(dir, "audit-2026-01-01.jsonl");
    await writeFile(raw, '{"ts":"t"}\n{"ts":"u"}\n');
    const out = await archiveFile(raw, dir);
    expect(out).toBe(join(archiveDirFor(dir), "audit-2026-01-01.jsonl.gz"));
    const round = gunzipSync(await readFile(out as string)).toString();
    expect(round).toContain('{"ts":"t"}');
  });

  it("returns null (and keeps the original) when source is unreadable", async () => {
    const out = await archiveFile(join(dir, "missing.jsonl"), dir);
    expect(out).toBeNull();
  });

  it("honors AUDIT_ARCHIVE_DIR override", async () => {
    process.env.AUDIT_ARCHIVE_DIR = "/tmp/ar-custom-archive-test";
    expect(archiveDirFor(dir)).toBe("/tmp/ar-custom-archive-test");
  });

  it("pruneOldArchives only removes past-retention .gz files", async () => {
    const adir = archiveDirFor(dir);
    await mkdir(adir, { recursive: true });
    const oldF = join(adir, "audit-2020-01-01.jsonl.gz");
    const newF = join(adir, "audit-2099-01-01.jsonl.gz");
    await writeFile(oldF, "x");
    await writeFile(newF, "y");
    // backdate old file mtime via a fresh prune with far-past cutoff is not
    // possible without touching mtime; use huge retention=1 day instead.
    process.env.AUDIT_ARCHIVE_RETENTION_DAYS = "1";
    // utimes to backdate
    const { utimes } = await import("node:fs/promises");
    const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await utimes(oldF, oldTime, oldTime);
    const pruned = await pruneOldArchives(dir);
    expect(pruned).toBe(1);
  });
});
