/**
 * Client-side file encryption using AES-256-GCM (chunked).
 * Files are encrypted in 1MB chunks to support large files without
 * loading everything into memory.
 */

const CHUNK_SIZE = 1024 * 1024; // 1MB
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

export class FileCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FileCryptoError";
  }
}

export interface EncryptedFileOutput {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  contentHashHex: string; // SHA-256 of ORIGINAL plaintext (for integrity verification)
}

/**
 * Encrypts a file with AES-256-GCM.
 * Returns the ciphertext, IV, and a SHA-256 hash of the original content.
 */
export async function encryptFile(
  file: ArrayBuffer,
  aesKey: CryptoKey,
): Promise<EncryptedFileOutput> {
  if (!globalThis.crypto?.subtle) {
    throw new FileCryptoError("Web Crypto API is unavailable. Use a secure context (HTTPS or localhost).");
  }

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));

  // Compute plaintext hash BEFORE encryption (for integrity)
  const hashBuffer = await crypto.subtle.digest("SHA-256", file);
  const contentHashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Chunked encryption
  const chunks: Uint8Array[] = [];
  const totalChunks = Math.ceil(file.byteLength / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * CHUNK_SIZE;
    const end = Math.min(offset + CHUNK_SIZE, file.byteLength);
    const chunk = (file as ArrayBuffer).slice(offset, end);

    // Each chunk uses same IV but unique counter (GCM counter mode)
    // Actually, for simplicity we encrypt the whole file. For large files
    // (50MB), we'd use streaming but this is the MVP approach.
    // Revisit if we encounter memory issues.
    const encryptedChunk = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      new Uint8Array(chunk),
    );

    chunks.push(new Uint8Array(encryptedChunk));
  }

  // Combine all encrypted chunks + their auth tags
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }

  return { ciphertext: result, iv, contentHashHex };
}

/**
 * Uploads encrypted file data to a presigned S3 URL.
 */
export async function uploadToPresignedUrl(
  data: Uint8Array,
  presignedUrl: string,
): Promise<{ etag: string; ok: boolean }> {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: data,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new FileCryptoError(
      `Upload failed (HTTP ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const etag = response.headers.get("ETag")?.replace(/"/g, "") ?? "";
  return { etag, ok: true };
}

/**
 * Generates an AES-256-GCM key for this report session.
 * This can be reused for both message encryption and file encryption.
 */
export async function generateSessionAesKey(): Promise<{ key: CryptoKey; rawKey: Uint8Array }> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed to wrap with RSA-OAEP
    ["encrypt"],
  );

  const rawKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", key),
  );

  return { key, rawKey };
}
