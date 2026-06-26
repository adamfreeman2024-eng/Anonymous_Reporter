# Loop Triage — Anonymous_Reporter Daily Check

Trigger: Every 1d at 08:15 Yerevan time.
Cadence: L1 (report-only — no code changes, no PRs).

## Checklist

- [ ] **CI/Test Health:** Run `npm run test` — 20/20 expected. Flag any failures.
- [ ] **Phase 1 Deadline:** Count days to June 30, 2026. Alert if < 2 days.
- [ ] **Phase items:** Rate limiting, ESLint, LICENSE, env separation — check progress.
- [ ] **SimpleX Relay:** Check docker-compose.yml for SMP relay config integrity.
- [ ] **AGPLv3 Compliance:** Verify simplex-chat used unchanged, no modifications.
- [ ] **Security:** Verify no plaintext in HCS transactions, EXIF stripping active.

## Output

Write to `STATE.md`:
- Update `Last run` timestamp.
- Update Phase 1 deadline countdown.
- Flag any test failures or security concerns.
- If all green: "✅ All tests pass (20/20), Phase 1 on track (X days), SimpleX compliant."

## Verification

- L1: Human reads STATE.md — no auto-action.
- Do NOT modify code, open PRs, or touch SimpleX/AGPLv3 code.
