"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { submitReport } from "@/lib/api";
import { resolveErrorKey } from "@/lib/errorMapping";
import {
  arrayBufferToBase64,
  CryptoError,
  encryptPayload,
  importRSAPublicKey,
} from "@/utils/crypto";
import { ExifError, stripExifData } from "@/utils/exif";
import { buildReportPlaintext, type ReportAttachment } from "@/utils/reportPayload";

export type Destination = "police" | "nss" | "anti-corruption";

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

  useEffect(() => {
    let cancelled = false;
    async function loadPinnedPublicKey() {
      try {
        const pem = process.env.NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM;
        if (!pem?.trim()) {
          throw new CryptoError(
            "Law Enforcement public key is not configured. Run: npm run setup:keys",
          );
        }
        const key = await importRSAPublicKey(pem);
        if (!cancelled) {
          setPublicKey(key);
          setIsKeyReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof CryptoError
              ? te("keyNotConfigured")
              : te("encryptionNotReady");
          setError(msg);
        }
      }
    }
    loadPinnedPublicKey();
    return () => { cancelled = true; };
  }, [te]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setAttachedFile(null);
      return;
    }
    const ACCEPTED = ["image/jpeg", "image/jpg", "image/png"];
    if (!ACCEPTED.includes(file.type.toLowerCase())) {
      setError(te("invalidFileType"));
      setAttachedFile(null);
      e.target.value = "";
      return;
    }
    setAttachedFile(file);
  }

  function clearAttachment() {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function prepareAttachment(file: File): Promise<ReportAttachment> {
    const sanitized = await stripExifData(file);
    const buffer = await sanitized.arrayBuffer();
    const isJpeg = sanitized.type.toLowerCase().includes("jpeg");
    return {
      fileName: sanitized.name,
      mimeType: sanitized.type,
      dataBase64: arrayBufferToBase64(new Uint8Array(buffer)),
      exifStripped: isJpeg,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTrackingSeed(null);

    if (!message.trim()) {
      setError(te("emptyMessage"));
      return;
    }
    if (!publicKey) {
      setError(te("encryptionNotReady"));
      return;
    }

    setIsSubmitting(true);
    try {
      const attachment = attachedFile
        ? await prepareAttachment(attachedFile)
        : undefined;
      const plaintext = buildReportPlaintext(message.trim(), attachment);
      const encrypted = await encryptPayload(plaintext, publicKey);
      const response = await submitReport({ encrypted, destination });
      setTrackingSeed(response.trackingSeed);
      setMessage("");
      clearAttachment();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (err instanceof CryptoError || err instanceof ExifError) {
        setError(err.message);
      } else {
        const key = resolveErrorKey(errMsg);
        setError(te(key.replace("errors.", "") as any));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const isDisabled = isSubmitting || !isKeyReady;

  return (
    <div className="w-full animate-fade-in">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      {trackingSeed ? (
        <div className="text-center">
          <div className="mb-6 text-4xl">✅</div>
          <div className="mb-4 text-xl font-semibold">{t("success")}</div>
          <div className="mx-auto mb-2 max-w-xs rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{t("trackingSeed")}</div>
            <div className="font-mono text-sm font-bold break-all">{trackingSeed}</div>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-6">{t("trackingSeedHelp")}</p>
          <button onClick={() => { setTrackingSeed(null); setError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            {t("newReport")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          {/* Message */}
          <div>
            <label className="mb-2 block text-sm font-medium">{t("messageLabel")}</label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              placeholder={t("messagePlaceholder")}
              rows={5}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm transition-colors placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-blue-400"
              disabled={isDisabled}
            />
          </div>

          {/* File attachment */}
          <div>
            <label className="mb-2 block text-sm font-medium">{t("attachFile")}</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                disabled={isDisabled}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-blue-950 dark:file:text-blue-300 dark:hover:file:bg-blue-900 disabled:opacity-50"
              />
              {attachedFile && (
                <button
                  type="button"
                  onClick={clearAttachment}
                  disabled={isDisabled}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
                >
                  {t("removeFile")}
                </button>
              )}
            </div>
            {attachedFile && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                📎 {attachedFile.name} ({(attachedFile.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>

          {/* Destination */}
          <div>
            <label className="mb-2 block text-sm font-medium">{t("destinationLabel")}</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["police", "nss", "anti-corruption"] as const).map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => setDestination(dest)}
                  disabled={isDisabled}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all disabled:opacity-50 ${
                    destination === dest
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t(`destinations.${dest}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isDisabled}
            className="w-full rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("submitting")}
              </span>
            ) : (
              t("submit")
            )}
          </button>
        </form>
      )}
    </div>
  );
}
