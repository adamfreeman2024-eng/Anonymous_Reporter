export interface ReportAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  exifStripped: boolean;
}

export interface ReportPlaintextPayload {
  version: 1;
  message: string;
  attachment?: ReportAttachment;
}

export function buildReportPlaintext(
  message: string,
  attachment?: ReportAttachment,
): string {
  const payload: ReportPlaintextPayload = {
    version: 1,
    message,
    ...(attachment ? { attachment } : {}),
  };

  return JSON.stringify(payload);
}
