const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
  maxFileSize: number;
}

/**
 * Requests a presigned upload URL from the backend.
 */
export async function requestUploadUrl(
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<PresignedUrlResponse> {
  const res = await fetch(`${API_BASE}/api/get-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType, fileSize }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Upload URL request failed (${res.status})`,
    );
  }

  return res.json() as Promise<PresignedUrlResponse>;
}
