/**
 * Tests for the blind-proxy metadata stripping middleware.
 * Verifies that identifying metadata never reaches route handlers.
 */
import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { stripMetadata } from "../middleware/stripMetadata.js";

function makeReq(headers: Record<string, string>): Request {
  const socket = { remoteAddress: "1.2.3.4" };
  return {
    ip: "1.2.3.4",
    headers: { ...headers },
    socket,
  } as unknown as Request;
}

function runMiddleware(req: Request): Request {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };
  const res = {} as Response;
  stripMetadata(req, res, next);
  expect(called).toBe(true);
  return req;
}

describe("stripMetadata", () => {
  it("strips IP-derived identifiers", () => {
    const req = runMiddleware(makeReq({}));
    expect((req as { ip?: string }).ip).toBeUndefined();
    expect((req.socket as { remoteAddress?: string }).remoteAddress).toBeUndefined();
  });

  it("strips all identifying headers", () => {
    const req = runMiddleware(
      makeReq({
        "user-agent": "curl/8.0",
        "x-forwarded-for": "10.0.0.1",
        "x-real-ip": "10.0.0.1",
        "cf-connecting-ip": "10.0.0.1",
        "true-client-ip": "10.0.0.1",
        "x-client-ip": "10.0.0.1",
        forwarded: "for=10.0.0.1",
        via: "1.1 proxy",
        referer: "https://example.com",
        origin: "https://example.com",
        cookie: "session=abc",
        authorization: "Bearer secret",
      }),
    );
    for (const h of [
      "user-agent",
      "x-forwarded-for",
      "x-real-ip",
      "cf-connecting-ip",
      "true-client-ip",
      "x-client-ip",
      "forwarded",
      "via",
      "referer",
      "origin",
      "cookie",
      "authorization",
    ]) {
      expect(req.headers[h]).toBeUndefined();
    }
  });

  it("keeps non-identifying headers (content-type, accept)", () => {
    const req = runMiddleware(
      makeReq({
        "content-type": "application/json",
        accept: "application/json",
      }),
    );
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.headers.accept).toBe("application/json");
  });

  it("does not throw on empty headers", () => {
    expect(() => runMiddleware(makeReq({}))).not.toThrow();
  });
});
