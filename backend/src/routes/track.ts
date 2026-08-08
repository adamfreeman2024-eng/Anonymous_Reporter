import { Router, type Request, type Response } from "express";
import { lookupTrackingSeed, TrackError } from "../services/track.js";

/**
 * Public verification endpoint — a citizen proves their report is on-chain
 * using the tracking seed. Reads only the HCS hash from the mirror node;
 * no operator key, no identity, no plaintext.
 */
export const trackRouter = Router();

trackRouter.get("/:seed", async (req: Request, res: Response) => {
  const seed = String(req.params.seed ?? "").trim();
  const topicId = process.env.HEDERA_TOPIC_ID?.trim();
  const network = (process.env.HEDERA_NETWORK ?? "testnet").trim().toLowerCase();

  if (!topicId) {
    res.status(503).json({ error: "HEDERA_TOPIC_ID is not configured." });
    return;
  }

  try {
    const result = await lookupTrackingSeed(seed, topicId, network);
    res.json({ ok: true, seed, ...result });
  } catch (err) {
    if (err instanceof TrackError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error." });
  }
});
