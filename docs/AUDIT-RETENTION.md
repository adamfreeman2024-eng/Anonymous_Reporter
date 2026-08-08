# Audit Trail Retention Policy

The blind proxy appends one JSONL entry per HCS submission to
`AUDIT_LOG_PATH` (default `data/audit.jsonl`). Each entry is:
`{ ts, event, payloadHash, trackingSeed, destination, transactionId }` —
**no plaintext, no identity.**

## Policy (ministry default)

- **Online:** 30 days of JSONL on the proxy volume (`backend_data`).
- **Archive:** after 30 days, the daily file moves to cold storage
  (S3-compatible archive bucket or encrypted vault), kept **2 years**.
- **Hash-chain note:** HCS itself is the immutable witness; the audit file is
  operational convenience for aggregate stats, not the source of truth.

## Rotation mechanics

The append-only file is rotated **daily at 00:10 UTC**:

1. Rename `audit.jsonl` → `audit-YYYY-MM-DD.jsonl` (atomic rename).
2. A fresh `audit.jsonl` is created on the next append (`appendFile` with
   `mkdir -p` — the service already creates missing files).
3. Archive job (cron or container sidecar) moves files older than 30 days to
   cold storage and verifies line count + a checksum per file.

### Suggested cron (VPS / container host)

```cron
10 0 * * *  root  mv /srv/anonymous-reporter/data/audit.jsonl /srv/anonymous-reporter/data/audit-$(date -u +\%F).jsonl 2>/dev/null || true
30 0 * * *  root  find /srv/anonymous-reporter/data -name 'audit-*.jsonl' -mtime +30 -exec gzip {} \; -exec mv {} /srv/archive/anonymous-reporter/ \;
```

`/srv/archive/anonymous-reporter/` must be on an encrypted, access-controlled
volume (retention 2 years, per ministry records policy).

## Integrity check (monthly, operator)

```bash
# 1) Every line parses as JSON
jq -e . /srv/anonymous-reporter/data/audit-*.jsonl > /dev/null

# 2) Count matches HCS submissions (compare with /api/admin/stats total)
wc -l /srv/anonymous-reporter/data/audit.jsonl

# 3) Spot-check a tracking seed on HashScan (mainnet after Phase D)
```

## Non-goals

- The audit file is **not** a backup of encrypted payloads (those live in MinIO).
- MinIO retention (2 years, encrypted at rest) is configured via
  `docker/minio-lifecycle.json`; verify the policy applied with
  `mc ilm export local/reports`.
