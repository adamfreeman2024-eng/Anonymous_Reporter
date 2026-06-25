import {
  createDecipheriv,
  createPrivateKey,
  privateDecrypt,
  constants,
} from "node:crypto";

export interface HybridEncryptedPayload {
  encryptedPayloadBase64: string;
  ivBase64: string;
  encryptedAesKeyBase64: string;
}

export class DecryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DecryptionError";
  }
}

const GCM_AUTH_TAG_LENGTH = 16;

function decodeBase64(value: string, field: string): Buffer {
  if (!value) {
    throw new DecryptionError(`Missing required field: ${field}`);
  }

  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new DecryptionError(`Invalid base64 in field: ${field}`);
  }
}

/**
 * Decrypts a hybrid-encrypted payload using the Law Enforcement RSA private key.
 * Mirrors the browser Web Crypto flow: RSA-OAEP (SHA-256) + AES-256-GCM.
 */
export function decryptPayload(
  encryptedPayload: HybridEncryptedPayload,
  privatePemKey: string,
): string {
  if (!privatePemKey.trim()) {
    throw new DecryptionError("Private key is required for decryption.");
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(privatePemKey);
  } catch (err) {
    throw new DecryptionError("Invalid RSA private key PEM.", { cause: err });
  }

  let aesKeyBytes: Buffer;
  try {
    const encryptedAesKey = decodeBase64(
      encryptedPayload.encryptedAesKeyBase64,
      "encryptedAesKeyBase64",
    );

    aesKeyBytes = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      encryptedAesKey,
    );
  } catch (err) {
    throw new DecryptionError("Failed to unwrap AES key with RSA private key.", {
      cause: err,
    });
  }

  if (aesKeyBytes.length !== 32) {
    throw new DecryptionError("Decrypted AES key has invalid length.");
  }

  const iv = decodeBase64(encryptedPayload.ivBase64, "ivBase64");
  const encryptedData = decodeBase64(
    encryptedPayload.encryptedPayloadBase64,
    "encryptedPayloadBase64",
  );

  if (encryptedData.length < GCM_AUTH_TAG_LENGTH) {
    throw new DecryptionError("Encrypted payload is too short to contain a GCM auth tag.");
  }

  const ciphertext = encryptedData.subarray(
    0,
    encryptedData.length - GCM_AUTH_TAG_LENGTH,
  );
  const authTag = encryptedData.subarray(
    encryptedData.length - GCM_AUTH_TAG_LENGTH,
  );

  try {
    const decipher = createDecipheriv("aes-256-gcm", aesKeyBytes, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch (err) {
    throw new DecryptionError("AES-GCM decryption failed. Payload may be corrupt or key mismatch.", {
      cause: err,
    });
  }
}
