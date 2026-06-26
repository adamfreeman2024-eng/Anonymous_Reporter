# Zero-Trust Anonymous Reporting System

> A highly secure, air-gapped simulation for anonymous tipping to law enforcement — prioritizing **citizen safety**, **cryptographic privacy**, and **immutable audit trails**.

---

## 📋 Overview

The **Zero-Trust Anonymous Reporting System** enables citizens to submit encrypted, untraceable tips to law enforcement agencies without revealing their identity. Reports are encrypted entirely in the browser before they ever leave the user's device. A stateless **Blind Proxy** forwards ciphertext without decrypting it, while only a **SHA-256 hash** of the encrypted payload is logged to **Hedera Consensus Service (HCS)** for permanent, tamper-evident proof of submission.

Decryption and threat analysis occur exclusively on a simulated **air-gapped internal network** — isolated from the public internet — mirroring how real law enforcement environments protect sensitive intelligence.

### Design principles

| Principle | Implementation |
|-----------|----------------|
| **Zero trust** | The blind proxy strips IP, User-Agent, and identifying headers; it never sees plaintext |
| **End-to-end encryption** | Hybrid RSA-OAEP + AES-256-GCM in the browser via the Web Crypto API |
| **Privacy by design** | Only payload hashes — never report content — are written to the blockchain |
| **Air-gapped processing** | Decryption and Edge AI triage run on an isolated internal node |
| **Citizen safety** | EXIF metadata (GPS, device model, timestamps) is stripped from images before encryption |

---

## 🏗️ Tech Stack & Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CITIZEN BROWSER (Next.js)                      │
│  EXIF Strip → Hybrid E2EE (Web Crypto) → Encrypted Payload             │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BLIND PROXY (Node.js + Express)                       │
│  stripMetadata → Hash (SHA-256) → Hedera HCS → Fire-and-forget handoff  │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
                ▼                                     ▼
┌───────────────────────────┐       ┌─────────────────────────────────────┐
│   Hedera Hashgraph (HCS)  │       │   AIR-GAPPED INTERNAL NETWORK        │
│   Immutable hash log      │       │   RSA Decrypt → Edge AI Triage       │
│   Tracking Seed returned  │       │   Dashboard simulation (offline)     │
└───────────────────────────┘       └─────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **Encryption** | Web Crypto API — RSA-OAEP (SHA-256) + AES-256-GCM (no external crypto libs) |
| **Blind Proxy** | Node.js, Express 5, Helmet, CORS |
| **Blockchain** | Hedera Hashgraph — Consensus Service (`@hashgraph/sdk`, Testnet) |
| **Internal Node** | Node.js `crypto` (decryption), offline Edge AI keyword simulator |
| **Secure Delivery** | **SimpleX Chat** — self-hosted SMP relay, zero-identifier bot bridge, agency alerting |
| **Monorepo** | npm workspaces (`frontend` + `backend`) |
| **Containerization** | Docker Compose — MinIO S3 + SimpleX SMP Relay |

---

## ✨ Core Features

### 🖼️ Client-Side EXIF Metadata Stripping
JPEG uploads are sanitized in the browser before encryption. Native TypeScript logic parses JPEG binary structure and removes **APP1 (EXIF)** segments — eliminating GPS coordinates, device models, and capture timestamps. No third-party libraries; zero external calls.

### 🔐 Hybrid End-to-End Encryption (E2EE)
Reports are encrypted using a **hybrid scheme**:
1. A random **AES-256-GCM** symmetric key encrypts the payload.
2. The AES key is wrapped with the Law Enforcement **RSA-OAEP** public key.
3. Only the air-gapped internal server holds the matching private key.

### 🕶️ Stateless Blind Proxy
The Express backend acts as a zero-trust relay:
- Strips `req.ip`, `User-Agent`, forwarded IP headers, cookies, and referrers.
- Never decrypts report content.
- Forwards encrypted ciphertext to the internal network asynchronously.

### ⛓️ Blockchain Immutability (Hedera HCS)
After receiving a report, the proxy computes a **SHA-256 hash** of the encrypted bundle and submits it to an HCS topic. The citizen receives a **Tracking Seed** (`consensusTimestamp@sequenceNumber`) — permanent, unalterable proof that a submission occurred at a specific consensus time.

### 🧠 Isolated Decryption & Edge AI Analysis
On the simulated internal network:
1. **`decryptPayload`** unwraps the hybrid ciphertext using the pinned RSA private key.
2. **`analyzeThreatLevel`** runs an offline keyword-based triage engine (no external API calls).
3. A Law Enforcement Dashboard is logged to the console with priority, category, and routing (`NSS`, `POLICE`, `ANTI-CORRUPTION`, `SPAM`).

---

## 📁 Project Structure

