import type { Request, Response, NextFunction } from "express";

/**
 * Blind-proxy middleware: strips all identifying metadata from the request
 * before it reaches route handlers. The proxy must remain stateless.
 */
export function stripMetadata(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Remove IP-derived identifiers
  delete (req as { ip?: string }).ip;
  Object.defineProperty(req.socket, "remoteAddress", {
    value: undefined,
    writable: true,
    configurable: true,
  });

  // Strip client-identifying headers
  delete req.headers["user-agent"];
  delete req.headers["x-forwarded-for"];
  delete req.headers["x-real-ip"];
  delete req.headers["cf-connecting-ip"];
  delete req.headers["true-client-ip"];
  delete req.headers["x-client-ip"];
  delete req.headers["forwarded"];
  delete req.headers["via"];
  delete req.headers["referer"];
  delete req.headers["origin"];
  delete req.headers["cookie"];
  delete req.headers["authorization"];

  next();
}
