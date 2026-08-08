import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { reportRouter } from "./routes/report.js";
import { adminRouter } from "./routes/admin.js";
import { uploadRouter } from "./routes/upload.js";
import { checkStorageReady } from "./services/s3.js";
import { hederaConfigReady } from "./services/hedera.js";
import { log } from "./services/logger.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", false);

app.use(helmet({
  contentSecurityPolicy: isProduction ? { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] }} : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
}));

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000", methods: ["POST"], allowedHeaders: ["Content-Type"], maxAge: 600 }));
app.use(express.json({ limit: "1mb" }));

// Request correlation id — logs only, never stored, never returned to the client.
app.use((req, _res, next) => {
  (req as express.Request & { id?: string }).id = randomUUID();
  next();
});

const globalLimiter = rateLimit({ windowMs: 60_000, max: isProduction ? 100 : 1000, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." }});
app.use(globalLimiter);

app.get("/health", (_req, res) => { res.json({ status: "ok", service: "blind-proxy" }); });

// Readiness: 200 when storage + Hedera config are ready, 503 otherwise.
app.get("/health/ready", async (_req, res) => {
  const storage = await checkStorageReady();
  const hedera = hederaConfigReady();
  const ok = storage.ready && hedera.ready;
  res.status(ok ? 200 : 503).json({
    ok,
    service: "blind-proxy",
    storage: storage.ready ? "ok" : storage.error ?? "unavailable",
    hedera: hedera.ready ? "configured" : `missing: ${hedera.missing.join(", ")}`,
  });
});

const strictLimiter = rateLimit({ windowMs: 60_000, max: isProduction ? 10 : 100, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions." }});
app.use("/api/submit-report", strictLimiter, reportRouter);
app.use("/api/get-upload-url", strictLimiter, uploadRouter);
app.use("/api/admin", adminRouter);

import { closeHederaClient } from "./services/hedera.js";
import { closeS3Client } from "./services/s3.js";
import { getSimplexService } from "./services/simplex.js";

process.on("SIGTERM", () => {
  log("info", "server.sigterm");
  closeHederaClient();
  closeS3Client();
  // SimpleX shutdown is async but we're exiting — fire and forget
  const simplex = (() => { try { return getSimplexService(); } catch { return null; } })();
  if (simplex) simplex.shutdown().catch(() => {});
  process.exit(0);
});
process.on("SIGINT", () => {
  log("info", "server.sigint");
  closeHederaClient();
  closeS3Client();
  const simplex = (() => { try { return getSimplexService(); } catch { return null; } })();
  if (simplex) simplex.shutdown().catch(() => {});
  process.exit(0);
});

app.listen(PORT, () => {
  log("info", "server.listening", { port: PORT, mode: isProduction ? "production" : "development" });
});
