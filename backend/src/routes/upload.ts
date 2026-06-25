import { Router, type Request, type Response } from "express";
import { generatePresignedUploadUrl, S3ServiceError } from "../services/s3.js";

export const uploadRouter = Router();

// Maximum file size per upload: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "video/mp4",
]);

interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
}

/**
 * POST /api/get-upload-url
 * Returns a presigned PUT URL for direct browser-to-MinIO upload.
 * The client encrypts the file before using this URL, so MinIO never sees plaintext.
 */
uploadRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, fileSize } = req.body as UploadUrlRequest;

    if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
      res.status(400).json({ error: "fileName is required." });
      return;
    }

    if (!contentType || !ALLOWED_TYPES.has(contentType.toLowerCase())) {
      res.status(400).json({
        error: `contentType must be one of: ${[...ALLOWED_TYPES].join(", ")}`,
      });
      return;
    }

    if (typeof fileSize !== "number" || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      res.status(400).json({
        error: `fileSize must be between 1 and ${MAX_FILE_SIZE} bytes (max 50MB).`,
      });
      return;
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { uploadUrl, s3Key } = await generatePresignedUploadUrl(
      safeName,
      "application/octet-stream",
    );

    res.status(200).json({
      uploadUrl,
      s3Key,
      expiresIn: 300,
      maxFileSize: MAX_FILE_SIZE,
    });
  } catch (err) {
    if (err instanceof S3ServiceError) {
      console.error("[upload] MinIO error:", err.message);
      res.status(503).json({ error: "Storage service unavailable. Please try again later." });
      return;
    }
    console.error("[upload] Unexpected error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});
