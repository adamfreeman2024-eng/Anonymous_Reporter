import {
  AccountId,
  Client,
  PrivateKey,
  Status,
  StatusError,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";

export interface HcsSubmitResult {
  consensusTimestamp: string;
  sequenceNumber: number;
  transactionId: string;
}

export class HederaServiceError extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HederaServiceError";
    this.statusCode = statusCode;
  }
}

let hederaClient: Client | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new HederaServiceError(
      `Missing required environment variable: ${name}`,
      500,
    );
  }
  return value;
}

function getHederaClient(): Client {
  if (hederaClient) {
    return hederaClient;
  }

  const accountId = getRequiredEnv("HEDERA_ACCOUNT_ID");
  const privateKey = getRequiredEnv("HEDERA_PRIVATE_KEY");

  try {
    hederaClient = Client.forTestnet();
    hederaClient.setOperator(
      AccountId.fromString(accountId),
      PrivateKey.fromString(privateKey),
    );
    return hederaClient;
  } catch (err) {
    throw new HederaServiceError(
      "Failed to initialize Hedera client. Check account ID and private key.",
      500,
      { cause: err },
    );
  }
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  const networkPatterns = [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "TIMEOUT",
    "network",
    "unavailable",
    "Failed to communicate",
  ];

  const message = err.message.toLowerCase();
  return networkPatterns.some((pattern) =>
    message.includes(pattern.toLowerCase()),
  );
}

function mapHederaError(err: unknown): HederaServiceError {
  if (err instanceof HederaServiceError) {
    return err;
  }

  if (err instanceof StatusError) {
    const retryable =
      err.status === Status.Busy ||
      err.status === Status.PlatformNotActive;

    return new HederaServiceError(
      retryable
        ? "Hedera network is temporarily unreachable. Please try again later."
        : `Hedera rejected the submission: ${err.status.toString()}`,
      retryable ? 503 : 502,
      { cause: err },
    );
  }

  if (isNetworkError(err)) {
    return new HederaServiceError(
      "Hedera network is temporarily unreachable. Please try again later.",
      503,
      { cause: err },
    );
  }

  return new HederaServiceError(
    "Failed to submit hash to Hedera HCS.",
    502,
    { cause: err },
  );
}

/**
 * Submits a SHA-256 payload hash to an HCS topic.
 * Only the hash is written on-chain — never the encrypted report content.
 */
export async function submitHashToHCS(
  payloadHash: string,
  topicId: string,
): Promise<HcsSubmitResult> {
  if (!payloadHash || !/^[a-f0-9]{64}$/i.test(payloadHash)) {
    throw new HederaServiceError("Invalid payload hash format.", 400);
  }

  if (!topicId) {
    throw new HederaServiceError("HCS topic ID is required.", 500);
  }

  const client = getHederaClient();

  try {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(payloadHash)
      .execute(client);

    const receipt = await response.getReceipt(client);

    if (receipt.status !== Status.Success) {
      throw new HederaServiceError(
        `Hedera receipt status: ${receipt.status.toString()}`,
        502,
      );
    }

    const record = await response.getRecord(client);
    const sequenceNumber = receipt.topicSequenceNumber?.toNumber();

    if (sequenceNumber === undefined || sequenceNumber === null) {
      throw new HederaServiceError(
        "Hedera did not return a topic sequence number.",
        502,
      );
    }

    const transactionId = response.transactionId.toString();

    return {
      consensusTimestamp: record.consensusTimestamp.toString(),
      sequenceNumber,
      transactionId,
    };
  } catch (err) {
    throw mapHederaError(err);
  }
}

/**
 * Releases the Hedera client connection. Useful for graceful shutdown.
 */
export function closeHederaClient(): void {
  if (hederaClient) {
    hederaClient.close();
    hederaClient = null;
  }
}
