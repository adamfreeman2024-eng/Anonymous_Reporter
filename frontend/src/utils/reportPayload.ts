export interface ReportAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  exifStripped: boolean;
}

export interface EncryptedFileRef {
  s3Key: string;         // MinIO object key
  iv: string;            // AES-256-GCM IV (base64)
  contentHash: string;   // SHA-256 of original plaintext
  fileName: string;
  mimeType: string;
  size: number;          // bytes
  etag: string;          // S3 ETag for verification
}

export interface ReportPlaintextPayload {
  version: 2;            // bumped — now includes attachments
  message: string;
  attachment?: ReportAttachment;
  encryptedFiles?: EncryptedFileRef[];  // NEW: Phase 3
}

export function buildReportPlaintext(
  message: string,
  attachment?: ReportAttachment,
  encryptedFiles?: EncryptedFileRef[],
): string {
  const payload: ReportPlaintextPayload = {
    version: 2,
    message,
    ...(attachment ? { attachment } : {}),
    ...(encryptedFiles && encryptedFiles.length > 0 ? { encryptedFiles } : {}),
  };
  return JSON.stringify(payload);
}
