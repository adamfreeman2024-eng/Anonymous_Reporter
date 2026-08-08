/**
 * Tests for tracking-seed verification against the Hedera mirror node.
 * Uses a stubbed global fetch — no real network calls.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  lookupTrackingSeed,
  mirrorNodeBaseUrl,
  parseTrackingSeed,
  hashEncryptedPayloadFields,
} from "../services/track.js";

const TOPIC = "0.0.12345";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseTrackingSeed", () => {
  it("parses a valid seed", () => {
    const parsed = parseTrackingSeed("1723123456.789012345@42");
    expect(parsed).toEqual({
      consensusTimestamp: "1723123456.789012345",
      sequenceNumber: 42,
    });
  });

  it("rejects malformed seeds", () => {
    expect(parseTrackingSeed("abc")).toBeNull();
    expect(parseTrackingSeed("1723123456.789012345")).toBeNull();
    expect(parseTrackingSeed("@42")).toBeNull();
    expect(parseTrackingSeed("")).toBeNull();
  });
});

describe("mirrorNodeBaseUrl", () => {
  it("selects testnet by default and mainnet when asked", () => {
    expect(mirrorNodeBaseUrl("testnet")).toContain("testnet.mirrornode");
    expect(mirrorNodeBaseUrl("mainnet")).toContain("mainnet-public.mirrornode");
  });
});

describe("lookupTrackingSeed", () => {
  it("returns found=false on mirror 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      }),
    );
    const result = await lookupTrackingSeed("1723123456.789012345@42", TOPIC, "testnet");
    expect(result.found).toBe(false);
  });

  it("decodes the on-chain hash from the mirror message", async () => {
    const payloadHash = "a".repeat(64);
    const message = Buffer.from(payloadHash, "utf8").toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          sequence_number: 42,
          consensus_timestamp: "1723123456.789012345",
          message,
          transaction_id: "0.0.1001-1723123456-789",
        }),
      }),
    );
    const result = await lookupTrackingSeed("1723123456.789012345@42", TOPIC, "testnet");
    expect(result.found).toBe(true);
    expect(result.payloadHash).toBe(payloadHash);
    expect(result.sequenceNumber).toBe(42);
    expect(result.topicId).toBe(TOPIC);
  });

  it("rejects an invalid seed with 400", async () => {
    await expect(lookupTrackingSeed("nope", TOPIC, "testnet")).rejects.toMatchObject({
      name: "TrackError",
      statusCode: 400,
    });
  });

  it("maps network failure to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    await expect(
      lookupTrackingSeed("1723123456.789012345@42", TOPIC, "testnet"),
    ).rejects.toMatchObject({ name: "TrackError", statusCode: 502 });
  });
});

describe("hashEncryptedPayloadFields", () => {
  it("produces a canonical sha256 hex", () => {
    const h = hashEncryptedPayloadFields("AAA", "BBB", "CCC");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
