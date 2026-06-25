import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { reportRouter } from "./routes/report.js";
import { uploadRouter } from "./routes/upload.js";

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

const globalLimiter = rateLimit({ windowMs: 60_000, max: isProduction ? 100 : 1000, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." }});
app.use(globalLimiter);

app.get("/health", (_req, res) => { res.json({ status: "ok", service: "blind-proxy" }); });

const strictLimiter = rateLimit({ windowMs: 60_000, max: isProduction ? 10 : 100, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions." }});
app.use("/api/submit-report", strictLimiter, reportRouter);
app.use("/api/get-upload-url", strictLimiter, uploadRouter);

import { closeHederaClient } from "./services/hedera.js";
import { closeS3Client } from "./services/s3.js";

process.on("SIGTERM", () => { console.info("[blind-proxy] SIGTERM — shutting down"); closeHederaClient(); closeS3Client(); process.exit(0); });
process.on("SIGINT", () => { console.info("[blind-proxy] SIGINT — shutting down"); closeHederaClient(); closeS3Client(); process.exit(0); });

app.listen(PORT, () => { console.info(`[blind-proxy] Listening on http://localhost:${PORT} (${isProduction ? "production" : "development"})`); });
