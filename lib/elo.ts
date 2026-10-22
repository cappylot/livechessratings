// FIDE rating maths (FIDE Rating Regulations, sections 7 and 8).
// Pure functions — used by the server and by the client when the user toggles tournaments.

import type { HistoryEntry, KInfo, LiveGame, LiveTournament, RatingType } from "./types";

// Table 8.1.2: upper bound of rating difference -> expected score of the higher-rated player.
const PD_TABLE: Array<[number, number]> = [
  [3, 0.5], [10, 0.51], [17, 0.52], [25, 0.53], [32, 0.54], [39, 0.55], [46, 0.56], [53, 0.57],
  [61, 0.58], [68, 0.59], [76, 0.6], [83, 0.61], [91, 0.62], [98, 0.63], [106, 0.64], [113, 0.65],
  [121, 0.66], [129, 0.67], [137, 0.68], [145, 0.69], [153, 0.7], [162, 0.71], [170, 0.72],
  [179, 0.73], [188, 0.74], [197, 0.75], [206, 0.76], [215, 0.77], [225, 0.78], [235, 0.79],
  [245, 0.8], [256, 0.81], [267, 0.82], [278, 0.83], [290, 0.84], [302, 0.85], [315, 0.86],
  [328, 0.87], [344, 0.88], [357, 0.89], [374, 0.9], [391, 0.91], [411, 0.92], [432, 0.93],
  [456, 0.94], [484, 0.95], [517, 0.96], [559, 0.97], [619, 0.98], [735, 0.99],
];

/** Expected score of a player rated `own` against `opp`, with the 400-point cap. */
export function expectedScore(own: number, opp: number): number {
  const diff = Math.max(-400, Math.min(400, own - opp));
  const d = Math.abs(diff);
  const higher = PD_TABLE.find(([max]) => d <= max)?.[1] ?? 1;
  return diff >= 0 ? higher : Math.round((1 - higher) * 100) / 100;
}

// Table 8.1.1: fractional score -> rating difference (performance).
const DP_TABLE = [
  0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158,
  166, 175, 184, 193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366,
  383, 401, 422, 444, 470, 501, 538, 589, 677, 800,
];

export function performance(opponents: number[], score: number): number | null {
  if (!opponents.length) return null;
  const avg = opponents.reduce((a, b) => a + b, 0) / opponents.length;
  const p = Math.round((score / opponents.length) * 100);
  const dp = p >= 50 ? DP_TABLE[p - 50] : -DP_TABLE[50 - p];
  return Math.round(avg + dp);
}

/**
 * Development coefficient for the next list (Rating Regulations 8.3.3).
 * Rapid and blitz use K = 20.
 */
export function kFactor(
  type: RatingType,
  rating: number | null,
  history: HistoryEntry[],
  birthYear: number | null,
  year: number,
): KInfo {
  if (type !== "standard") return { base: 20, reason: "rapid/blitz: K = 20" };
  if (!history.length) {
    return (rating ?? 0) >= 2400
      ? { base: 10, reason: "FIDE history unavailable; rated 2400+: K = 10" }
      : { base: 20, reason: "FIDE history unavailable; assumed K = 20" };
  }
  const totalGames = history.reduce((s, h) => s + h.standardGames, 0);
  const everAbove2400 = history.some((h) => (h.standard ?? 0) >= 2400) || (rating ?? 0) >= 2400;
  if (everAbove2400) return { base: 10, reason: "has reached 2400: K = 10" };
  if (totalGames < 30) return { base: 40, reason: `fewer than 30 rated games (${totalGames}): K = 40` };
  if (birthYear && year - birthYear <= 18 && (rating ?? 0) < 2300)
    return { base: 40, reason: "junior under 2300: K = 40" };
  return { base: 20, reason: "rated below 2400: K = 20" };
}

/** K x n may not exceed 700 within one rating period (8.3.3). */
export function effectiveK(base: number, gamesInPeriod: number): number {
  if (gamesInPeriod > 0 && base * gamesInPeriod > 700) return Math.floor(700 / gamesInPeriod);
  return base;
}

export const countsForRating = (g: LiveGame) => g.result !== null && g.opponentRating !== null && !g.skip;

export type TournamentCalc = {
  games: number;
  score: number;
  expected: number;
  /** sum(W - We), multiply by K for the change */
  diff: number;
  performance: number | null;
};

export function calcTournament(t: LiveTournament, own: number): TournamentCalc {
  const counted = t.games.filter(countsForRating);
  let score = 0;
  let expected = 0;
  for (const g of counted) {
    score += g.result!;
    expected += expectedScore(own, g.opponentRating!);
  }
  return {
    games: counted.length,
    score,
    expected,
    diff: score - expected,
    performance: performance(
      counted.map((g) => g.opponentRating!),
      score,
    ),
  };
}

export type TypeSummary = {
  official: number | null;
  live: number | null;
  change: number;
  games: number;
  k: number;
  perTournament: Map<string, { calc: TournamentCalc; change: number }>;
};

/**
 * Live rating per type from the tournaments the user has enabled. All pending
 * games are rated together from the published rating, as FIDE does per period.
 */
export function summarize(
  tournaments: LiveTournament[],
  enabled: Set<string>,
  official: Record<RatingType, number | null>,
  k: Record<RatingType, KInfo>,
): Record<RatingType, TypeSummary> {
  const out = {} as Record<RatingType, TypeSummary>;
  for (const type of ["standard", "rapid", "blitz"] as RatingType[]) {
    const own = official[type];
    const perTournament = new Map<string, { calc: TournamentCalc; change: number }>();
    const mine = tournaments.filter((t) => t.type === type && enabled.has(key(t)));
    if (own === null) {
      out[type] = { official: null, live: null, change: 0, games: 0, k: k[type].base, perTournament };
      continue;
    }
    const calcs = mine.map((t) => [t, calcTournament(t, own)] as const);
    const games = calcs.reduce((s, [, c]) => s + c.games, 0);
    const kEff = effectiveK(k[type].base, games);
    let change = 0;
    for (const [t, c] of calcs) {
      const delta = c.diff * kEff;
      change += delta;
      perTournament.set(key(t), { calc: c, change: delta });
    }
    out[type] = { official: own, live: Math.round(own + change), change, games, k: kEff, perTournament };
  }
  return out;
}

export const key = (t: { tnr: string; snr: string }) => `${t.tnr}:${t.snr}`;
