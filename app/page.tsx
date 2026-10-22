"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import type { PlayerSummary } from "@/lib/types";

export default function Home() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"fide" | "chess-results">("fide");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setPlayers([]);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setPlayers(data.players);
        setTotal(data.total ?? data.players.length);
        setSource(data.source ?? "fide");
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

  const active = query.trim().length >= 3;

  return (
    <div
      className={`mx-auto flex max-w-2xl flex-col justify-center gap-6 transition-[min-height] duration-500 ${
        active ? "min-h-0" : "min-h-[60vh]"
      }`}
    >
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your FIDE rating, before FIDE publishes it</h1>
        <p className="mx-auto max-w-xl text-muted">
          Search for a player to see their official FIDE ratings and an estimated live rating from tournaments on
          chess-results.com that ended after the latest monthly list.
        </p>
      </section>

      <div className="relative">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player name or FIDE ID"
          className="w-full rounded-xl border border-border bg-surface/80 px-12 py-3 text-center text-lg shadow-sm outline-none backdrop-blur-md focus:border-accent focus:ring-2 focus:ring-accent/30"
          aria-label="Search FIDE players"
        />
        <span role="status" aria-live="polite" className="absolute right-4 top-1/2 -translate-y-1/2 text-accent">
          {loading && (
            <>
              <Spinner className="size-5" />
              <span className="sr-only">Searching…</span>
            </>
          )}
        </span>
      </div>

      {error && <p className="text-center text-down">{error}</p>}

      {loading && players.length === 0 && <SkeletonResults />}

      {players.length > 0 && (
        <div
          className={`overflow-hidden rounded-xl border border-border bg-surface/75 backdrop-blur-md transition-opacity ${
            loading ? "opacity-60" : ""
          }`}
        >
          <ul className="divide-y divide-border">
            {players.map((p, i) => (
              <li key={p.fideId} className="animate-in" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                <Link
                  href={`/player/${p.fideId}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2/70"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {p.title && <span className="mr-1.5 text-accent">{p.title}</span>}
                      {p.name}
                    </span>
                    <span className="ml-2 text-sm text-muted">
                      {p.fed} · {p.lastPlayed ? `last played ${p.lastPlayed}` : (p.birthYear ?? "—")} · ID {p.fideId}
                    </span>
                  </span>
                  {source === "fide" && (
                    <span className="flex gap-3 font-mono text-sm tabular-nums">
                      <Rating label="Std" value={p.standard} />
                      <Rating label="Rpd" value={p.rapid} />
                      <Rating label="Blz" value={p.blitz} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {source === "chess-results" && (
            <p className="border-t border-border px-4 py-2 text-center text-xs text-muted">
              FIDE&apos;s site isn&apos;t reachable right now, so these results come from chess-results (no ratings shown).
            </p>
          )}
          {total > players.length && (
            <p className="border-t border-border px-4 py-2 text-center text-sm text-muted">
              Showing {players.length} of {total} matches. Refine the name to narrow it down.
            </p>
          )}
        </div>
      )}

      {!loading && !error && active && players.length === 0 && (
        <p className="animate-in text-center text-muted">No players found.</p>
      )}
    </div>
  );
}

function SkeletonResults() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/75 backdrop-blur-md" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-0">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4" style={{ width: `${55 - i * 7}%` }} />
            <div className="skeleton h-3 w-1/3" />
          </div>
          <div className="flex gap-3">
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 w-12" />
          </div>
        </div>
      ))}
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
