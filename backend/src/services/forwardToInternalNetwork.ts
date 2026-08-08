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

export class InternalForwardError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "InternalForwardError";
    this.statusCode = statusCode;
  }
}

const FORWARD_TIMEOUT_MS = 10_000;
const FORWARD_RETRIES = 1;

/**
 * Forwards the encrypted payload to the isolated law-enforcement internal
 * network bridge. The blind proxy never decrypts the payload — it only
 * relays ciphertext over a private channel.
 *
 * - When INTERNAL_NETWORK_URL is set (production), POSTs the ciphertext to
 *   `<url>/ingest` with a short timeout and one retry.
 * - Otherwise (development) falls back to an in-process mock that always
 *   accepts. The mock must NEVER run with LE_PRIVATE_KEY_PEM on the proxy.
 */
export async function forwardToInternalNetwork(
  encryptedPayload: EncryptedPayload,
  destination: Destination,
): Promise<InternalForwardResult> {
  const internalUrl = process.env.INTERNAL_NETWORK_URL?.trim();
  const mockOnly = process.env.ENABLE_INTERNAL_MOCK === "1" || process.env.NODE_ENV !== "production";

  if (!internalUrl && !mockOnly) {
    throw new InternalForwardError(
      "INTERNAL_NETWORK_URL is not configured and mock forwarding is disabled.",
      503,
    );
  }

  if (!internalUrl) {
    return mockForward(encryptedPayload, destination);
  }

  return httpForward(internalUrl, encryptedPayload, destination);
}

async function httpForward(
  baseUrl: string,
  encryptedPayload: EncryptedPayload,
  destination: Destination,
): Promise<InternalForwardResult> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/ingest`;
  const body = JSON.stringify({ encrypted: encryptedPayload, destination });

  let lastError: unknown;
  for (let attempt = 0; attempt <= FORWARD_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new InternalForwardError(
            `Internal network rejected the report (HTTP ${res.status}).`,
            502,
          );
        }
        const data = (await res.json().catch(() => ({}))) as {
          referenceId?: string;
        };
        return {
          accepted: true,
          referenceId: data.referenceId ?? createReferenceId(encryptedPayload, destination),
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err;
      if (err instanceof InternalForwardError) {
        // Non-transient HTTP rejection — do not retry.
        throw err;
      }
    }
  }

  throw new InternalForwardError(
    "Internal network is unreachable. The report was not forwarded.",
    502,
    { cause: lastError },
  );
}

function mockForward(
  encryptedPayload: EncryptedPayload,
  destination: Destination,
): InternalForwardResult {
  const referenceId = createReferenceId(encryptedPayload, destination);

  console.info(
    `[forwardToInternalNetwork] Mock forward to "${destination}" — ref: ${referenceId}`,
  );

  return {
    accepted: true,
    referenceId,
  };
}

function createReferenceId(
  encryptedPayload: EncryptedPayload,
  destination: Destination,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ encryptedPayload, destination }))
    .digest("hex")
    .slice(0, 16);
}
