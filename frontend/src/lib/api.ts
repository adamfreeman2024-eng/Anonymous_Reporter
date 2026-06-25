import type { HybridEncryptedPayload } from "@/utils/crypto";
import type { Destination } from "@/components/ReportForm";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface SubmitReportRequest {
  encrypted: HybridEncryptedPayload;
  destination: Destination;
}

export interface SubmitReportResponse {
  success: boolean;
  consensusTimestamp: string;
  sequenceNumber: number;
  transactionId: string;
  trackingSeed: string;
}

export async function submitReport(
  body: SubmitReportRequest,
): Promise<SubmitReportResponse> {
  const res = await fetch(`${API_BASE}/api/submit-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Server error (${res.status})`,
    );
  }

  return res.json() as Promise<SubmitReportResponse>;
}
