"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { submitReport } from "@/lib/api";
import { requestUploadUrl } from "@/lib/upload";
import { resolveErrorKey } from "@/lib/errorMapping";
import { CryptoError, encryptPayloadWithKey, importRSAPublicKey } from "@/utils/crypto";
import { ExifError, stripExifData } from "@/utils/exif";
import { buildReportPlaintext, type EncryptedFileRef } from "@/utils/reportPayload";
import { encryptFile, generateSessionAesKey, uploadToPresignedUrl } from "@/utils/fileCrypto";
export type Destination = "police" | "nss" | "anti-corruption";
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "video/mp4"];
export function ReportForm() {
  const t = useTranslations("report");
  const te = useTranslations("errors");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [destination, setDestination] = useState<Destination>("police");
  const [trackingSeed, setTrackingSeed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
  const [isKeyReady, setIsKeyReady] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function loadPinnedPublicKey() {
      try {
        const pem = process.env.NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM;
        if (!pem?.trim()) throw new CryptoError("Key not configured.");
        const key = await importRSAPublicKey(pem);
        if (!cancelled) { setPublicKey(key); setIsKeyReady(true); }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof CryptoError ? te("keyNotConfigured") : te("encryptionNotReady"));
        }
      }
    }
    loadPinnedPublicKey();
    return () => { cancelled = true; };
  }, [te]);
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) { setAttachedFile(null); return; }
    if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
      setError(te("invalidFileType"));
      setAttachedFile(null);
      e.target.value = "";
      return;
    }
    setAttachedFile(file);
  }
  function clearAttachment() {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  async function handleFileUpload(file: File, aesRawKey: Uint8Array): Promise<EncryptedFileRef> {
    setUploadProgress(10);
    const sanitized = await stripExifData(file);
    const buffer = await sanitized.arrayBuffer();
    setUploadProgress(20);
    const importedKey = await crypto.subtle.importKey("raw", new Uint8Array(aesRawKey), { name: "AES-GCM" }, false, ["encrypt"]);
    const { ciphertext, iv, contentHashHex } = await encryptFile(buffer, importedKey);
    setUploadProgress(40);
    const { uploadUrl, s3Key } = await requestUploadUrl(sanitized.name, sanitized.type, buffer.byteLength);
    setUploadProgress(50);
    const { etag } = await uploadToPresignedUrl(ciphertext, uploadUrl);
    setUploadProgress(90);
    const ivStr = btoa(String.fromCharCode(...new Uint8Array(iv)));
    return { s3Key, iv: ivStr, contentHash: contentHashHex, fileName: sanitized.name, mimeType: sanitized.type, size: buffer.byteLength, etag };
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTrackingSeed(null);
    if (!message.trim()) { setError(te("emptyMessage")); return; }
    if (!publicKey) { setError(te("encryptionNotReady")); return; }
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      const { rawKey: aesRaw } = await generateSessionAesKey();
      let encryptedFiles: EncryptedFileRef[] = [];
      if (attachedFile) {
        encryptedFiles = [await handleFileUpload(attachedFile, aesRaw)];
      }
      setUploadProgress(95);
      const plaintext = buildReportPlaintext(message.trim(), undefined, encryptedFiles.length > 0 ? encryptedFiles : undefined);
      const encrypted = await encryptPayloadWithKey(plaintext, publicKey, aesRaw);
      const response = await submitReport({ encrypted, destination });
      setTrackingSeed(response.trackingSeed);
      setMessage("");
      clearAttachment();
      setUploadProgress(100);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (err instanceof CryptoError || err instanceof ExifError) {
        setError(err.message);
      } else {
        setError(te(resolveErrorKey(errMsg).replace("errors.", "")));
      }
    } finally {
      setIsSubmitting(false);
    }
  }
  const isDisabled = isSubmitting || !isKeyReady;
  return (
    <div className="w-full animate-fade-in">
      {error && <div role="alert">{error}</div>}
      {trackingSeed ? (
        <div>
          <div>✅</div>
          <div>{t("success")}</div>
          <div>{trackingSeed}</div>
          <button onClick={() => { setTrackingSeed(null); setError(null); }}>{t("newReport")}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <textarea value={message} onChange={(e) => { setMessage(e.target.value); setError(null); }} disabled={isDisabled} />
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} onChange={handleFileChange} disabled={isDisabled} />
          {attachedFile && <button type="button" onClick={clearAttachment} disabled={isDisabled}>{t("removeFile")}</button>}
          {isSubmitting && uploadProgress > 0 && <div><div style={{ width: `${uploadProgress}%` }} /></div>}
          {(["police", "nss", "anti-corruption"] as const).map(dest => <button key={dest} type="button" onClick={() => setDestination(dest)} disabled={isDisabled}>{t(`destinations.${dest}`)}</button>)}
          <button type="submit" disabled={isDisabled}>{isSubmitting ? t("submitting") : t("submit")}</button>
        </form>
      )}
    </div>
  );
}