```
anonymous-reporter/
├── frontend/                    # Next.js citizen-facing app
│   ├── src/
│   │   ├── app/                 # App Router pages & layout
│   │   ├── components/          # ReportForm.tsx
│   │   └── utils/               # crypto.ts, exif.ts, reportPayload.ts
│   └── .env.local               # Pinned LE public key (generated)
├── backend/                     # Blind proxy + internal simulation
│   ├── src/
│   │   ├── routes/              # POST /api/submit-report
│   │   ├── services/            # hedera.ts, forwardToInternalNetwork.ts, s3.ts, simplex.ts
│   │   ├── internal/            # decryption.ts, edge-ai.ts, mock-server.ts
│   │   └── middleware/          # stripMetadata.ts
│   ├── scripts/
│   │   ├── generate-keys.ts     # npm run setup:keys
│   │   �── create-topic.ts      # npm run setup:topic
│   └── .env                     # Hedera credentials + LE private key
├── docker-compose.yml           # MinIO S3 + SimpleX SMP Relay
└── package.json                 # Monorepo root (npm workspaces)
```

---

## ⚙️ Getting Started / Prerequisites

### System requirements

- **Node.js** ≥ 20.0.0
- **npm** ≥ 9
- A [Hedera Portal](https://portal.hedera.com) **Testnet** account with HBAR for topic creation and message submission

### Environment configuration

The project uses automated setup scripts for cryptographic keys and Hedera topics. Manual steps are limited to Hedera account credentials.

#### 1. 🔑 Pinned RSA Key Pair (E2EE)

Run `npm run setup:keys` to auto-generate and pin a dev key pair:

| Variable | Location | Purpose |
|----------|----------|---------|
| `LE_PRIVATE_KEY_PEM` | `backend/.env` | PKCS#8 private key — air-gapped decryption node |
| `NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM` | `frontend/.env.local` | SPKI public key — browser-side encryption |

> **Important:** Restart the frontend dev server after running `setup:keys` so Next.js picks up the new public key.

#### 2. 🌐 Hedera Testnet Credentials (ED25519)

Create a Testnet account at [portal.hedera.com](https://portal.hedera.com), then add credentials to `backend/.env`:

| Variable | Description |
|----------|-------------|
| `HEDERA_ACCOUNT_ID` | Operator account ID (e.g. `0.0.1234567`) |
| `HEDERA_PRIVATE_KEY` | ED25519 private key (DER hex string from the portal) |
| `HEDERA_TOPIC_ID` | HCS topic ID — auto-written by `npm run setup:topic` |

Copy the example file as a starting point:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your Hedera `HEDERA_ACCOUNT_ID` and `HEDERA_PRIVATE_KEY` before running `setup:topic`.

#### 3. 🌍 Frontend API URL (optional)

`frontend/.env.local` is created automatically by `setup:keys`. Default:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 🚀 Installation & Running

Run these commands **in order** from the repository root:

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Generate pinned RSA key pair

Creates matching public/private keys for E2EE across frontend and backend:

```bash
npm run setup:keys
```

### Step 3 — Configure Hedera credentials

Ensure `backend/.env` contains your Testnet `HEDERA_ACCOUNT_ID` and `HEDERA_PRIVATE_KEY`, then create an HCS topic:

```bash
npm run setup:topic
```

This executes `TopicCreateTransaction` on Hedera Testnet and writes `HEDERA_TOPIC_ID` to `backend/.env` automatically.

### Step 4 — Start development servers

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| **Frontend** (citizen app) | http://localhost:3000 |
| **Backend** (blind proxy) | http://localhost:3001 |
| **Health check** | http://localhost:3001/health |

### Additional commands

```bash
# Build for production
npm run build

# Run frontend or backend individually
npm run dev:frontend
npm run dev:backend

# Lint frontend
npm run lint
```

---

## 🔄 Submission Flow (End-to-End)

1. **Citizen** writes a report and optionally attaches a JPEG image.
2. **Browser** strips EXIF metadata, builds a JSON payload, and encrypts it with the pinned LE public key.
3. **Blind Proxy** receives ciphertext, strips all identifying metadata, and hashes the encrypted bundle.
4. **Hedera HCS** records the hash on-chain; the citizen receives a **Tracking Seed**.
5. **Internal Network** (async) decrypts the payload, runs offline Edge AI triage, and logs a dashboard alert.
6. **SimpleX Bot Bridge** delivers the tracking seed as an encrypted alert to agency contacts via a self-hosted SMP relay — no identifiers, no metadata leakage.

---

## 🔐 SimpleX Chat Secure Alerting

| Component | Purpose |
|-----------|---------|
| **SMP Relay** (`docker-compose.yml`) | Self-hosted message relay — zero dependency on external servers |
| **Bot Bridge** (`backend/src/services/simplex.ts`) | Headless SimpleX Chat bot, singleton service |
| **Alert Routing** | Post-HCS submission → tracking seed delivered to all connected agency contacts |
| **Non-blocking** | SimpleX failure does not fail the report — best-effort delivery |
| **License** | `simplex-chat` npm package used **unchanged** — AGPLv3 compliant |

---

## 🛡️ Security Notes

- This is an **MVP / simulation**. Production deployments require hardened key management (HSM/KMS), network segmentation, and audited cryptographic implementations.
- **Never commit** `.env` or `.env.local` files — they are listed in `.gitignore`.
- The blind proxy **must not** decrypt payloads or log plaintext.
- Only **SHA-256 hashes** of encrypted data are submitted to Hedera — never report content.

---

## 📄 License

Private — MVP demonstration project.

---

<p align="center">
  <strong>Built for zero-trust anonymous reporting.</strong><br/>
  Citizen safety · Cryptographic privacy · Immutable proof
</p>
