# Loop State — Anonymous_Reporter

Last run: 2026-08-08 (Hermes — audit + corporate hardening round)
Next run: Phase B (deployment & ops) or Phase D (mainnet) on next session

## Status (2026-08-08)

- ✅ **Supply-chain audit** — 28 → 17 vulnerabilities, **critical 1 → 0**; overrides: protobufjs 8.7.2, @grpc/grpc-js 1.14.4, elliptic 6.6.1, brace-expansion 5.0.9, ip-address 10.4.0, js-yaml 4.3.1, shell-quote 1.10.0, postcss 8.5.26, sharp 0.35.3
- ✅ **Hedera network env** — `HEDERA_NETWORK=testnet|mainnet` (was hardcoded forTestnet); topic `0.0.<num>` format → 400
- ✅ **Admin auth hardened** — `timingSafeEqual` (SHA-256 digests), `NODE_ENV=production` fails closed (401 without OPERATOR_API_KEY)
- ✅ **Real internal-network forwarding** — `INTERNAL_NETWORK_URL/ingest` POST + 10s timeout + 1 retry; `InternalForwardError` → 502/503; mock only in dev / `ENABLE_INTERNAL_MOCK=1`
- ✅ **Zero-trust fix** — `LE_PRIVATE_KEY_PEM` removed from docker-compose backend env (proxy never decrypts)
- ✅ **Attachment decryption wired** — `unwrapAesKey` + real AES-256-GCM file decrypt in internal mock (sha256 prefix logged, never content)
- ✅ **Container hygiene** — backend runner `npm prune --omit=dev`; S3 suffix `crypto.randomBytes`; `.dockerignore` added
- ✅ **Tests 41/41** — new suites: admin auth (6), forward (5), hedera (4), unwrapAesKey (2)
- ✅ **ESLint clean** — fixed 2 unused-var errors; frontend `eslint.config.mjs` (next lint non-interactive)
- ✅ **TS 5.9 build fix** — `Uint8Array<ArrayBuffer>` copies in crypto.ts / fileCrypto.ts
- ✅ **CI** — lint blocking, `npm audit --audit-level=critical` blocking, coverage step (informational)
- 📄 **PLAN.md** — corporate production roadmap (Phase A done; B partial done this round)
- 📄 **Phase B partial (2026-08-08)** — `/health/ready` (storage HeadBucket + Hedera config); structured JSON logger (`services/logger.ts`, no identity fields) + request-id (logs only); `test:coverage`; docs/SECRETS.md; docs/AUDIT-RETENTION.md; `docker/.env.production.example`

## High Priority

- [ ] **Phase B — Deployment & ops (remaining)**: TLS/nginx on VPS, secrets ceremony (user-side), ready probe wiring, audit rotation cron
- [ ] **Phase C (remaining)**: internal VM + mTLS (ministry side); C-3 bridge token DONE
- [ ] **Phase D — Mainnet**: official HCS topic, HSM signing, admin RBAC, key ceremony runbook (ministry input)

## Phase C/E partial (commit `dffb806`, 2026-08-08)

- **C-3 bridge auth** — `INTERNAL_NETWORK_TOKEN` → Bearer header on `/ingest` (tested).
- **E-2 tracking-seed verification** — `GET /api/track/:seed` queries the Hedera mirror node for the topic message by sequence (no operator key, no identity); `services/track.ts` (`parseTrackingSeed`, `mirrorNodeBaseUrl`, `lookupTrackingSeed`); frontend `/tracking` page (hash display, HashScan link, main-page link); rate-limited.
- **Admin rate-limit gap fixed** — `/api/admin` now behind `adminLimiter` (was claimed in PLAN but missing).
- Tests 41 → **49**; build green.

## Watch List

- [ ] `@ethersproject/signing-key` advisory (GHSA-848j-6mx2-7j84) — no fixed release; elliptic pinned 6.6.1; revisit on ethers publish
- [ ] `image-size` `*` — build-time only (react-native chain via @hashgraph/sdk transitive); revisit on SDK upgrade
- [ ] `simplex-chat` npm package — AGPLv3, used unchanged, compliance OK
- [ ] HCS topic — testnet only; Phase D moves to mainnet

## Human Decisions

- (2026-06-26) Mayis: SimpleX integration approved (AGPLv3 compliance verified)
- (2026-06-26) Mayis: Phase priority: Phase 1 → Phase 3 → Phase 4
- (2026-08-08) Mayis: audit + fix + corporate production plan, executed in-loop

## Loop Budget (rolling 7d)

| Loop | Runs | Est. Tokens | Cost |
|------|------|-------------|------|
| Daily Triage | 5 | ~42K | ~$0.017 |
| Total | | **~42K** | **~$0.017/week** |

Kill switch: not triggered.
