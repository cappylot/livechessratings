"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlayerSummary } from "@/lib/types";

export default function Home() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setPlayers([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setPlayers(data.players);
        setTotal(data.total ?? data.players.length);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Your FIDE rating, before FIDE publishes it</h1>
        <p className="max-w-2xl text-muted">
          Search for a player to see their official FIDE ratings and an estimated live rating from tournaments on
          chess-results.com that ended after the latest monthly list.
        </p>
      </section>

      <div className="relative">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player name (e.g. Carlsen, Magnus) or FIDE ID"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-lg shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          aria-label="Search FIDE players"
        />
        {loading && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">Searching…</span>}
      </div>

      {error && <p className="text-down">{error}</p>}

      {players.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {players.map((p) => (
              <li key={p.fideId}>
                <Link
                  href={`/player/${p.fideId}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {p.title && <span className="mr-1.5 text-accent">{p.title}</span>}
                      {p.name}
                    </span>
                    <span className="ml-2 text-sm text-muted">
                      {p.fed} · {p.birthYear ?? "—"} · ID {p.fideId}
                    </span>
                  </span>
                  <span className="flex gap-3 font-mono text-sm tabular-nums">
                    <Rating label="Std" value={p.standard} />
                    <Rating label="Rpd" value={p.rapid} />
                    <Rating label="Blz" value={p.blitz} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {total > players.length && (
            <p className="border-t border-border px-4 py-2 text-sm text-muted">
              Showing {players.length} of {total} matches. Refine the name to narrow it down.
            </p>
          )}
        </div>
      )}

      {!loading && !error && query.trim().length >= 3 && players.length === 0 && (
        <p className="text-muted">No players found.</p>
      )}
    </div>
  );
}

function Rating({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="w-16 text-right">
      <span className="mr-1 text-xs text-muted">{label}</span>
      {value ?? "—"}
    </span>
  );
}
