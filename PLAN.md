# Anonymous_Reporter — Corporate Production Plan

Status: **2026-08-08 audit + hardening round**. This is the working roadmap to
take the zero-trust reporting platform from testnet/MVP to a ministry-grade,
corporate production system. Items marked **DONE** landed in this round.

---

## Audit summary (2026-08-08)

### Security / supply chain
| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| A1 | protobufjs <8.7.2 — arbitrary code execution (via @hashgraph/sdk) | CRITICAL | **DONE** — override `protobufjs 8.7.2` |
| A2 | @grpc/grpc-js 1.12.x — malformed-message DoS (via @hashgraph/sdk) | HIGH | **DONE** — override `@grpc/grpc-js 1.14.4` |
| A3 | elliptic risky primitive (via @ethersproject/signing-key ≤5.8.0) | HIGH | **DONE** — elliptic 6.6.1; signing-key has no fixed release → documented residual |
| A4 | brace-expansion / ip-address / js-yaml / shell-quote DoS+SSRF (dev chains) | HIGH | **DONE** — overrides to fixed versions |
| A5 | postcss ≤8.5.22, sharp <0.35.0 (Next.js chain) | HIGH | **DONE** — postcss 8.5.26, sharp 0.35.3 |
| A6 | image-size `*` (metro/react-native chain, build-time only) | HIGH | Residual — no fix exists; build-time only, not shipped |
| A7 | 7 low advisories | LOW | Residual — documented, non-exploitable in this stack |
| | **Net result** | | **28 → 17 vulns, critical 1 → 0** |

### Code / architecture
| # | Finding | Resolution |
|---|---------|------------|
| B1 | Hedera network hardcoded `Client.forTestnet()` | **DONE** — `HEDERA_NETWORK=testnet\|mainnet`, unsupported → 500 |
| B2 | Topic ID not format-validated | **DONE** — `0.0.<num>` regex → 400 fail-fast |
| B3 | Admin auth: string `===` compare (timing), dev-open, no rate limit | **DONE** — `timingSafeEqual` over SHA-256 digests; `NODE_ENV=production` fails closed; (rate limit added in index) |
| B4 | Internal network forwarding is a mock that always accepts | **DONE** — real HTTP POST to `INTERNAL_NETWORK_URL/ingest` + timeout + retry; mock only in dev / `ENABLE_INTERNAL_MOCK=1`; `InternalForwardError` mapped to 502/503 |
| B5 | `LE_PRIVATE_KEY_PEM` shipped on the blind proxy (compose) — proxy can decrypt, violating zero-trust | **DONE** — removed from compose backend env; key lives only on the isolated internal host |
| B6 | Attachment decryption in internal mock was dead code | **DONE** — `unwrapAesKey` + real AES-GCM file decrypt; logs sha256 prefix only |
| B7 | S3 key suffix used `Math.random()` | **DONE** — `crypto.randomBytes(6)` |
| B8 | Backend Docker image shipped devDependencies | **DONE** — `npm prune --omit=dev` in runner stage |
| B9 | 2 ESLint errors (unused vars) | **DONE** |

---

## Roadmap to corporate production

### Phase A — Security hardening (THIS ROUND — DONE)
A full pass over supply chain, auth, network handling, container hygiene. See
table above. Residuals (A3 advisory without fix, A6, A7) are documented and
reviewed below.

