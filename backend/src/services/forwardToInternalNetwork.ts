import { createHash } from "node:crypto";

export interface EncryptedPayload {
  encryptedPayloadBase64: string;
  ivBase64: string;
  encryptedAesKeyBase64: string;
}

export type Destination = "police" | "nss" | "anti-corruption";

export interface InternalForwardResult {
  accepted: boolean;
  referenceId: string;
}

/**
 * Simulates forwarding the encrypted payload to an isolated law-enforcement
 * internal network. The blind proxy never decrypts the payload.
 */
export async function forwardToInternalNetwork(
  encryptedPayload: EncryptedPayload,
  destination: Destination,
): Promise<InternalForwardResult> {
  const referenceId = createHash("sha256")
    .update(JSON.stringify({ encryptedPayload, destination }))
    .digest("hex")
    .slice(0, 16);

  console.info(
    `[forwardToInternalNetwork] Mock forward to "${destination}" — ref: ${referenceId}`,
  );

  return {
    accepted: true,
    referenceId,
  };
}
