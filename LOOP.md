# Loop Engineering — Anonymous_Reporter

Phase 1 zero-trust anonymous reporting app. Donation to ՀՀ ԱՆ.

| Loop | Cadence | Level | Scope |
|------|---------|-------|-------|
| **Daily Triage** | 1d (08:15 Yerevan) | L1 | CI, test pass/fail, Phase deadlines, SimpleX relay — report only |

## Budget

- Daily cap: $2/day Pioneer (DeepSeek V4 Pro)
- Current: ~$0.003/run ($0.021/week)
- Kill switch: if > 85% of $2/day ($1.70) → throttle

## Gate Rules

- L1: Read + write STATE.md only. No code changes. No auto-merge.
- L2: Propose fixes via git worktree + PR. Require human review.
- L3: Disabled — unattended code changes violate zero-trust integrity.

## Skills Location

In `.hermes/skills/`:
- `loop-triage` — daily CI + deadline check (L1, report-only)
- `loop-verifier` — test + lint gate before merge (L2)

## MCP & Connectors

- MCP not required for current patterns.
- GitHub PAT: `repo` scope only.
- All loops operate via Hermes Agent native tools.