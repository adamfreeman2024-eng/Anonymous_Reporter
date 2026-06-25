import { describe, it, expect } from "vitest";
import { decryptPayload, DecryptionError } from "../internal/decryption.js";
import { generateKeyPairSync } from "node:crypto";

// Generate a test RSA key pair for encryption/decryption testing
function generateTestKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

// Simulate browser-side hybrid encryption (mirrors frontend crypto.ts)
function simulateHybridEncrypt(
  plaintext: string,
  publicKeyPem: string,
): { encryptedPayloadBase64: string; ivBase64: string; encryptedAesKeyBase64: string } {
  const { publicEncrypt, randomBytes, createCipheriv } = require("node:crypto");

  // AES-256-GCM key
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);

  // Encrypt payload with AES-GCM
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const encryptedPayload = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encryptedPayload, authTag]);

  // Wrap AES key with RSA-OAEP
  const encryptedAesKey = publicEncrypt(
    {
      key: publicKeyPem,
      padding: require("node:crypto").constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey,
  );

  return {
    encryptedPayloadBase64: combined.toString("base64"),
    ivBase64: iv.toString("base64"),
    encryptedAesKeyBase64: encryptedAesKey.toString("base64"),
  };
}

describe("decryptPayload", () => {
  const { publicKey, privateKey } = generateTestKeyPair();

  it("decrypts a hybrid-encrypted payload correctly", () => {
    const message = "Այս հաղորդագրությունը գաղտնի է — This report is confidential";
    const encrypted = simulateHybridEncrypt(message, publicKey);
    const result = decryptPayload(encrypted, privateKey);
    expect(result).toBe(message);
  });

  it("handles empty messages", () => {
    const encrypted = simulateHybridEncrypt("", publicKey);
    const result = decryptPayload(encrypted, privateKey);
    expect(result).toBe("");
  });

  it("handles Unicode / Armenian text", () => {
    const message = "Բարև ձեզ, սա թեստային հաղորդագրություն է: 🛡️🔐";
    const encrypted = simulateHybridEncrypt(message, publicKey);
    const result = decryptPayload(encrypted, privateKey);
    expect(result).toBe(message);
  });

  it("handles long messages (10KB)", () => {
    const message = "x".repeat(10_000);
    const encrypted = simulateHybridEncrypt(message, publicKey);
    const result = decryptPayload(encrypted, privateKey);
    expect(result).toBe(message);
    expect(result.length).toBe(10_000);
  });

  it("throws DecryptionError with wrong private key", () => {
    const { publicKey: wrongPub, privateKey: wrongPriv } = generateTestKeyPair();
    const encrypted = simulateHybridEncrypt("secret", publicKey);
    expect(() => decryptPayload(encrypted, wrongPriv)).toThrow(DecryptionError);
  });

  it("throws DecryptionError on corrupted ciphertext", () => {
    const encrypted = simulateHybridEncrypt("secret", publicKey);
    // Corrupt the encrypted payload
    encrypted.encryptedPayloadBase64 = "AAAA" + encrypted.encryptedPayloadBase64.slice(4);
    expect(() => decryptPayload(encrypted, privateKey)).toThrow(DecryptionError);
  });

  it("throws DecryptionError with empty private key", () => {
    const encrypted = simulateHybridEncrypt("secret", publicKey);
    expect(() => decryptPayload(encrypted, "")).toThrow(DecryptionError);
    expect(() => decryptPayload(encrypted, "   ")).toThrow(DecryptionError);
  });

  it("throws DecryptionError with missing fields", () => {
    expect(() =>
      decryptPayload(
        { encryptedPayloadBase64: "", ivBase64: "", encryptedAesKeyBase64: "" },
        privateKey,
      ),
    ).toThrow(DecryptionError);
  });

  it("throws DecryptionError with invalid base64", () => {
    expect(() =>
      decryptPayload(
        {
          encryptedPayloadBase64: "!!!invalid!!!",
          ivBase64: "!!!invalid!!!",
          encryptedAesKeyBase64: "!!!invalid!!!",
        },
        privateKey,
      ),
    ).toThrow(DecryptionError);
  });
});
