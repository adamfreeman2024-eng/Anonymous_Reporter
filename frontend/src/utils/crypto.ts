export interface HybridEncryptedPayload {
  encryptedPayloadBase64: string;
  ivBase64: string;
  encryptedAesKeyBase64: string;
}

export class CryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CryptoError";
  }
}

const AES_KEY_LENGTH = 256;
const GCM_IV_LENGTH = 12;
const RSA_MODULUS_LENGTH = 2048;

/**
 * Encodes an ArrayBuffer (or TypedArray view) as a standard Base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.length === 0) {
    return "";
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * Decodes a Base64 string into an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (!base64) {
    throw new CryptoError("Base64 input cannot be empty.");
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    throw new CryptoError("Invalid Base64 string.");
  }
}

/**
 * Normalizes a PEM string from an environment variable (handles literal \\n sequences).
 */
export function normalizePemFromEnv(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

/**
 * Imports a Law Enforcement RSA-OAEP public key (SPKI PEM) for hybrid encryption.
 */
export async function importRSAPublicKey(pem: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new CryptoError(
      "Web Crypto API is unavailable. Use a secure context (HTTPS or localhost).",
    );
  }

  const normalized = normalizePemFromEnv(pem);

  if (!normalized.includes("BEGIN PUBLIC KEY")) {
    throw new CryptoError("Invalid PEM public key format.");
  }

  const base64 = normalized
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");

  let keyData: ArrayBuffer;
  try {
    keyData = base64ToArrayBuffer(base64);
  } catch {
    throw new CryptoError("Public key PEM contains invalid base64 data.");
  }

  try {
    return await crypto.subtle.importKey(
      "spki",
      keyData,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  } catch (err) {
    throw new CryptoError("Failed to import RSA public key.", { cause: err });
  }
}

/**
 * Generates an RSA-OAEP key pair for local testing.
 * Production: use importRSAPublicKey with a pinned LE public key instead.
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  if (!globalThis.crypto?.subtle) {
    throw new CryptoError(
      "Web Crypto API is unavailable. Use a secure context (HTTPS or localhost).",
    );
  }

  try {
    return await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: RSA_MODULUS_LENGTH,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (err) {
    throw new CryptoError("Failed to generate RSA key pair.", { cause: err });
  }
}

function assertEncryptPublicKey(publicKey: CryptoKey): void {
  if (publicKey.algorithm.name !== "RSA-OAEP") {
    throw new CryptoError(
      `Expected RSA-OAEP public key, received "${publicKey.algorithm.name}".`,
    );
  }

  if (!publicKey.usages.includes("encrypt")) {
    throw new CryptoError("Public key is not authorized for encryption.");
  }
}

/**
 * Hybrid encryption: AES-256-GCM for the payload, RSA-OAEP for the symmetric key.
 * Only the Law Enforcement private key holder can decrypt the report.
 */
export async function encryptPayload(
  text: string,
  publicKey: CryptoKey,
): Promise<HybridEncryptedPayload> {
  if (!globalThis.crypto?.subtle) {
    throw new CryptoError(
      "Web Crypto API is unavailable. Use a secure context (HTTPS or localhost).",
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new CryptoError("Cannot encrypt an empty message.");
  }

  assertEncryptPublicKey(publicKey);

  let aesKey: CryptoKey;
  let iv: Uint8Array<ArrayBuffer>;

  try {
    aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: AES_KEY_LENGTH },
      true,
      ["encrypt"],
    );

    iv = crypto.getRandomValues(
      new Uint8Array(new ArrayBuffer(GCM_IV_LENGTH)),
    ) as Uint8Array<ArrayBuffer>;
  } catch (err) {
    throw new CryptoError("Failed to prepare AES encryption key.", { cause: err });
  }

  const plaintext = new TextEncoder().encode(trimmed);

  let encryptedPayload: ArrayBuffer;
  let encryptedAesKey: ArrayBuffer;

  try {
    encryptedPayload = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintext,
    );
  } catch (err) {
    throw new CryptoError("AES-GCM encryption failed.", { cause: err });
  }

  try {
    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    encryptedAesKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      rawAesKey,
    );
  } catch (err) {
    throw new CryptoError(
      "RSA-OAEP key wrapping failed. The public key may be invalid or oversized for this key.",
      { cause: err },
    );
  }

  return {
    encryptedPayloadBase64: arrayBufferToBase64(encryptedPayload),
    ivBase64: arrayBufferToBase64(iv),
    encryptedAesKeyBase64: arrayBufferToBase64(encryptedAesKey),
  };
}

/**
 * Hybrid encryption with a pre-generated external AES key.
 * Use this when the same AES key must encrypt both the message and attached files.
 */
export async function encryptPayloadWithKey(
  text: string,
  publicKey: CryptoKey,
  rawAesKey: Uint8Array,
): Promise<HybridEncryptedPayload> {
  if (!globalThis.crypto?.subtle) {
    throw new CryptoError("Web Crypto API is unavailable.");
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new CryptoError("Cannot encrypt an empty message.");
  }

  if (rawAesKey.length !== 32) {
    throw new CryptoError("AES key must be 32 bytes (AES-256).");
  }

  assertEncryptPublicKey(publicKey);

  // Import the external raw AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
  const plaintext = new TextEncoder().encode(trimmed);

  let encryptedPayload: ArrayBuffer;
  let encryptedAesKey: ArrayBuffer;

  try {
    encryptedPayload = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintext,
    );
  } catch (err) {
    throw new CryptoError("AES-GCM encryption failed.", { cause: err });
  }

  try {
    encryptedAesKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      rawAesKey,
    );
  } catch (err) {
    throw new CryptoError("RSA-OAEP key wrapping failed.", { cause: err });
  }

  return {
    encryptedPayloadBase64: arrayBufferToBase64(encryptedPayload),
    ivBase64: arrayBufferToBase64(iv),
    encryptedAesKeyBase64: arrayBufferToBase64(encryptedAesKey),
  };
}