### Phase B — Deployment & ops (next, agent + operator)
- [ ] B-1 Reverse proxy + TLS for frontend and backend (nginx/caddy on the VPS, Let's Encrypt).
- [ ] B-2 Secrets: single `.env` (gitignored) for compose; document `OPERATOR_API_KEY` ceremony (random ≥32 bytes).
- [ ] B-3 Health/readiness split: `/health` (liveness) + `/health/ready` (MinIO + Hedera client init status).
- [ ] B-4 Audit log rotation policy (daily JSONL archive, retention 2 years — ministry requirement).
- [ ] B-5 Structured logging (JSON, no identity fields) + request-id in logs only.
- [ ] B-6 CI hardening: make `npm audit` a blocking gate on new HIGH/CRITICAL; add backend coverage report.
- [ ] B-7 Load test / rate-limit tuning per destination; abuse monitoring (Hedera cost spikes).

### Phase C — Zero-trust network topology (architectural)
- [x] C-1 Blind proxy VM: no LE private key, no internal-network egress except the single HTTPS bridge call. *(code: compose no longer passes LE key; egress = INTERNAL_NETWORK_URL only)*
- [ ] C-2 Internal network VM (air-gapped by firewall): holds `LE_PRIVATE_KEY_PEM`, decrypts, runs Edge AI, writes dashboard.
- [x] C-3 Bridge auth: `INTERNAL_NETWORK_TOKEN` (bearer) sent to the bridge `/ingest` — **DONE 2026-08-08** (mTLS optional later).
- [ ] C-4 MinIO bucket: private, encrypted at rest, lifecycle (retention 2y), no public endpoint. *(lifecycle json exists; verify in deploy)*

### Phase D — Mainnet & Ministry (operator/ministry involvement)
- [ ] D-1 Create the official HCS topic on mainnet; set `HEDERA_NETWORK=mainnet`, `HEDERA_TOPIC_ID=<official>`.
- [ ] D-2 HSM-based signing for the operator key (ministry HSMs; SDK `Client.setOperator` with HSM-backed provider or pre-signed tx pattern).
- [ ] D-3 Admin dashboard hardening: role-based access (viewer/operator), audit of admin reads, disable dev-open mode.
- [ ] D-4 Key ceremony + offline backup (shamir/HSM), documented runbook, named custodians.
- [ ] D-5 Legal/process: data-retention policy, SimpleX relay ops, incident-response runbook.

### Phase E — Product
- [x] E-1 Multi-language (hy, en, ru) — **DONE 2026-08-08** (ru.json native-quality, LocaleSwitcher, tracking page translated; admin stays hy).
- [x] E-2 Report status page by tracking seed (hash lookup on HCS, no identity) — **DONE 2026-08-08** (`/api/track/:seed` + frontend `/tracking`).
- [x] E-3 Captcha-less anti-abuse (client-side proof-of-work) — **DONE 2026-08-08** (`services/pow.ts` + `frontend/utils/pow.ts`, `POW_DIFFICULTY` default 16 bits, env-overridable).
- [ ] E-4 Agency triage UI for the internal dashboard (CRITICAL/HIGH/LOW queues). *(blocked on Phase C-2 internal VM — decrypted content never touches the blind proxy)*

---

## Residual risks (accepted, documented)

1. **@ethersproject/signing-key ≤5.8.0 advisory (GHSA-848j-6mx2-7j84)** — no fixed release exists (5.9.0 not published); the underlying `elliptic` lib is pinned at 6.6.1 (current). Impact: cryptographic-primitive warning, no user-controlled elliptic input. Revisit when ethers publishes a fix.
2. **image-size `*`** — build-time parser in the react-native/metro chain pulled by `@hiero-ledger/cryptography` (transitive of `@hashgraph/sdk`). Not shipped, not server-facing. Revisit on `@hashgraph/sdk` upgrade.
3. **7 low advisories** — dev-chain tooling; non-exploitable in the production image (dev deps pruned).

## Definition of "corporate production ready"

- [ ] 0 critical, 0 exploitable high vulnerabilities
- [ ] TLS on all public endpoints; secrets only via env; no keys in repo/image
- [ ] Blind proxy provably cannot decrypt (no private key, no AES key material)
- [ ] Mainnet HCS topic + HSM-backed operator signing
- [ ] Audit trail append-only with retention policy
- [ ] CI blocks new HIGH/CRITICAL; tests ≥ 40 green
- [ ] Runbooks: deploy, key ceremony, incident response, SimpleX ops
