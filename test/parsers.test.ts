import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parsePlayerCard, parseResult, parseSearchResults, parseTournamentInfo } from "@/lib/chessResults";
import { parseCalculations, parseHistory, parseProfile, parseSearch } from "@/lib/fide";
import { classifyTimeControl } from "@/lib/timeControl";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("FIDE parsers", () => {
  test("search", () => {
    const rows = parseSearch(fx("fide-search.html"));
    expect(rows.length).toBeGreaterThan(5);
    const magnus = rows.find((r) => r.fideId === "1503014")!;
    expect(magnus.name).toBe("Carlsen, Magnus");
    expect(magnus.fed).toBe("NOR");
    expect(magnus.standard).toBeGreaterThan(2700);
  });
  test("profile", () => {
    const p = parseProfile(fx("fide-profile.html"), "1503014");
    expect(p).toMatchObject({ name: "Carlsen, Magnus", title: "Grandmaster", birthYear: 1990, federationName: "Norway" });
    expect(p.standard).toBe(2823);
    expect(p.rapid).toBe(2801);
    expect(p.blitz).toBe(2860);
    expect(p.worldRank).toBe(1);
  });
  test("history", () => {
    const h = parseHistory(fx("fide-history.json"));
    expect(h.at(-1)).toMatchObject({ period: "2026-10", standard: 1953, standardGames: 5, rapid: 1854 });
    expect(h[0].period < h.at(-1)!.period).toBe(true);
  });
  test("calculations", () => {
    expect(parseCalculations(fx("fide-calc.html"))).toEqual([
      { eventId: "493066", name: "23. Sparkassen-Open Forchheim 2026 A-Open", start: "2026-09-25", end: "2026-09-27" },
    ]);
  });
});

describe("chess-results parsers", () => {
  test("player search", () => {
    const rows = parseSearchResults(fx("cr-search.html"));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0]).toMatchObject({ tnr: "1504858", snr: "45", fideId: "16241657", endDate: "2026-09-27", rounds: 5 });
  });
  test("player card", () => {
    const c = parsePlayerCard(fx("cr-player-card.html"));
    expect(c).toMatchObject({ name: "Albayrak, Berrak", fideId: "16241657", ratingInternational: 1966, fideChange: -13 });
    expect(c.games.map((g) => g.result)).toEqual([0.5, 0, 0, 0.5, 1]);
    expect(c.games[0]).toMatchObject({ round: "1", sno: "62", name: "Wolfmaier, Johannes jun", rating: 1989 });
  });
  test("player card whose rows have more cells than the header", () => {
    const c = parsePlayerCard(fx("cr-player-card-rr.html"));
    expect(c.games[0]).toMatchObject({ round: "1", sno: "4", name: "Albayrak, Melissa", rating: 1558, result: 0 });
    expect(c.games[3]).toMatchObject({ name: "Stangl, Anita", result: 1 });
  });
  test("tournament details + starting list", () => {
    const t = parseTournamentInfo(fx("cr-art0.html"), "1504858");
    expect(t).toMatchObject({
      fideEventId: "493066",
      startDate: "2026-09-25",
      endDate: "2026-09-27",
      statedType: null,
      isTest: false,
    });
    expect(t.timeControl).toContain("40/90min");
    expect(t.startList.find((p) => p.sno === "62")).toMatchObject({ name: "Wolfmaier, Johannes jun", fideId: "34643303" });
  });
  test("results", () => {
    expect(parseResult("½").result).toBe(0.5);
    expect(parseResult("- 0K").skip).toBe("forfeit");
    expect(parseResult("+").skip).toBe("forfeit");
    expect(parseResult("").skip).toBe("not played yet");
  });
});

describe("classifyTimeControl", () => {
  test.each([
    ["40/90min + Zug/30sec  All/15mmin", "standard"],
    ["40 Moves/90min/30sec all/15min/30sec", "standard"],
    ["90'+30", "standard"],
    ["15min + 10sec", "rapid"],
    ["10min+5sek", "rapid"],
    ["3min + 2s/move", "blitz"],
    ["5+3", "blitz"],
    ["Game/15 + 10 seconds per move", "rapid"],
  ])("%s -> %s", (tc, type) => expect(classifyTimeControl(null, "Open", tc)).toBe(type));
  test("stated type and name keywords win", () => {
    expect(classifyTimeControl("rapid", "Open", "90min")).toBe("rapid");
    expect(classifyTimeControl(null, "Vereinsblitzmeisterschaft", "")).toBe("blitz");
  });
});
