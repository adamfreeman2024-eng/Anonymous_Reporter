import {
  decryptPayload,
  type HybridEncryptedPayload,
  DecryptionError,
} from "./decryption.js";
import { analyzeThreatLevel, type ThreatAnalysis } from "./edge-ai.js";
import { downloadObject } from "../services/s3.js";
import { createDecipheriv } from "node:crypto";

function getPrivateKeyPem(): string | null {
  const key = process.env.LE_PRIVATE_KEY_PEM?.trim();
  if (!key) return null;
  return key.replace(/\\n/g, "
");
}

interface ReportPayload {
  version: number;
  message?: string;
  attachment?: { fileName?: string };
  encryptedFiles?: { s3Key: string; iv: string; contentHash: string; fileName: string; mimeType: string; size: number; etag: string }[];
}

function extractAnalysisText(plaintext: string): string {
  try {
    const parsed = JSON.parse(plaintext) as ReportPayload;
    const parts: string[] = [];
    if (parsed.message) parts.push(parsed.message);
    if (parsed.encryptedFiles?.length) {
      parts.push(`[Attachments: ${parsed.encryptedFiles.map(f => f.fileName).join(", ")}]`);
    }
    return parts.join(" ");
  } catch {
    return plaintext;
  }
}

async function decryptFileContent(s3Key: string, ivBase64: string, aesKeyRaw: Buffer): Promise<Buffer> {
  const encryptedData = await downloadObject(s3Key);
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = encryptedData.subarray(encryptedData.length - 16);
  const ciphertext = encryptedData.subarray(0, encryptedData.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", aesKeyRaw, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function renderDashboard(analysis: ThreatAnalysis): void {
  const banner = "=".repeat(48);
  const icon = analysis.priority === "CRITICAL" ? "🚨" : analysis.priority === "HIGH" ? "⚠️" : "ℹ️";
  console.info(`
${banner}
 LAW ENFORCEMENT DASHBOARD
${banner}
${icon} ${analysis.priority}: ${analysis.category}
 Route: ${analysis.routeTo}
 Summary: ${analysis.summary}
${banner}
`);
}

export async function simulateInternalNetworkProcessing(
  encryptedPayload: HybridEncryptedPayload,
): Promise<void> {
  const privatePemKey = getPrivateKeyPem();
  if (!privatePemKey) {
    console.warn("[internal-network] LE_PRIVATE_KEY_PEM not configured — skipping.");
    return;
  }

  console.info("[internal-network] ▶ Receiving encrypted payload …");

  let plaintext: string;
  try {
    plaintext = decryptPayload(encryptedPayload, privatePemKey);
  } catch (err) {
    console.error(`[internal-network] ✖ Decryption failed: ${err instanceof DecryptionError ? err.message : err}`);
    return;
  }

  console.info("[internal-network] ✔ Payload decrypted.");

  // Parse payload to check for attached files
  let payload: ReportPayload;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    payload = { version: 1, message: plaintext };
  }

  // Decrypt attached files
  if (payload.encryptedFiles?.length) {
    // The AES key is already unwrapped by decryptPayload — we need access to it.
    // For MVP, log that files exist and would be decrypted.
    console.info(`[internal-network] 📎 ${payload.encryptedFiles.length} encrypted file(s) referenced:`);
    for (const f of payload.encryptedFiles) {
      console.info(`  - ${f.fileName} (${(f.size / 1024 / 1024).toFixed(1)}MB, S3: ${f.s3Key})`);
    }
  }

  const analysisText = extractAnalysisText(plaintext);
  const analysis = analyzeThreatLevel(analysisText);
  renderDashboard(analysis);
}
