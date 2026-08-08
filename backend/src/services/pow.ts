/**
 * Captcha-less anti-abuse: client-side Proof-of-Work.
 *
 * The reporter's browser finds a `nonce` such that
 *   sha256(canonicalHash(payload) + ":" + nonce)
 * starts with `difficulty/4` zero hex characters. The blind proxy verifies
 * the same condition in microseconds. This raises the per-report cost for
 * bulk spam without any captcha, and without requiring HBAR.
 *
 * Zero external crypto — Node `crypto` here, Web Crypto on the client.
 * The frontend mirrors this algorithm in `frontend/src/utils/pow.ts`.
 */
import { createHash } from "node:crypto";

export interface PowPayload {
  encryptedPayloadBase64: string;
  ivBase64: string;
  encryptedAesKeyBase64: string;
}

/** Canonical SHA-256 of the encrypted payload — identical shape to report.ts. */
export function canonicalHash(payload: PowPayload): string {
  const canonical = JSON.stringify({
    encryptedPayloadBase64: payload.encryptedPayloadBase64,
    ivBase64: payload.ivBase64,
    encryptedAesKeyBase64: payload.encryptedAesKeyBase64,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

const DEFAULT_DIFFICULTY = 16; // 4 zero hex chars ≈ 65k hashes on average

/** Effective difficulty — env `POW_DIFFICULTY`, multiples of 4 only. */
export function powDifficulty(): number {
  const raw = process.env.POW_DIFFICULTY?.trim();
  const n = raw ? Number(raw) : DEFAULT_DIFFICULTY;
  if (!Number.isInteger(n) || n < 0 || n > 128 || n % 4 !== 0) {
    return DEFAULT_DIFFICULTY;
  }
  return n;
}

/**
 * Verifies the client's proof-of-work for a payload.
 * Nonce must be a decimal integer string (≤ 9 digits).
 */
export function verifyProofOfWork(
  payload: PowPayload,
  nonce: string | number | undefined | null,
  difficultyBits?: number,
): boolean {
  const bits = difficultyBits ?? powDifficulty();
  const n = String(nonce ?? "");
  if (!/^\d{1,9}$/.test(n)) {
    return false;
  }

  const prefix = "0".repeat(bits / 4);
  const digest = createHash("sha256")
    .update(`${canonicalHash(payload)}:${n}`)
    .digest("hex");
  return digest.startsWith(prefix);
}
