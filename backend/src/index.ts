import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { reportRouter } from "./routes/report.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.set("trust proxy", false);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "blind-proxy" });
});

app.use("/api/submit-report", reportRouter);

app.listen(PORT, () => {
  console.info(`[blind-proxy] Listening on http://localhost:${PORT}`);
});
