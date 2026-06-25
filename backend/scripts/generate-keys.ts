import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_ROOT = resolve(__dirname, "..");
const FRONTEND_ROOT = resolve(BACKEND_ROOT, "..", "frontend");
const BACKEND_ENV_PATH = resolve(BACKEND_ROOT, ".env");
const BACKEND_ENV_EXAMPLE_PATH = resolve(BACKEND_ROOT, ".env.example");
const FRONTEND_ENV_PATH = resolve(FRONTEND_ROOT, ".env.local");

class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

function fail(message: string): never {
  throw new SetupError(message);
}

function ensureBackendEnvFile(): void {
  if (existsSync(BACKEND_ENV_PATH)) {
    return;
  }

  if (existsSync(BACKEND_ENV_EXAMPLE_PATH)) {
    writeFileSync(
      BACKEND_ENV_PATH,
      readFileSync(BACKEND_ENV_EXAMPLE_PATH, "utf-8"),
      "utf-8",
    );
    console.info(`[setup:keys] Created ${BACKEND_ENV_PATH} from .env.example`);
    return;
  }

  writeFileSync(
    BACKEND_ENV_PATH,
    "PORT=3001\nCORS_ORIGIN=http://localhost:3000\n",
    "utf-8",
  );
  console.info(`[setup:keys] Created minimal ${BACKEND_ENV_PATH}`);
}

function escapePemForEnv(pem: string): string {
  return pem.replace(/\r?\n/g, "\\n").replace(/"/g, '\\"');
}

function upsertQuotedEnvVariable(
  filePath: string,
  key: string,
  pemValue: string,
): void {
  const line = `${key}="${escapePemForEnv(pemValue)}"`;
  const content = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "ms");

  const updated = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.endsWith("\n") || content.length === 0 ? content : `${content}\n`}${line}\n`;

  writeFileSync(filePath, updated, "utf-8");
}

function mergeFrontendEnv(publicKeyPem: string): void {
  const apiUrlLine = "NEXT_PUBLIC_API_URL=http://localhost:3001";
  let content = existsSync(FRONTEND_ENV_PATH)
    ? readFileSync(FRONTEND_ENV_PATH, "utf-8")
    : `${apiUrlLine}\n`;

  if (!/^NEXT_PUBLIC_API_URL=/m.test(content)) {
    content = `${apiUrlLine}\n${content}`;
  }

  const publicKeyLine = `NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM="${escapePemForEnv(publicKeyPem)}"`;
  const pattern = /^NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM=.*$/ms;

  content = pattern.test(content)
    ? content.replace(pattern, publicKeyLine)
    : `${content.endsWith("\n") ? content : `${content}\n`}${publicKeyLine}\n`;

  writeFileSync(FRONTEND_ENV_PATH, content, "utf-8");
}

function generateDevKeyPair(): { publicKey: string; privateKey: string } {
  try {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 0x10001,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    return { publicKey, privateKey };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    fail(`Failed to generate RSA key pair: ${detail}`);
  }
}

function main(): void {
  console.info("[setup:keys] Generating RSA-2048 dev key pair …");

  ensureBackendEnvFile();

  const { publicKey, privateKey } = generateDevKeyPair();

  upsertQuotedEnvVariable(BACKEND_ENV_PATH, "LE_PRIVATE_KEY_PEM", privateKey);
  mergeFrontendEnv(publicKey);

  console.info("");
  console.info("✔ Dev E2EE key pair generated and pinned.");
  console.info(`  Private key → ${BACKEND_ENV_PATH} (LE_PRIVATE_KEY_PEM)`);
  console.info(
    `  Public key  → ${FRONTEND_ENV_PATH} (NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM)`,
  );
  console.info("");
  console.info("Restart the frontend dev server to load the new public key.");
}

try {
  main();
} catch (err) {
  if (err instanceof SetupError) {
    console.error(`\n[setup:keys] Error:\n${err.message}\n`);
    process.exit(1);
  }

  console.error("[setup:keys] Unexpected error:", err);
  process.exit(1);
}
