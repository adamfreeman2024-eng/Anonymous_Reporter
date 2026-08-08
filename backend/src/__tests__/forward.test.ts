/**
 * Tests for internal-network forwarding.
 * Verifies the mock (dev) path and the real HTTP path with INTERNAL_NETWORK_URL.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import {
  forwardToInternalNetwork,
  InternalForwardError,
  type EncryptedPayload,
} from "../services/forwardToInternalNetwork.js";

const ORIGINAL_ENV = { ...process.env };
const PAYLOAD: EncryptedPayload = {
  encryptedPayloadBase64: "AAAA",
  ivBase64: "BBBB",
  encryptedAesKeyBase64: "CCCC",
};

beforeEach(() => {
  delete process.env.INTERNAL_NETWORK_URL;
  delete process.env.ENABLE_INTERNAL_MOCK;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("forwardToInternalNetwork", () => {
  it("accepts in dev mock mode without INTERNAL_NETWORK_URL", async () => {
    process.env.NODE_ENV = "development";
    const result = await forwardToInternalNetwork(PAYLOAD, "police");
    expect(result.accepted).toBe(true);
    expect(result.referenceId).toMatch(/^[a-f0-9]{16}$/);
  });

  it("accepts when ENABLE_INTERNAL_MOCK=1", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_INTERNAL_MOCK = "1";
    const result = await forwardToInternalNetwork(PAYLOAD, "nss");
    expect(result.accepted).toBe(true);
  });

  it("fails closed in production without URL or mock", async () => {
    process.env.NODE_ENV = "production";
    await expect(forwardToInternalNetwork(PAYLOAD, "police")).rejects.toThrow(
      InternalForwardError,
    );
  });

  it("POSTs ciphertext to the internal bridge and returns its referenceId", async () => {
    let receivedBody: string | null = null;
    let receivedPath = "";

    const server: Server = createServer((req, res) => {
      receivedPath = req.url ?? "";
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedBody = body;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ referenceId: "internal-ref-123" }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test server did not bind");
    }
    const port = address.port;

    try {
      process.env.NODE_ENV = "production";
      process.env.INTERNAL_NETWORK_URL = `http://127.0.0.1:${port}`;

      const result = await forwardToInternalNetwork(PAYLOAD, "anti-corruption");
      expect(result.accepted).toBe(true);
      expect(result.referenceId).toBe("internal-ref-123");
      expect(receivedPath).toBe("/ingest");
      expect(receivedBody).toContain('"encrypted"');
      expect(receivedBody).toContain('"destination":"anti-corruption"');
    } finally {
      server.close();
    }
  });

  it("throws 502 when the internal bridge rejects", async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test server did not bind");
    }

    try {
      process.env.NODE_ENV = "production";
      process.env.INTERNAL_NETWORK_URL = `http://127.0.0.1:${address.port}`;
      await expect(forwardToInternalNetwork(PAYLOAD, "police")).rejects.toThrow(
        "Internal network rejected the report (HTTP 500).",
      );
    } finally {
      server.close();
    }
  });
});
