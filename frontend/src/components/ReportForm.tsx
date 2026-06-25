     1|"use client";
     2|import { useEffect, useRef, useState } from "react";
     3|import { useTranslations } from "next-intl";
     4|import { submitReport } from "@/lib/api";
     5|import { requestUploadUrl } from "@/lib/upload";
     6|import { resolveErrorKey } from "@/lib/errorMapping";
     7|import { CryptoError, encryptPayloadWithKey, importRSAPublicKey } from "@/utils/crypto";
     8|import { ExifError, stripExifData } from "@/utils/exif";
     9|import { buildReportPlaintext, type EncryptedFileRef } from "@/utils/reportPayload";
    10|import { encryptFile, generateSessionAesKey, uploadToPresignedUrl } from "@/utils/fileCrypto";
    11|
    12|export type Destination = "police" | "nss" | "anti-corruption";
    13|const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "video/mp4"];
    14|
    15|export function ReportForm() {
    16|  const t = useTranslations("report");
    17|  const te = useTranslations("errors");
    18|  const fileInputRef = useRef<HTMLInputElement>(null);
    19|  const [message, setMessage] = useState("");
    20|  const [attachedFile, setAttachedFile] = useState<File | null>(null);
    21|  const [destination, setDestination] = useState<Destination>("police");
    22|  const [trackingSeed, setTrackingSeed] = useState<string | null>(null);
    23|  const [error, setError] = useState<string | null>(null);
    24|  const [isSubmitting, setIsSubmitting] = useState(false);
    25|  const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
    26|  const [isKeyReady, setIsKeyReady] = useState(false);
    27|  const [uploadProgress, setUploadProgress] = useState(0);
    28|
    29|  useEffect(() => {
    30|    let cancelled = false;
    31|    async function loadPinnedPublicKey() {
    32|      try {
    33|        const pem = process.env.NEXT_PUBLIC_LAW_ENFORCEMENT_KEY_PEM;
    34|        if (!pem?.trim()) throw new CryptoError("Key not configured.");
    35|        const key = await importRSAPublicKey(pem);
    36|        if (!cancelled) { setPublicKey(key); setIsKeyReady(true); }
    37|      } catch (err) {
    38|        if (!cancelled) {
    39|          setError(err instanceof CryptoError ? te("keyNotConfigured") : te("encryptionNotReady"));
    40|        }
    41|      }
    42|    }
    43|    loadPinnedPublicKey();
    44|    return () => { cancelled = true; };
    45|  }, [te]);
    46|
    47|  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    48|    setError(null);
    49|    const file = e.target.files?.[0] ?? null;
    50|    if (!file) { setAttachedFile(null); return; }
    51|    if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
    52|      setError(te("invalidFileType"));
    53|      setAttachedFile(null);
    54|      e.target.value = "";
    55|      return;
    56|    }
    57|    setAttachedFile(file);
    58|  }
    59|
    60|  function clearAttachment() {
    61|    setAttachedFile(null);
    62|    if (fileInputRef.current) fileInputRef.current.value = "";
    63|  }
    64|
    65|  async function handleFileUpload(file: File, aesRawKey: Uint8Array): Promise<EncryptedFileRef> {
    66|    setUploadProgress(10);
    67|    const sanitized = await stripExifData(file);
    68|    const buffer = await sanitized.arrayBuffer();
    69|    setUploadProgress(20);
    70|    const importedKey = await crypto.subtle.importKey("raw", new Uint8Array(aesRawKey.buffer, aesRawKey.byteOffset, aesRawKey.byteLength) as unknown as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
    71|    const { ciphertext, iv, contentHashHex } = await encryptFile(buffer, importedKey);
    72|    setUploadProgress(40);
    73|    const { uploadUrl, s3Key } = await requestUploadUrl(sanitized.name, sanitized.type, buffer.byteLength);
    74|    setUploadProgress(50);
    75|    const { etag } = await uploadToPresignedUrl(ciphertext, uploadUrl);
    76|    setUploadProgress(90);
    77|    const ivStr = btoa(String.fromCharCode(...new Uint8Array(iv)));
    78|    return { s3Key, iv: ivStr, contentHash: contentHashHex, fileName: sanitized.name, mimeType: sanitized.type, size: buffer.byteLength, etag };
    79|  }
    80|
    81|  async function handleSubmit(e: React.FormEvent) {
    82|    e.preventDefault();
    83|    setError(null);
    84|    setTrackingSeed(null);
    85|    if (!message.trim()) { setError(te("emptyMessage")); return; }
    86|    if (!publicKey) { setError(te("encryptionNotReady")); return; }
    87|    setIsSubmitting(true);
    88|    setUploadProgress(0);
    89|    try {
    90|      const { rawKey: aesRaw } = await generateSessionAesKey();
    91|      let encryptedFiles: EncryptedFileRef[] = [];
    92|      if (attachedFile) {
    93|        const fileRef = await handleFileUpload(attachedFile, aesRaw);
    94|        encryptedFiles = [fileRef];
    95|      }
    96|      setUploadProgress(95);
    97|      const plaintext = buildReportPlaintext(message.trim(), undefined, encryptedFiles.length > 0 ? encryptedFiles : undefined);
    98|      const encrypted = await encryptPayloadWithKey(plaintext, publicKey, aesRaw);
    99|      const response = await submitReport({ encrypted, destination });
   100|      setTrackingSeed(response.trackingSeed);
   101|      setMessage("");
   102|      clearAttachment();
   103|      setUploadProgress(100);
   104|    } catch (err) {
   105|      const errMsg = err instanceof Error ? err.message : "";
   106|      if (err instanceof CryptoError || err instanceof ExifError) {
   107|        setError(err.message);
   108|      } else {
   109|        const key = resolveErrorKey(errMsg);
   110|        setError((te as any)(key.replace("errors.", "")));
   111|      }
   112|    } finally {
   113|      setIsSubmitting(false);
   114|    }
   115|  }
   116|
   117|  const isDisabled = isSubmitting || !isKeyReady;
   118|
   119|  return (
   120|    <div className="w-full animate-fade-in">
   121|      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" role="alert">{error}</div>}
   122|      {trackingSeed ? (
   123|        <div className="text-center">
   124|          <div className="mb-6 text-4xl">✅</div>
   125|          <div className="mb-4 text-xl font-semibold">{t("success")}</div>
   126|          <div className="mx-auto mb-2 max-w-xs rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
   127|            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{t("trackingSeed")}</div>
   128|            <div className="font-mono text-sm font-bold break-all">{trackingSeed}</div>
   129|          </div>
   130|          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-6">{t("trackingSeedHelp")}</p>
   131|          <button onClick={() => { setTrackingSeed(null); setError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors">{t("newReport")}</button>
   132|        </div>
   133|      ) : (
   134|        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
   135|          <div>
   136|            <label className="mb-2 block text-sm font-medium">{t("messageLabel")}</label>
   137|            <textarea value={message} onChange={(e) => { setMessage(e.target.value); setError(null); }} placeholder={t("messagePlaceholder")} rows={5} className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm transition-colors placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-blue-400" disabled={isDisabled} />
   138|          </div>
   139|          <div>
   140|            <label className="mb-2 block text-sm font-medium">{t("attachFile")}</label>
   141|            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
   142|              <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} onChange={handleFileChange} disabled={isDisabled} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-blue-950 dark:file:text-blue-300 dark:hover:file:bg-blue-900 disabled:opacity-50" />
   143|              {attachedFile && <button type="button" onClick={clearAttachment} disabled={isDisabled} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors disabled:opacity-50">{t("removeFile")}</button>}
   144|            </div>
   145|            {attachedFile && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">📎 {attachedFile.name} ({(attachedFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
   146|          </div>
   147|          {isSubmitting && uploadProgress > 0 && <div className="w-full rounded-full bg-zinc-200 dark:bg-zinc-700 h-2"><div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>}
   148|          <div>
   149|            <label className="mb-2 block text-sm font-medium">{t("destinationLabel")}</label>
   150|            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
   151|              {(["police", "nss", "anti-corruption"] as const).map((dest) => (
   152|                <button key={dest} type="button" onClick={() => setDestination(dest)} disabled={isDisabled} className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all disabled:opacity-50 ${destination === dest ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>{t(`destinations.${dest}`)}</button>
   153|              ))}
   154|            </div>
   155|          </div>
   156|          <button type="submit" disabled={isDisabled} className="w-full rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
   157|            {isSubmitting ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t("submitting")}</span> : t("submit")}
   158|          </button>
   159|        </form>
   160|      )}
   161|    </div>
   162|  );
   163|}
   164|