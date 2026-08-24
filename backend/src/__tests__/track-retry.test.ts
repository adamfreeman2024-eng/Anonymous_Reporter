/**
 * B-8 (2026-08-24) — mirror-node retry/backoff tests.
 * Verifies: 429/503 retried with backoff then succeed; 400 input errors NOT
 * retried; permanent 502 errors thrown after retries exhaust; found=false
 * short-circuits (no retry on 404).
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const SEED = "1723123456.789012345@42";
const TOPIC = "0.0.12345";

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetchSequence(statuses: number[], finalBody?: unknown) {
  const calls: number[] = [];
  const fn = vi.fn(async () => {
    const status = statuses[calls.length] ?? 200;
    calls.push(status);
    if (status === 200) {
      return {
        ok: true,
        status: 200,
        json: async () =>
          finalBody ?? {
            sequence_number: 42,
            consensus_timestamp: "1723123456.789012345",
            message: Buffer.from("a".repeat(64)).toString("base64"),
            transaction_id: "0.0.1001@1-1",
          },
      };
    }
    return { ok: false, status };
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

describe("lookupTrackingSeed — mirror rate-limit retry/backoff", () => {
  it("retries a 429 then succeeds", async () => {
    const { lookupTrackingSeed } = await import("../services/track.js");
    const { calls } = stubFetchSequence([429, 200]);
    const r = await lookupTrackingSeed(SEED, TOPIC, "testnet");
    expect(r.found).toBe(true);
    expect(calls.length).toBe(2);
  });

  it("retries a 503 twice then succeeds (3 attempts total)", async () => {
    const { lookupTrackingSeed } = await import("../services/track.js");
    const { calls } = stubFetchSequence([503, 503, 200]);
    const r = await lookupTrackingSeed(SEED, TOPIC, "testnet");
    expect(r.found).toBe(true);
    expect(calls.length).toBe(3);
  }, 15_000);

  it("does NOT retry invalid-seed 400 errors", async () => {
    const { lookupTrackingSeed } = await import("../services/track.js");
    const { fn } = stubFetchSequence([429, 200]);
    await expect(
      lookupTrackingSeed("garbage", TOPIC, "testnet"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("gives up after retries on persistent throttling with 503", async () => {
    const { lookupTrackingSeed } = await import("../services/track.js");
    const { calls } = stubFetchSequence([429, 429, 429]);
    await expect(
      lookupTrackingSeed(SEED, TOPIC, "testnet"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(calls.length).toBe(3);
  }, 15_000);

  it("404 returns found=false immediately without retries", async () => {
    const { lookupTrackingSeed } = await import("../services/track.js");
    const { calls } = stubFetchSequence([404]);
    const r = await lookupTrackingSeed(SEED, TOPIC, "testnet");
    expect(r.found).toBe(false);
    expect(calls.length).toBe(1);
  });
});
