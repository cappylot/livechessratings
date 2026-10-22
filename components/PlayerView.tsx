"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "./Spinner";
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
      <div className="animate-in rounded-xl border border-border bg-surface/75 p-6 backdrop-blur-md">
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
            <p className="animate-in text-sm text-muted">
              Latest official list: <span className="text-foreground">{formatPeriod(live.lastList)}</span>
            </p>
          )}
        </div>
        {liveError && <p className="animate-in text-down">{liveError}</p>}
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
    return (
      <section className="space-y-3" aria-busy="true" aria-label="Loading player">
        <div className="skeleton h-9 w-64 max-w-full" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </section>
    );
  }
  return (
    <section className="animate-in flex flex-wrap items-end justify-between gap-4">
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
    <div className="rounded-xl border border-border bg-surface/75 p-5 backdrop-blur-md">
      <p className="text-sm font-medium text-muted">{TYPE_LABEL[type]}</p>
      <div className="mt-2 flex h-10 items-baseline gap-3">
        {official === undefined ? (
          <div className="skeleton h-10 w-28" aria-hidden />
        ) : (
          <span
            key={hasGames ? `live-${summary!.live}` : "official"}
            className="animate-in font-mono text-4xl font-semibold tabular-nums"
          >
            {official === null ? "—" : hasGames ? summary!.live : official}
          </span>
        )}
        {hasGames && official !== null && (
          <span
            key={change.toFixed(1)}
            className={`animate-in font-mono text-lg tabular-nums ${change >= 0 ? "text-up" : "text-down"}`}
          >
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        {official === undefined ? (
          <span className="skeleton inline-block h-3.5 w-40" aria-hidden />
        ) : official === null ? (
          "Unrated"
        ) : loading ? (
          <>
            <span>Official {official} ·</span>
            <Spinner className="size-3.5 text-accent" />
            <span className="text-shimmer">checking tournaments…</span>
          </>
        ) : hasGames
              ? `Official ${official} · ${summary!.games} game${summary!.games === 1 ? "" : "s"} pending · K ${summary!.k}`
              : `Official ${official} · no pending games`}
      </p>
      {hasGames && kReason && rounded !== 0 && <p className="mt-1 text-xs text-muted">{kReason}</p>}
    </div>
  );
}

const LOADING_STEPS = [
  "Searching chess-results…",
  "Reading tournament details…",
  "Looking up opponents' ratings…",
  "Calculating rating changes…",
];

function LoadingTournaments() {
  // Timed hints, not real progress: the API answers once everything is done.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/75 p-5 backdrop-blur-md">
      <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
        <Spinner className="size-4 text-accent" />
        <span key={step} className="animate-in text-shimmer">
          {LOADING_STEPS[step]}
        </span>
        <span className="ml-auto hidden text-xs text-muted sm:inline">can take up to a minute</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-1" aria-hidden>
          <div className="skeleton size-4" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4" style={{ width: `${60 - i * 12}%` }} />
            <div className="skeleton h-3 w-24" />
          </div>
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
