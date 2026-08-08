# Secrets & Key Ceremony — Anonymous_Reporter

Corporate-grade secret handling. Every secret below is **env-only** — never
committed, never baked into images.

## Inventory

| Secret | Where | Who holds | Notes |
|--------|-------|-----------|-------|
| `OPERATOR_API_KEY` | backend env | operator (you) | Admin `/api/admin/stats` auth; REQUIRED in production (fails closed) |
| `HEDERA_PRIVATE_KEY` | backend env | operator | Operator account key that submits hashes to HCS |
| `HEDERA_ACCOUNT_ID` / `HEDERA_TOPIC_ID` | backend env | operator / ministry | Network + topic for the hash anchor |
| `MINIO_ROOT_PASSWORD` / `MINIO_SECRET_KEY` | compose env | operator | Object storage |
| `INTERNAL_NETWORK_TOKEN` | backend + bridge env | operator + internal team | Bridge auth (Phase C) |
| `LE_PRIVATE_KEY_PEM` | **internal network only** | ministry/LE custodian | NEVER on the blind proxy |

## Generation

```bash
# Admin API key (production)
openssl rand -hex 32            # → e.g. 9f8e... (paste as OPERATOR_API_KEY)

# MinIO root password (production)
openssl rand -base64 24         # → e.g. xk9... (paste as MINIO_ROOT_PASSWORD)

# LE RSA-2048 key pair (internal network; run OFFLINE)
npm run setup:keys -w backend   # writes backend/data/keys/ (gitignored)
# Public key (SPKI PEM) → frontend build env NEXT_PUBLIC_LE_PUBLIC_KEY
# Private key (PKCS#8 PEM) → internal-network host env LE_PRIVATE_KEY_PEM
```

## Storage rules

1. **Production `.env` files are gitignored** (`.env`, `.env.local`, `docker/.env`).
2. Copy `docker/.env.production.example` → `docker/.env` and fill every value.
3. Generate `OPERATOR_API_KEY` and `MINIO_ROOT_PASSWORD` fresh per environment.
4. The LE private key has exactly **one** production home: the isolated internal
   network host (air-gapped). Never add it to the blind-proxy compose file.
5. HSM note (Phase D): ministry HSMs should hold `HEDERA_PRIVATE_KEY` and
   `LE_PRIVATE_KEY_PEM` once mainnet is active; the SDK operator can be set
   with a signing callback backed by the HSM.

## Rotation

- `OPERATOR_API_KEY`: rotate quarterly or on any suspected leak (change env, restart backend).
- `MINIO_ROOT_PASSWORD`: rotate quarterly.
- LE key pair: on ministry policy (typically yearly) — requires re-issuing the public key and redeploying the frontend.

## Incident

1. Revoke/rotate the affected secret.
2. If `LE_PRIVATE_KEY_PEM` ever touches a non-internal host: assume compromise,
   rotate the key pair, and re-issue the public key.
3. If `HEDERA_PRIVATE_KEY` leaks: the operator account has no funds on mainnet
   until Phase D; on testnet, rotate the key in portal.hedera.com and redeploy.
