/**
 * Tracking-seed verification against the Hedera mirror node.
 *
 * A citizen can prove their report is on-chain with the tracking seed
 * returned at submission (`<consensusTimestamp>@<sequenceNumber>`):
 * the mirror node returns the HCS message (the SHA-256 hex we submitted),
 * so the citizen can compare it with their own local hash. No identity
 * involved — the seed is not tied to any person.
 */

export class TrackError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackError";
    this.statusCode = statusCode;
  }
}

export interface TrackingResult {
  found: boolean;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  messageBase64?: string;
  payloadHash?: string;
  transactionId?: string;
  topicId: string;
  network: string;
}

export function mirrorNodeBaseUrl(network: string): string {
  return network === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}

/**
 * Parses `<consensusTimestamp>@<sequenceNumber>` — the exact seed shape
 * returned by POST /api/submit-report.
 */
export function parseTrackingSeed(
  seed: string,
): { consensusTimestamp: string; sequenceNumber: number } | null {
  const match = /^(\d{10,}\.\d{1,9})@(\d+)$/.exec(seed.trim());
  if (!match) {
    return null;
  }
  return { consensusTimestamp: match[1], sequenceNumber: Number(match[2]) };
}

export async function lookupTrackingSeed(
  seed: string,
  topicId: string,
  network: string,
): Promise<TrackingResult> {
  const parsed = parseTrackingSeed(seed);
  if (!parsed) {
    throw new TrackError(
      "Invalid tracking seed format. Expected <consensusTimestamp>@<sequenceNumber>.",
      400,
    );
  }

  const url =
    `${mirrorNodeBaseUrl(network)}/api/v1/topics/${topicId}` +
    `/messages/${parsed.sequenceNumber}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (res.status === 404) {
      return { found: false, topicId, network };
    }
    if (!res.ok) {
      throw new TrackError(`Mirror node error (HTTP ${res.status}).`, 502);
    }

    const data = (await res.json()) as {
      sequence_number?: number;
      consensus_timestamp?: string;
      message?: string;
      transaction_id?: string;
    };

    const messageBase64 = typeof data.message === "string" ? data.message : "";
    let payloadHash = "";
    if (messageBase64) {
      // The HCS message is the SHA-256 hex string we submitted (utf8 text).
      payloadHash = Buffer.from(messageBase64, "base64").toString("utf8").trim();
      if (!/^[a-f0-9]{64}$/i.test(payloadHash)) {
        payloadHash = "";
      }
    }

    return {
      found: true,
      sequenceNumber: data.sequence_number,
      consensusTimestamp: data.consensus_timestamp,
      messageBase64,
      payloadHash,
      transactionId: data.transaction_id,
      topicId,
      network,
    };
  } catch (err) {
    if (err instanceof TrackError) {
      throw err;
    }
    throw new TrackError("Mirror node is unreachable. Try again later.", 502, {
      cause: err,
    });
  }
}
