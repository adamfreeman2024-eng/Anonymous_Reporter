/**
 * Client-side Proof-of-Work — mirrors the backend algorithm in
 * `backend/src/services/pow.ts`. Zero external crypto (Web Crypto only).
 *
 * findNonce searches for `nonce` such that
 *   sha256(canonicalHash(payload) + ":" + nonce)
 * starts with `difficultyBits/4` zero hex characters.
 */

export interface PowPayload {
  encryptedPayloadBase64: string;
  ivBase64: string;
  encryptedAesKeyBase64: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function canonicalHashHex(payload: PowPayload): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      encryptedPayloadBase64: payload.encryptedPayloadBase64,
      ivBase64: payload.ivBase64,
      encryptedAesKeyBase64: payload.encryptedAesKeyBase64,
    }),
  );
}

/**
 * Searches for a valid nonce. Yields to the event loop every 65536 attempts
 * so the UI stays responsive; reports progress via `onProgress`.
 */
export async function findNonce(
  payload: PowPayload,
  difficultyBits = 16,
  onProgress?: (attempts: number) => void,
): Promise<string> {
  const prefix = "0".repeat(Math.max(0, Math.floor(difficultyBits / 4)));
  const target = await canonicalHashHex(payload);

  let nonce = 0;
  for (;;) {
    const digest = await sha256Hex(`${target}:${nonce}`);
    if (digest.startsWith(prefix)) {
      return String(nonce);
    }
    nonce++;
    if (nonce % 65536 === 0) {
      onProgress?.(nonce);
      // Let the UI breathe between batches.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
