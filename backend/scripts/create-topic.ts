import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  AccountId,
  Client,
  PrivateKey,
  Status,
  TopicCreateTransaction,
} from "@hashgraph/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(BACKEND_ROOT, ".env");
const ENV_EXAMPLE_PATH = resolve(BACKEND_ROOT, ".env.example");

class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

function fail(message: string): never {
  throw new SetupError(message);
}

function loadEnvironment(): void {
  if (!existsSync(ENV_PATH)) {
    fail(
      [
        `Missing ${ENV_PATH}`,
        "",
        "Create it before running setup:topic:",
        `  cp "${ENV_EXAMPLE_PATH}" "${ENV_PATH}"`,
        "",
        "Then set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY with your Testnet credentials.",
      ].join("\n"),
    );
  }

  const result = config({ path: ENV_PATH, override: true });
  if (result.error) {
    fail(`Failed to load ${ENV_PATH}: ${result.error.message}`);
  }
}

function requireCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(
      [
        `Missing required environment variable: ${name}`,
        "",
        `Add it to ${ENV_PATH} before running setup:topic.`,
        "Obtain Testnet credentials at https://portal.hedera.com",
      ].join("\n"),
    );
  }
  return value;
}

function upsertEnvVariable(
  filePath: string,
  key: string,
  value: string,
): void {
  const line = `${key}=${value}`;
  const content = readFileSync(filePath, "utf-8");
  const pattern = new RegExp(`^${key}=.*$`, "m");

  const updated = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.endsWith("\n") || content.length === 0 ? content : `${content}\n`}${line}\n`;

  writeFileSync(filePath, updated, "utf-8");
}

function createHederaClient(accountId: string, privateKey: string): Client {
  try {
    const client = Client.forTestnet();
    client.setOperator(
      AccountId.fromString(accountId),
      PrivateKey.fromString(privateKey),
    );
    return client;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    fail(
      [
        "Failed to initialize Hedera Testnet client.",
        `Reason: ${detail}`,
        "",
        "Verify HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in your .env file.",
      ].join("\n"),
    );
  }
}

async function createTopic(client: Client): Promise<string> {
  try {
    const response = await new TopicCreateTransaction().execute(client);
    const receipt = await response.getReceipt(client);

    if (receipt.status !== Status.Success) {
      fail(`Topic creation failed with status: ${receipt.status.toString()}`);
    }

    const topicId = receipt.topicId?.toString();
    if (!topicId) {
      fail("Topic creation succeeded but no TopicId was returned in the receipt.");
    }

    return topicId;
  } catch (err) {
    if (err instanceof SetupError) {
      throw err;
    }

    const detail = err instanceof Error ? err.message : String(err);
    fail(
      [
        "Hedera TopicCreateTransaction failed.",
        `Reason: ${detail}`,
        "",
        "Check that your account has sufficient HBAR and network connectivity.",
      ].join("\n"),
    );
  }
}

async function main(): Promise<void> {
  console.info("[setup:topic] Loading Hedera credentials from backend/.env …");

  loadEnvironment();

  const accountId = requireCredential("HEDERA_ACCOUNT_ID");
  const privateKey = requireCredential("HEDERA_PRIVATE_KEY");

  console.info(`[setup:topic] Using operator account ${accountId} on Testnet.`);

  const client = createHederaClient(accountId, privateKey);

  try {
    console.info("[setup:topic] Submitting TopicCreateTransaction …");
    const topicId = await createTopic(client);

    upsertEnvVariable(ENV_PATH, "HEDERA_TOPIC_ID", topicId);

    console.info("");
    console.info("✔ Hedera HCS topic created successfully.");
    console.info(`  Topic ID:        ${topicId}`);
    console.info(`  Saved to:        ${ENV_PATH}`);
    console.info(`  Variable set:    HEDERA_TOPIC_ID=${topicId}`);
    console.info("");
    console.info("You can now start the blind proxy with: npm run dev -w backend");
  } finally {
    client.close();
  }
}

main().catch((err: unknown) => {
  if (err instanceof SetupError) {
    console.error(`\n[setup:topic] Error:\n${err.message}\n`);
    process.exit(1);
  }

  console.error("[setup:topic] Unexpected error:", err);
  process.exit(1);
});
