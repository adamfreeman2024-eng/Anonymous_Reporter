import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { stripMetadata } from "../middleware/stripMetadata.js";
import { simulateInternalNetworkProcessing } from "../internal/mock-server.js";
import {
  forwardToInternalNetwork,
  type Destination,
  type EncryptedPayload,
} from "../services/forwardToInternalNetwork.js";
import { HederaServiceError, submitHashToHCS } from "../services/hedera.js";

const VALID_DESTINATIONS: Destination[] = [
  "police",
  "nss",
  "anti-corruption",
];

function hashEncryptedPayload(encrypted: EncryptedPayload): string {
  const canonical = JSON.stringify({
    encryptedPayloadBase64: encrypted.encryptedPayloadBase64,
    ivBase64: encrypted.ivBase64,
    encryptedAesKeyBase64: encrypted.encryptedAesKeyBase64,
  });

  return createHash("sha256").update(canonical).digest("hex");
}

function getTopicId(): string {
  const topicId = process.env.HEDERA_TOPIC_ID?.trim();
  if (!topicId) {
    throw new HederaServiceError(
      "HEDERA_TOPIC_ID is not configured on the server.",
      500,
    );
  }
  return topicId;
}

export const reportRouter = Router();

// Zero-trust: strip identifying metadata before any handler logic runs.
reportRouter.use(stripMetadata);

reportRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { encrypted, destination } = req.body as {
      encrypted?: EncryptedPayload;
      destination?: string;
    };

    if (
      !encrypted?.encryptedPayloadBase64 ||
      !encrypted?.ivBase64 ||
      !encrypted?.encryptedAesKeyBase64
    ) {
      res.status(400).json({ error: "Invalid encrypted payload." });
      return;
    }

    if (!destination || !VALID_DESTINATIONS.includes(destination as Destination)) {
      res.status(400).json({ error: "Invalid destination." });
      return;
    }

    const forwardResult = await forwardToInternalNetwork(
      encrypted,
      destination as Destination,
    );

    if (!forwardResult.accepted) {
      res.status(502).json({ error: "Internal network rejected the report." });
      return;
    }

    const payloadHash = hashEncryptedPayload(encrypted);
    const hcsResult = await submitHashToHCS(payloadHash, getTopicId());

    // Fire-and-forget: hand encrypted payload to the air-gapped internal network.
    void simulateInternalNetworkProcessing(encrypted).catch((err: unknown) => {
      console.error(
        "[internal-network] Unhandled processing error:",
        err instanceof Error ? err.message : err,
      );
    });

    res.status(201).json({
      success: true,
      consensusTimestamp: hcsResult.consensusTimestamp,
      sequenceNumber: hcsResult.sequenceNumber,
      transactionId: hcsResult.transactionId,
      trackingSeed: `${hcsResult.consensusTimestamp}@${hcsResult.sequenceNumber}`,
    });
  } catch (err) {
    if (err instanceof HederaServiceError) {
      console.error("[submit-report] Hedera error:", err.message);
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    console.error("[submit-report] Unexpected error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});
