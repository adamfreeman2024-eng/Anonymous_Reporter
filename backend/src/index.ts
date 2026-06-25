import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { reportRouter } from "./routes/report.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === "production";

// ── Trust proxy — disabled: we strip IPs, so no forwarding ──
app.set("trust proxy", false);

// ── Security headers ──
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false, // CSP-ն dev-ում խանգարում ա
    crossOriginEmbedderPolicy: false, // report attachments-ի համար
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);

// ── CORS — միայն frontend origin ──
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600, // preflight cache
  }),
);

// ── Body parser with size limit ──
app.use(express.json({ limit: "1mb" }));

// ── Global rate limiter (բոլոր endpoints) ──
const globalLimiter = rateLimit({
  windowMs: 60_000, // 1 րոպե
  max: isProduction ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use(globalLimiter);

// ── Strict rate limiter (միայն submit-report) ──
const reportLimiter = rateLimit({
  windowMs: 60_000, // 1 րոպե
  max: isProduction ? 10 : 100, // վայրկյանում 10 report-ից ավել չի անցնի
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many report submissions. Please wait before submitting again.",
  },
});

// ── Health check (no rate limit) ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "blind-proxy", env: process.env.NODE_ENV ?? "development" });
});

// ── Report endpoint with strict rate limit ──
app.use("/api/submit-report", reportLimiter, reportRouter);

// ── Graceful shutdown ──
import { closeHederaClient } from "./services/hedera.js";

process.on("SIGTERM", () => {
  console.info("[blind-proxy] SIGTERM received — shutting down gracefully");
  closeHederaClient();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.info("[blind-proxy] SIGINT received — shutting down gracefully");
  closeHederaClient();
  process.exit(0);
});

app.listen(PORT, () => {
  console.info(
    `[blind-proxy] Listening on http://localhost:${PORT} (${isProduction ? "production" : "development"})`,
  );
});
