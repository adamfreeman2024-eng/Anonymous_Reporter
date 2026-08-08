/**
 * Tests for Hedera HCS submission validation (fail-fast, no network calls).
 * Validates payload-hash format, topic format, and network selection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HederaServiceError, submitHashToHCS } from "../services/hedera.js";

const ORIGINAL_ENV = { ...process.env };
const VALID_HASH = "a".repeat(64);
const VALID_TOPIC = "0.0.12345";

beforeEach(() => {
  process.env.HEDERA_ACCOUNT_ID = "0.0.1001";
  process.env.HEDERA_PRIVATE_KEY = "302e020100300506032b657004220420" + "b".repeat(56);
  process.env.HEDERA_TOPIC_ID = VALID_TOPIC;
  process.env.HEDERA_NETWORK = "testnet";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("submitHashToHCS validation", () => {
  it("rejects a malformed payload hash with 400", async () => {
    await expect(submitHashToHCS("not-a-hash", VALID_TOPIC)).rejects.toMatchObject({
      name: "HederaServiceError",
      statusCode: 400,
    });
  });

  it("rejects a malformed topic id with 400", async () => {
    await expect(submitHashToHCS(VALID_HASH, "0.0")).rejects.toMatchObject({
      name: "HederaServiceError",
      statusCode: 400,
    });
    await expect(submitHashToHCS(VALID_HASH, "topic-abc")).rejects.toMatchObject({
      name: "HederaServiceError",
      statusCode: 400,
    });
  });

  it("rejects an unsupported HEDERA_NETWORK with 500 before any network call", async () => {
    process.env.HEDERA_NETWORK = "moonnet";
    await expect(submitHashToHCS(VALID_HASH, VALID_TOPIC)).rejects.toMatchObject({
      name: "HederaServiceError",
      statusCode: 500,
      message: expect.stringContaining("Unsupported HEDERA_NETWORK"),
    });
  });

  it("throws HederaServiceError (not TypeError) for invalid hash format", async () => {
    try {
      await submitHashToHCS("", VALID_TOPIC);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HederaServiceError);
    }
  });
});
