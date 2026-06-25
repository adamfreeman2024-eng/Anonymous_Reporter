"use client";

import { useEffect, useRef, useState } from "react";
import { submitReport } from "@/lib/api";
import {
  arrayBufferToBase64,
  CryptoError,
  encryptPayload,
  importRSAPublicKey,
} from "@/utils/crypto";
import { ExifError, stripExifData } from "@/utils/exif";
import { buildReportPlaintext, type ReportAttachment } from "@/utils/reportPayload";

export type Destination = "police" | "nss" | "anti-corruption";

const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: "police", label: "Police" },
  { value: "nss", label: "NSS" },
  { value: "anti-corruption", label: "Anti-Corruption" },
];

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png"];

export function ReportForm() {
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
          const message =
            err instanceof CryptoError
              ? err.message
              : "Failed to initialize encryption. Please refresh the page.";
          setError(message);
        }
      }
    }

    loadPinnedPublicKey();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;

    if (!file) {
      setAttachedFile(null);
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      setError("Only JPEG and PNG images are accepted.");
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
      setError("Please enter a report message.");
      return;
    }

    if (!publicKey) {
      setError("Encryption is not ready. Please wait or refresh the page.");
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
      if (err instanceof CryptoError || err instanceof ExifError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Submission failed. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const isDisabled = isSubmitting || !isKeyReady;

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-surface-border bg-surface-elevated p-6 shadow-xl"
      >
        <div className="mb-5">
          <label
            htmlFor="destination"
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            Destination
          </label>
          <select
            id="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value as Destination)}
            disabled={isDisabled}
            className="w-full rounded-lg border border-surface-border bg-surface px-4 py-2.5 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {DESTINATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label
            htmlFor="message"
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            Report Message
          </label>
          <textarea
            id="message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isDisabled}
            placeholder="Describe the incident. Do not include personal identifying information unless necessary."
            className="w-full resize-none rounded-lg border border-surface-border bg-surface px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="attachment"
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            Image Attachment{" "}
            <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            ref={fileInputRef}
            id="attachment"
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={isDisabled}
            className="w-full text-sm text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-accent-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-surface-border disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-gray-500">
            JPEG images are sanitized in your browser — EXIF metadata (GPS,
            device model, timestamps) is removed before encryption.
          </p>
          {attachedFile && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-surface-border bg-surface px-3 py-2">
              <span className="truncate text-sm text-gray-300">
                {attachedFile.name}
              </span>
              <button
                type="button"
                onClick={clearAttachment}
                disabled={isDisabled}
                className="ml-3 shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {!isKeyReady && !error && (
          <p className="mb-4 text-sm text-gray-400">
            Initializing end-to-end encryption…
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? "Sanitizing, Encrypting & Submitting…"
            : !isKeyReady
              ? "Preparing Encryption…"
              : "Submit Report"}
        </button>
      </form>

      {trackingSeed && (
        <div className="mt-6 rounded-xl border border-green-800/50 bg-green-950/30 p-6">
          <p className="text-sm font-medium text-green-400">
            Report submitted successfully
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Save your Tracking Seed — it is the only way to reference this
            report. We cannot recover it if lost.
          </p>
          <code className="mt-3 block break-all rounded-lg bg-surface px-4 py-3 font-mono text-sm text-green-300">
            {trackingSeed}
          </code>
        </div>
      )}
    </div>
  );
}
