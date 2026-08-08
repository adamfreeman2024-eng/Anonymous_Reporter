"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface TrackingResponse {
  ok: boolean;
  seed: string;
  found: boolean;
  network: string;
  topicId: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  payloadHash?: string;
  transactionId?: string;
  error?: string;
}

export default function TrackingPage() {
  const t = useTranslations("tracking");
  const [seed, setSeed] = useState("");
  const [result, setResult] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const trimmed = seed.trim();
    if (!trimmed) {
      setError(t("emptySeed"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `${API}/api/track/${encodeURIComponent(trimmed)}`,
      );
      const data = (await res.json()) as TrackingResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setLoading(false);
    }
  };

  const hashscanUrl =
    result?.found && result.topicId
      ? `https://hashscan.io/${result.network}/topic/${result.topicId}`
      : null;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-sans p-8">
      <h1 className="text-2xl font-black uppercase tracking-widest">
        Tracking <span className="text-red-500">Seed</span>
      </h1>
      <p className="text-zinc-500 text-sm mt-1">
        {t("subtitle")}
      </p>

      <div className="mt-6 flex gap-3 flex-col sm:flex-row">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void check();
          }}
          placeholder={t("placeholder")}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm outline-none focus:border-red-500 flex-1 max-w-lg font-mono"
        />
        <button
          onClick={() => void check()}
          disabled={loading}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-6 py-2"
        >
          {loading ? t("checking") : t("check")}
        </button>
      </div>

      {error && (
        <p className="mt-6 text-red-400 text-sm">⚠️ {error}</p>
      )}

      {result && (
        <div className="mt-8 max-w-2xl">
          {result.found ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <p className="text-emerald-400 font-bold">
                ✅ {t("found")}
              </p>
              <div className="text-sm text-zinc-400">
                <div>
                  <span className="text-zinc-500">{t("timestamp")}:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.consensusTimestamp}</span>
                </div>
                <div>
                  <span className="text-zinc-500">{t("sequence")}:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.sequenceNumber}</span>
                </div>
                <div>
                  <span className="text-zinc-500">{t("transaction")}:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.transactionId}</span>
                </div>
              </div>
              <div>
                <p className="text-zinc-500 text-sm mb-1">
                  {t("hashLabel")}.
                  <br />
                  <span className="text-zinc-600">{t("hashHelp")}</span>
                </p>
                <code className="block bg-black border border-zinc-800 rounded-lg p-3 text-xs text-emerald-300 font-mono break-all">
                  {result.payloadHash ?? t("hashDecodeFailed")}
                </code>
              </div>
              {hashscanUrl && (
                <a
                  href={hashscanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-red-400 hover:text-red-300 underline"
                >
                  {t("hashscan")}
                </a>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <p className="text-amber-400 font-bold">
                ⚠️ {t("notFound")}
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                {t("notFoundHelp")}
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
