"use client";

import { useEffect, useMemo, useState } from "react";
import { key, summarize, type TypeSummary } from "@/lib/elo";
import { RATING_TYPES, type LiveResponse, type Profile, type RatingType } from "@/lib/types";
import { TournamentTable } from "./TournamentTable";

const TYPE_LABEL: Record<RatingType, string> = { standard: "Standard", rapid: "Rapid", blitz: "Blitz" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const formatPeriod = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export function PlayerView({ fideId }: { fideId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/player/${fideId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load profile");
        setProfile(d.profile);
      })
      .catch((e) => setProfileError(e.message));
    fetch(`/api/live/${fideId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load tournaments");
        setLive(d);
        setEnabled(new Set((d as LiveResponse).tournaments.filter((t) => t.status === "pending").map(key)));
      })
      .catch((e) => setLiveError(e.message));
  }, [fideId]);

  const summary = useMemo(
    () => (live ? summarize(live.tournaments, enabled, live.official, live.k) : null),
    [live, enabled],
  );

  const toggle = (k: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (profileError) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-down">{profileError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ProfileHeader profile={profile} fideId={fideId} />

      <section className="grid gap-4 sm:grid-cols-3">
        {RATING_TYPES.map((t) => (
          <RatingCard
            key={t}
            type={t}
            official={profile ? profile[t] : undefined}
            summary={summary?.[t]}
            kReason={live?.k[t].reason}
            loading={!live && !liveError}
          />
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Recent tournaments</h2>
          {live && (
            <p className="text-sm text-muted">
              Latest official list: <span className="text-foreground">{formatPeriod(live.lastList)}</span>
            </p>
          )}
        </div>
        {liveError && <p className="text-down">{liveError}</p>}
        {live?.warnings.map((w) => (
          <p key={w} className="text-sm text-muted">
            {w}
          </p>
        ))}
        {!live && !liveError && <LoadingTournaments />}
        {live && summary && (
          <TournamentTable tournaments={live.tournaments} enabled={enabled} onToggle={toggle} summary={summary} />
        )}
      </section>
    </div>
  );
}

function ProfileHeader({ profile, fideId }: { profile: Profile | null; fideId: string }) {
  if (!profile) {
    return <div className="h-16 animate-pulse rounded-xl bg-surface-2" />;
  }
  return (
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.title && <span className="mr-2 text-accent">{abbreviateTitle(profile.title)}</span>}
          {profile.name}
        </h1>
        <p className="mt-1 text-muted">
          {[profile.federationName, profile.birthYear && `born ${profile.birthYear}`, `FIDE ID ${fideId}`, profile.worldRank && `world rank #${profile.worldRank}`]
            .filter(Boolean)
            .join(" · ")}
          {profile.inactive && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">inactive</span>}
        </p>
      </div>
      <a
        href={`https://ratings.fide.com/profile/${fideId}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-accent underline-offset-4 hover:underline"
      >
        FIDE profile ↗
      </a>
    </section>
  );
}

const TITLES: Record<string, string> = {
  Grandmaster: "GM",
  "International Master": "IM",
  "FIDE Master": "FM",
  "Candidate Master": "CM",
  "Woman Grandmaster": "WGM",
  "Woman International Master": "WIM",
  "Woman FIDE Master": "WFM",
  "Woman Candidate Master": "WCM",
};
const abbreviateTitle = (t: string) => TITLES[t] ?? t;

function RatingCard({
  type,
  official,
  summary,
  kReason,
  loading,
}: {
  type: RatingType;
  official: number | null | undefined;
  summary?: TypeSummary;
  kReason?: string;
  loading: boolean;
}) {
  const change = summary?.change ?? 0;
  const rounded = Math.round(change);
  const hasGames = (summary?.games ?? 0) > 0;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-muted">{TYPE_LABEL[type]}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-4xl font-semibold tabular-nums">
          {official === undefined ? "…" : official === null ? "—" : hasGames ? summary!.live : official}
        </span>
        {hasGames && official !== null && (
          <span className={`font-mono text-lg tabular-nums ${change >= 0 ? "text-up" : "text-down"}`}>
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {official === null || official === undefined
          ? "Unrated"
          : loading
            ? `Official ${official} · checking tournaments…`
            : hasGames
              ? `Official ${official} · ${summary!.games} game${summary!.games === 1 ? "" : "s"} pending · K ${summary!.k}`
              : `Official ${official} · no pending games`}
      </p>
      {hasGames && kReason && rounded !== 0 && <p className="mt-1 text-xs text-muted">{kReason}</p>}
    </div>
  );
}

function LoadingTournaments() {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">Searching chess-results and checking each tournament… this can take up to a minute.</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}
