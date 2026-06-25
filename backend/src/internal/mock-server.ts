import {
  decryptPayload,
  type HybridEncryptedPayload,
  DecryptionError,
} from "./decryption.js";
import { analyzeThreatLevel, type ThreatAnalysis } from "./edge-ai.js";

function getPrivateKeyPem(): string | null {
  const key = process.env.LE_PRIVATE_KEY_PEM?.trim();
  if (!key) {
    return null;
  }
  return key.replace(/\\n/g, "\n");
}

function extractAnalysisText(plaintext: string): string {
  try {
    const parsed = JSON.parse(plaintext) as {
      message?: string;
      attachment?: { fileName?: string };
    };

    if (parsed.message) {
      const attachmentNote = parsed.attachment?.fileName
        ? ` [Attachment: ${parsed.attachment.fileName}]`
        : "";
      return `${parsed.message}${attachmentNote}`;
    }
  } catch {
    // Plaintext is not JSON — analyze as-is.
  }

  return plaintext;
}

function renderDashboard(analysis: ThreatAnalysis): void {
  const banner = "═".repeat(48);
  const priorityIcon =
    analysis.priority === "CRITICAL"
      ? "🚨"
      : analysis.priority === "HIGH"
        ? "⚠️"
        : "ℹ️";

  const headline =
    analysis.priority === "CRITICAL"
      ? `${priorityIcon} CRITICAL THREAT DETECTED: Routed to ${analysis.routeTo}`
      : analysis.priority === "HIGH"
        ? `${priorityIcon} HIGH-PRIORITY ALERT: Routed to ${analysis.routeTo}`
        : `${priorityIcon} REPORT PROCESSED: Routed to ${analysis.routeTo}`;

  console.info("");
  console.info(banner);
  console.info("  LAW ENFORCEMENT DASHBOARD (AIR-GAPPED)");
  console.info(banner);
  console.info(headline);
  console.info(`  Category:  ${analysis.category}`);
  console.info(`  Priority:  ${analysis.priority}`);
  console.info(`  Summary:   ${analysis.summary}`);
  console.info(banner);
  console.info("");
}

/**
 * Simulates the isolated internal network: decrypt → Edge AI triage → dashboard log.
 * Intended to run fire-and-forget after the blind proxy hands off encrypted data.
 */
export async function simulateInternalNetworkProcessing(
  encryptedPayload: HybridEncryptedPayload,
): Promise<void> {
  const privatePemKey = getPrivateKeyPem();

  if (!privatePemKey) {
    console.warn(
      "[internal-network] LE_PRIVATE_KEY_PEM not configured — skipping air-gapped processing.",
    );
    return;
  }

  console.info("[internal-network] ▶ Receiving encrypted payload over internal firewall …");

  let plaintext: string;
  try {
    plaintext = decryptPayload(encryptedPayload, privatePemKey);
  } catch (err) {
    const message =
      err instanceof DecryptionError
        ? err.message
        : "Unknown decryption failure.";
    console.error(`[internal-network] ✖ Decryption failed: ${message}`);
    return;
  }

  console.info("[internal-network] ✔ Payload decrypted on isolated node.");
  console.info("[internal-network] ▶ Running offline Edge AI threat analysis …");

  const analysisText = extractAnalysisText(plaintext);
  const analysis = analyzeThreatLevel(analysisText);

  renderDashboard(analysis);
}
