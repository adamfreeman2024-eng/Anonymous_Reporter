# Safety — Anonymous_Reporter

## Auto-Merge Policy

- Disabled. All PRs require human review.
- L1: Read-only.
- L2: Propose via worktree + PR.
- L3: Disabled — zero-trust integrity.

## Denylist

- `.env`, `.env.local` — credentials
- `backend/src/services/simplex.ts` — AGPLv3, unchanged
- `docker-compose.yml` — infra, human-maintained
- `keys/` — RSA key material

## Allowlist (L2)

- `*.ts` in `backend/src/routes/`, `backend/src/middleware/`
- `*.test.ts` — test fixes only
- `*.md` — docs

## MCP Scopes

- Not using MCP.
- GitHub PAT: `repo` scope only.

## Kill Switch

- If loop touches denylist files → escalate.
- If 3 consecutive budget alerts → throttle to manual.
- Emergency: delete `STATE.md` + `LOOP.md`.
