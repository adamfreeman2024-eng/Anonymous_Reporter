import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

export class S3ServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "S3ServiceError";
  }
}

let s3Client: S3Client | null = null;

function getS3Config() {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET;
  const region = process.env.MINIO_REGION ?? "us-east-1";
  const useSSL = process.env.MINIO_USE_SSL === "true";

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new S3ServiceError(
      "MinIO configuration is incomplete. Check MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET.",
    );
  }

  return { endpoint, accessKey, secretKey, bucket, region, useSSL };
}

export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const { endpoint, accessKey, secretKey, region, useSSL } = getS3Config();

  s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true, // MinIO requires path-style
    tls: useSSL,
  });

  return s3Client;
}

function getBucket(): string {
  return getS3Config().bucket;
}

/**
 * Generates a presigned PUT URL for direct browser-to-S3 upload.
 * The client encrypts the file BEFORE uploading, so MinIO never sees plaintext.
 */
export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<{ uploadUrl: string; s3Key: string }> {
  const bucket = getBucket();
  const timestamp = Date.now();
  const random = createHash("sha256")
    .update(`${fileName}-${timestamp}-${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  const s3Key = `uploads/${timestamp}-${random}-${fileName}`;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return { uploadUrl, s3Key };
}

/**
 * Verifies that an object exists in MinIO and returns its ETag.
 * Used by the proxy to validate file integrity before HCS submission.
 */
export async function verifyObjectExists(s3Key: string): Promise<{ etag: string; size: number }> {
  const bucket = getBucket();
  const client = getS3Client();

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );

    if (!response.ETag || response.ContentLength === undefined) {
      throw new S3ServiceError(`Object ${s3Key} exists but metadata is incomplete.`);
    }

    return {
      etag: response.ETag.replace(/"/g, ""), // MinIO wraps ETag in quotes
      size: response.ContentLength,
    };
  } catch (err) {
    if (err instanceof S3ServiceError) throw err;
    throw new S3ServiceError(
      `Object ${s3Key} not found or inaccessible. Upload may have failed.`,
      { cause: err },
    );
  }
}

/**
 * Downloads an encrypted file from MinIO for internal network decryption.
 */
export async function downloadObject(s3Key: string): Promise<Buffer> {
  const bucket = getBucket();
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );

    if (!response.Body) {
      throw new S3ServiceError(`Object ${s3Key} has no body.`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  } catch (err) {
    if (err instanceof S3ServiceError) throw err;
    throw new S3ServiceError(
      `Failed to download object ${s3Key} from MinIO.`,
      { cause: err },
    );
  }
}

/** Closes the S3 client gracefully. */
export function closeS3Client(): void {
  if (s3Client) {
    s3Client.destroy();
    s3Client = null;
  }
}
