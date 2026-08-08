/**
 * Tests for the proof-of-work anti-abuse service.
 * Brute-forces a nonce with Node's sync crypto (fast) — mirrors the browser flow.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  canonicalHash,
  powDifficulty,
  verifyProofOfWork,
  type PowPayload,
} from "../services/pow.js";

const ORIGINAL_ENV = { ...process.env };
const PAYLOAD: PowPayload = {
  encryptedPayloadBase64: "QUFB",
  ivBase64: "QkJC",
  encryptedAesKeyBase64: "Q0ND",
};

beforeEach(() => {
  delete process.env.POW_DIFFICULTY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** Mirrors the client-side miner: find nonce with `bits/4` zero hex chars. */
function mine(payload: PowPayload, bits: number): string {
  const prefix = "0".repeat(bits / 4);
  const target = canonicalHash(payload);
  for (let nonce = 0; nonce < 10_000_000; nonce++) {
    const digest = createHash("sha256")
      .update(`${target}:${nonce}`)
      .digest("hex");
    if (digest.startsWith(prefix)) {
      return String(nonce);
    }
  }
  throw new Error("nonce not found within bound");
}

describe("canonicalHash", () => {
  it("is stable and hex", () => {
    const a = canonicalHash(PAYLOAD);
    const b = canonicalHash(PAYLOAD);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("powDifficulty", () => {
  it("defaults to 16 bits", () => {
    expect(powDifficulty()).toBe(16);
  });

  it("reads POW_DIFFICULTY and rejects invalid values", () => {
    process.env.POW_DIFFICULTY = "20";
    expect(powDifficulty()).toBe(20);
    process.env.POW_DIFFICULTY = "17"; // not a multiple of 4
    expect(powDifficulty()).toBe(16);
    process.env.POW_DIFFICULTY = "abc";
    expect(powDifficulty()).toBe(16);
  });
});

describe("verifyProofOfWork", () => {
  it("accepts a valid nonce and rejects neighbors", () => {
    const nonce = mine(PAYLOAD, 16);
    expect(verifyProofOfWork(PAYLOAD, nonce, 16)).toBe(true);

    const bad = String(Number(nonce) + 1);
    expect(verifyProofOfWork(PAYLOAD, bad, 16)).toBe(false);
  });

  it("rejects missing, non-numeric, and oversized nonces", () => {
    expect(verifyProofOfWork(PAYLOAD, undefined, 16)).toBe(false);
    expect(verifyProofOfWork(PAYLOAD, "", 16)).toBe(false);
    expect(verifyProofOfWork(PAYLOAD, "abc", 16)).toBe(false);
    expect(verifyProofOfWork(PAYLOAD, "1234567890", 16)).toBe(false); // 10 digits
  });

  it("respects a higher difficulty", () => {
    const nonce16 = mine(PAYLOAD, 16);
    // A 16-bit nonce should (almost certainly) fail a 20-bit check.
    expect(verifyProofOfWork(PAYLOAD, nonce16, 20)).toBe(false);

    const nonce20 = mine(PAYLOAD, 20);
    expect(verifyProofOfWork(PAYLOAD, nonce20, 20)).toBe(true);
  });
});
