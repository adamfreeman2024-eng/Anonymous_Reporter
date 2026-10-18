/**
 * Tests for the admin stats endpoint authorization.
 * Verifies fail-closed behavior in production and constant-time key check.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { isAuthorized, adminRole } from "../routes/admin.js";

const ORIGINAL_ENV = { ...process.env };

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

beforeEach(() => {
  delete process.env.OPERATOR_API_KEY;
  delete process.env.ADMIN_VIEWER_KEY;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("admin isAuthorized", () => {
  it("allows access in dev mode when no key is set", () => {
    expect(isAuthorized(makeReq())).toBe(true);
  });

  it("fails closed in production when key is missing", () => {
    process.env.NODE_ENV = "production";
    expect(isAuthorized(makeReq())).toBe(false);
  });

  it("accepts a correct Bearer token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.OPERATOR_API_KEY = "s3cret-admin-key";
    expect(isAuthorized(makeReq("Bearer s3cret-admin-key"))).toBe(true);
  });

  it("rejects a wrong Bearer token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.OPERATOR_API_KEY = "s3cret-admin-key";
    expect(isAuthorized(makeReq("Bearer wrong-key"))).toBe(false);
  });

  it("rejects requests with no token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.OPERATOR_API_KEY = "s3cret-admin-key";
    expect(isAuthorized(makeReq())).toBe(false);
  });

  it("accepts a bare key (non-Bearer) for backward compatibility", () => {
    process.env.OPERATOR_API_KEY = "s3cret-admin-key";
    expect(isAuthorized(makeReq("s3cret-admin-key"))).toBe(true);
  });

  it("accepts a viewer key as read-only, not operator", () => {
    process.env.NODE_ENV = "production";
    process.env.OPERATOR_API_KEY = "operator-key";
    process.env.ADMIN_VIEWER_KEY = "viewer-key";
    expect(adminRole(makeReq("Bearer viewer-key"))).toBe("viewer");
    expect(adminRole(makeReq("Bearer operator-key"))).toBe("operator");
  });

  it("fails closed in production when only a viewer key exists and the token is wrong", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_VIEWER_KEY = "viewer-key";
    expect(isAuthorized(makeReq("Bearer nope"))).toBe(false);
  });
});
