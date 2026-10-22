"use client";

import { Fragment, useState } from "react";
import { calcTournament, countsForRating, expectedScore, key, type TypeSummary } from "@/lib/elo";
import type { LiveTournament, RatingType, TournamentStatus } from "@/lib/types";

const STATUS: Record<TournamentStatus, { label: string; tone: string }> = {
  pending: { label: "Counts", tone: "bg-accent-soft text-accent" },
  rated: { label: "Already rated", tone: "bg-surface-2 text-muted" },
  "not-fide": { label: "Not FIDE-rated", tone: "bg-surface-2 text-muted" },
  test: { label: "Test event", tone: "bg-surface-2 text-muted" },
  future: { label: "Upcoming", tone: "bg-surface-2 text-muted" },
  old: { label: "Older", tone: "bg-surface-2 text-muted" },
  error: { label: "Error", tone: "bg-surface-2 text-down" },
};

const TYPE_SHORT: Record<RatingType, string> = { standard: "Std", rapid: "Rpd", blitz: "Blz" };

const fmtScore = (s: number) => (s % 1 ? `${Math.floor(s) || ""}½` : String(s));
const fmtDelta = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;

export function TournamentTable({
  tournaments,
  enabled,
  onToggle,
  summary,
}: {
  tournaments: LiveTournament[];
  enabled: Set<string>;
  onToggle: (key: string) => void;
  summary: Record<RatingType, TypeSummary>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (!tournaments.length) {
    return (
      <div className="animate-in rounded-xl border border-border bg-surface/75 p-5 text-muted backdrop-blur-md">
        No tournaments on chess-results since the previous rating list.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface/75 backdrop-blur-md">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="w-10 px-3 py-2" aria-label="Include" />
            <th className="px-3 py-2">Tournament</th>
            <th className="px-3 py-2">Ended</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">Perf.</th>
            <th className="px-3 py-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {tournaments.map((t, i) => {
            const k = key(t);
            const on = enabled.has(k);
            const type = t.type;
            const own = type ? summary[type].official : null;
            const calc = type ? summary[type].perTournament.get(k) : undefined;
            // Score and performance are shown even for tournaments that aren't counted.
            const stats = calc?.calc ?? (own !== null && t.games.length ? calcTournament(t, own) : undefined);
            const playable = t.status !== "test" && t.status !== "future" && t.status !== "error" && !!type && own !== null;
            const status = STATUS[t.status];
            const isOpen = open.has(k);
            return (
              <Fragment key={k}>
                <tr
                  className={`animate-in border-b border-border last:border-0 ${on ? "" : "text-muted"}`}
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                >
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!playable}
                      onChange={() => onToggle(k)}
                      className="size-4 accent-[var(--accent)]"
                      aria-label={`Include ${t.name}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <button
                      onClick={() => toggleOpen(k)}
                      className="text-left font-medium hover:underline"
                      aria-expanded={isOpen}
                    >
                      <span className="mr-1 inline-block w-3 text-muted">{isOpen ? "▾" : "▸"}</span>
                      {t.name}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-4">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${status.tone}`}>{status.label}</span>
                      {t.ongoing && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">In progress</span>}
                      {t.reason && <span className="text-xs text-muted">{t.reason}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top tabular-nums">{t.endDate}</td>
                  <td className="px-3 py-3 align-top">{type ? TYPE_SHORT[type] : "—"}</td>
                  <td className="px-3 py-3 text-right align-top font-mono tabular-nums">
                    {stats?.games ? `${fmtScore(stats.score)}/${stats.games}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right align-top font-mono tabular-nums">
                    {stats?.performance ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right align-top font-mono tabular-nums">
                    {calc ? (
                      <span className={calc.change >= 0 ? "text-up" : "text-down"}>{fmtDelta(calc.change)}</span>
                    ) : (
                      "—"
                    )}
                    {t.chessResultsChange !== null && (
                      <div className="text-xs text-muted" title="Rating change shown on chess-results">
                        c-r: {t.chessResultsChange > 0 ? "+" : ""}
                        {t.chessResultsChange}
                      </div>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="animate-in border-b border-border bg-surface-2/60">
                    <td />
                    <td colSpan={6} className="px-3 py-3">
                      <GameList t={t} own={own} />
                      <p className="mt-2 text-xs text-muted">
                        {t.timeControl && <>Time control: {t.timeControl} · </>}
                        <a href={t.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          View on chess-results ↗
                        </a>
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GameList({ t, own }: { t: LiveTournament; own: number | null }) {
  if (!t.games.length) return <p className="text-xs text-muted">No games found.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted">
          <th className="py-1 pr-2">Rd</th>
          <th className="py-1 pr-2">Opponent</th>
          <th className="py-1 pr-2 text-right">FIDE</th>
          <th className="py-1 pr-2 text-right">Res</th>
          <th className="py-1 pr-2 text-right">Exp.</th>
          <th className="py-1">Note</th>
        </tr>
      </thead>
      <tbody>
        {t.games.map((g, i) => {
          const counts = countsForRating(g);
          const exp = counts && own !== null ? expectedScore(own, g.opponentRating!) : null;
          return (
            <tr key={i} className={counts ? "" : "text-muted"}>
              <td className="py-1 pr-2 tabular-nums">{g.round}</td>
              <td className="py-1 pr-2">
                {g.opponentFideId ? (
                  <a href={`/player/${g.opponentFideId}`} className="hover:underline">
                    {g.opponent || "—"}
                  </a>
                ) : (
                  g.opponent || "—"
                )}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums">
                {g.opponentRating ?? "—"}
                {g.ratingSource === "chess-results" && (
                  <span title="Rating taken from chess-results; may be a national rating">*</span>
                )}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{g.result === null ? g.rawResult || "—" : fmtScore(g.result)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums">{exp?.toFixed(2) ?? ""}</td>
              <td className="py-1">{g.skip ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
