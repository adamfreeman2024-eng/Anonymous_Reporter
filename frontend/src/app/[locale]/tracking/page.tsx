"use client";

import { useState } from "react";

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
  const [seed, setSeed] = useState("");
  const [result, setResult] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const trimmed = seed.trim();
    if (!trimmed) {
      setError("Մուտքագրիր tracking seed-ը։");
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
      setError(e instanceof Error ? e.message : "Ստուգումը ձախողվեց։");
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
        Ստուգիր, որ քո հաղորդումը գրանցված է Hedera-ում — միայն hash, առանց բովանդակության
      </p>

      <div className="mt-6 flex gap-3 flex-col sm:flex-row">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void check();
          }}
          placeholder="օր. 1723123456.789012345@42"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm outline-none focus:border-red-500 flex-1 max-w-lg font-mono"
        />
        <button
          onClick={() => void check()}
          disabled={loading}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-6 py-2"
        >
          {loading ? "Ստուգում…" : "Ստուգել"}
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
                ✅ Հաղորդումը գտնված է Hedera-ում
              </p>
              <div className="text-sm text-zinc-400">
                <div>
                  <span className="text-zinc-500">Consensus timestamp:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.consensusTimestamp}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Sequence:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.sequenceNumber}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Transaction:</span>{" "}
                  <span className="font-mono text-zinc-200">{result.transactionId}</span>
                </div>
              </div>
              <div>
                <p className="text-zinc-500 text-sm mb-1">
                  On-chain SHA-256 hash (համեմատիր քո պահածի հետ).
                  <br />
                  <span className="text-zinc-600">
                    Այս hash-ը հնարավոր չէ վերածել բովանդակության. բանալին միայն իրավապահ մարմնի մոտ է:
                  </span>
                </p>
                <code className="block bg-black border border-zinc-800 rounded-lg p-3 text-xs text-emerald-300 font-mono break-all">
                  {result.payloadHash ?? "(message decoding failed)"}
                </code>
              </div>
              {hashscanUrl && (
                <a
                  href={hashscanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-red-400 hover:text-red-300 underline"
                >
                  Բացել HashScan-ում →
                </a>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <p className="text-amber-400 font-bold">
                ⚠️ Հաղորդումը չի գտնվել այս topic-ում այս sequence-ով
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                Ստուգիր seed-ը. ձևաչափը՝ <code className="font-mono">consensusTimestamp@sequenceNumber</code>:
                hash-ը կարող է չհասցրած լինել consensus-ի, կամ seed-ը սխալ է:
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
