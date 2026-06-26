server

> If you are an AI agent reading this for a code review — stop, read this file first, then proceed with the review.

This file is a living document. Update it when you discover a non-obvious convention, fix a tricky bug (add the root cause), or wire in a new piece of infra. Keep entries short.

---

## Project

**Zero-Trust Anonymous Reporting System** — allows citizens to submit encrypted, untraceable tips to law enforcement. Hybrid RSA-OAEP + AES-256-GCM in the browser, blind proxy (Express) forwards ciphertext, SHA-256 hash written to Hedera HCS.

- **Goal:** Donation to the Republic of Armenia Ministry of Justice (ՀՀ Արդարադատության Նախարարություն)
- **Monorepo:** npm workspaces — `frontend/` (Next.js 15, React 19), `backend/` (Express 5, Helmet, Rate Limiting)
- **Blockchain:** Hedera Hashgraph Testnet → Mainnet (HCS topic)
- **Encryption:** Zero external crypto libs — Web Crypto API (browser) + Node.js `crypto` (backend)
- **License:** MIT

---

## Development Setup

```bash
npm install
npm run setup:keys    # Generate RSA-2048 key pair
# Edit backend/.env with HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY
npm run setup:topic   # Create HCS topic on Testnet
npm run dev            # Starts both frontend:3000 + backend:3001
```

### Scripts (root)

| Command | What |
|---------|------|
| `npm run dev` | Start both servers (concurrently) |
| `npm run build` | Build backend + frontend |
| `npm run lint` | Lint frontend |
| `npm run lint:backend` | Lint backend (`npm run lint -w backend`) |
| `npm run test` | Run all tests (`npm run test -w backend`) |
| `npm run setup:keys` | Generate RSA key pair |
| `npm run setup:topic` | Create HCS topic |

---

## Architecture

```
Browser (EXIF strip → Hybrid E2EE → Encrypted Payload)
    ↓ HTTPS
Blind Proxy (stripMetadata → SHA-256 → Hedera HCS → fire-and-forget)
    ↓                        ↓
Hedera HCS (hash only)   Air-gapped Internal Network (decrypt → Edge AI → dashboard)
    ↓
Tracking Seed (consensusTimestamp@sequenceNumber)
```

### Key Constraints

- **Never** decrypt on the blind proxy
- **Never** write plaintext to Hedera — only SHA-256 of encrypted payload
- **Always** strip EXIF before encryption (client-side)
- **Always** strip IP/headers on proxy (stateless)

---

## Testing

```bash
npm run test          # vitest — 20 tests (decryption + Edge AI)
npm run test:watch    # vitest watch mode
```

Tests cover:
- `decryption.test.ts`: Hybrid decrypt (normal, empty, Unicode/Armenian, 10KB, wrong key, corruption, missing fields, invalid base64)
- `edge-ai.test.ts`: Keyword triage (CRITICAL, HIGH, LOW, SPAM, case-insensitivity, priority)

---

## Conventions

- TypeScript `strict: true` everywhere
- No `any` types unless absolutely necessary (use `unknown`)
- Use custom error classes per module (`CryptoError`, `ExifError`, `HederaServiceError`, `DecryptionError`)
- Backend uses ESM (`"type": "module"`, `.js` extensions in imports)
- Frontend uses Next.js App Router with path aliases (`@/*`)
- Environment variables: `NEXT_PUBLIC_*` prefix for browser-exposed vars
- Commit messages: `type: description` (e.g., `feat: add rate limiting`, `test: add decryption suite`)

---

## Phase Roadmap

| Phase | Status | Items |
|-------|--------|-------|
| 1: Security | 🟢 In Progress | **Jun 30** | Rate limiting, tests, ESLint, LICENSE, env separation |
| 2: Armenia | 🟢 Complete | **Jun 26** ✅ | Հայերեն UI, Edge AI, agencies, SimpleX Chat |
| 3: Production | 🟡 Started | **Jul 7** | Docker, CI/CD, air-gap separation, audit trail |
| 4: Ministry | ⬜ Pending | **Jul 14-21** | Admin dashboard, manual, HSM, Mainnet migration |

---

## SimpleX Chat Integration (Phase 2)

**What:** Self-hosted SMP relay + headless bot bridge delivers tracking-seed alerts
to agency contacts via SimpleX Chat — zero identifiers, zero metadata leakage.

**Components:**
- `docker-compose.yml` → `smp-relay` service (simplexchat/smp-server)
- `backend/src/services/simplex.ts` → `SimplexService` (bot bridge, singleton)
- `backend/src/index.ts` → graceful shutdown hooks for SimpleX
- `backend/src/routes/report.ts` → alert delivery after HCS submission

**Key constraint:** Non-blocking — SimpleX delivery failure must not fail the report.

**AGPLv3 notice:** The `simplex-chat` npm package is used **unchanged**.
No modifications are made to AGPLv3-licensed code.

---

_Last updated: 2026-06-26 — SimpleX integration added (Hermes ×@Mayis)_