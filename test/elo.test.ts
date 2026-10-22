import { describe, expect, test } from "vitest";
import { calcTournament, effectiveK, expectedScore, kFactor, performance, summarize } from "@/lib/elo";
import type { HistoryEntry, LiveTournament } from "@/lib/types";

const hist = (games: number, peak = 2000): HistoryEntry[] => [
  { period: "2026-09", fed: "GER", standard: peak, standardGames: games, rapid: null, rapidGames: 0, blitz: null, blitzGames: 0 },
];

function tournament(own: number, games: Array<[number, number]>): LiveTournament {
  return {
    tnr: "1", snr: "1", name: "T", url: "", startDate: null, endDate: "2026-10-18", ongoing: false,
    type: "standard", timeControl: "", fideEventId: null, status: "pending", playerRating: own, chessResultsChange: null,
    games: games.map(([opp, res], i) => ({
      round: String(i + 1), opponent: `O${i}`, opponentFideId: null, opponentRating: opp,
      ratingSource: "fide", result: res, rawResult: String(res),
    })),
  };
}

describe("expectedScore", () => {
  test("matches FIDE table 8.1.2 (values from a FIDE calculation page)", () => {
    expect(expectedScore(1966, 1908)).toBe(0.58);
    expect(expectedScore(1966, 1860)).toBe(0.64);
    expect(expectedScore(1966, 2099)).toBe(0.32);
    expect(expectedScore(1966, 1955)).toBe(0.52);
    expect(expectedScore(2000, 2000)).toBe(0.5);
  });
  test("caps the difference at 400", () => {
    expect(expectedScore(2400, 1500)).toBe(0.92);
    expect(expectedScore(1500, 2400)).toBe(0.08);
  });
});

describe("kFactor", () => {
  test("new players get 40", () => expect(kFactor("standard", 1500, hist(10, 1500), 1990, 2026).base).toBe(40));
  test("juniors under 2300 get 40", () => expect(kFactor("standard", 2100, hist(200, 2100), 2010, 2026).base).toBe(40));
  test("adults below 2400 get 20", () => expect(kFactor("standard", 2100, hist(200, 2100), 1990, 2026).base).toBe(20));
  test("anyone who reached 2400 gets 10", () => expect(kFactor("standard", 2350, hist(200, 2410), 1990, 2026).base).toBe(10));
  test("without FIDE history K is assumed", () => {
    expect(kFactor("standard", 2100, [], null, 2026).base).toBe(20);
    expect(kFactor("standard", 2450, [], null, 2026).base).toBe(10);
  });
  test("rapid and blitz use 20", () => expect(kFactor("blitz", 1500, hist(5, 1500), 2012, 2026).base).toBe(20));
});

test("K x n is capped at 700", () => {
  expect(effectiveK(40, 10)).toBe(40);
  expect(effectiveK(40, 20)).toBe(35);
  expect(effectiveK(20, 36)).toBe(19);
});

test("FIDE's own calculation for a 5-game tournament (total -13.40)", () => {
  const t = tournament(1966, [[1908, 0.5], [1860, 0], [2099, 0], [1886, 0.5], [1955, 1]]);
  const c = calcTournament(t, 1966);
  expect(c.games).toBe(5);
  expect(c.diff * 20).toBeCloseTo(-13.4, 5);
});

test("summarize applies toggles and the live rating", () => {
  const t = tournament(2065, [[1739, 1], [2313, 0.5], [2237, 0], [1910, 1], [2192, 0], [1949, 0], [1908, 0.5]]);
  const official = { standard: 2065, rapid: null, blitz: 1884 };
  const k = { standard: { base: 20, reason: "" }, rapid: { base: 20, reason: "" }, blitz: { base: 20, reason: "" } };
  const on = summarize([t], new Set(["1:1"]), official, k);
  expect(on.standard.change).toBeCloseTo(-14.8, 5);
  expect(on.standard.live).toBe(2050);
  const off = summarize([t], new Set(), official, k);
  expect(off.standard.live).toBe(2065);
  expect(off.standard.games).toBe(0);
});

test("performance", () => {
  expect(performance([2000, 2000], 1)).toBe(2000);
  expect(performance([2000], 1)).toBe(2800);
  expect(performance([], 0)).toBeNull();
});
