"use client";

import { useEffect, useState } from "react";

/**
 * Ministry admin dashboard (Phase 4 — skeleton).
 * Shows aggregate stats from the audit trail (never plaintext/identity).
 * Guarded server-side by OPERATOR_API_KEY (Bearer) when set.
 */

interface Stats {
  ok: boolean;
  total: number;
  byEvent: Record<string, number>;
  byDestination: Record<string, number>;
  lastSubmission: string | null;
  note?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/admin/stats`, {
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats((await res.json()) as Stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-sans p-8">
      <h1 className="text-2xl font-black uppercase tracking-widest">
        Admin <span className="text-red-500">Dashboard</span>
      </h1>
      <p className="text-zinc-500 text-sm mt-1">
        Անանուն հաղորդումների ագրեգատ վիճակագրություն (audit trail-ից)
      </p>

      <div className="mt-6 flex gap-3">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="OPERATOR_API_KEY (եթե set է)"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm outline-none focus:border-red-500 flex-1 max-w-md"
        />
        <button
          onClick={load}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-5 py-2 rounded-lg font-bold uppercase text-sm"
        >
          {loading ? "…" : "Թարմացնել"}
        </button>
      </div>

      {error && <p className="mt-4 text-red-500 text-sm">Սխալ՝ {error}</p>}

      {stats && (
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Ընդամենը</p>
            <p className="text-4xl font-black mt-2">{stats.total}</p>
            <p className="text-xs text-zinc-600 mt-2">audit trail գրառում</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Ըստ իրադարձության</p>
            <div className="mt-3 space-y-1 text-sm">
              {Object.entries(stats.byEvent).map(([k, v]) => (
                <p key={k} className="flex justify-between">
                  <span className="text-zinc-400">{k}</span>
                  <span className="font-bold">{v}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Ըստ ուղղության</p>
            <div className="mt-3 space-y-1 text-sm">
              {Object.entries(stats.byDestination).map(([k, v]) => (
                <p key={k} className="flex justify-between">
                  <span className="text-zinc-400">{k}</span>
                  <span className="font-bold">{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats?.note && (
        <p className="mt-6 text-xs text-zinc-600">{stats.note}</p>
      )}
    </main>
  );
}
