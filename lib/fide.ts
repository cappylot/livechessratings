import * as cheerio from "cheerio";
import { cached, fetchText } from "./http";
import type { HistoryEntry, PlayerSummary, Profile, RatedEvent, RatingType } from "./types";

const FIDE = "https://ratings.fide.com";
const AJAX = { "X-Requested-With": "XMLHttpRequest", Referer: `${FIDE}/` };

const toRating = (s: string | undefined | null): number | null => {
  const n = parseInt((s ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------- parsers (pure, tested against fixtures) ----------

export function parseSearch(html: string): PlayerSummary[] {
  const $ = cheerio.load(html);
  const out: PlayerSummary[] = [];
  $("#table_results tbody tr").each((_, tr) => {
    const td = $(tr).find("td");
    if (td.length < 9) return;
    const cell = (i: number) => $(td[i]).text().trim();
    out.push({
      fideId: cell(0),
      name: cell(1),
      title: cell(2),
      fed: cell(4),
      standard: toRating(cell(5)),
      rapid: toRating(cell(6)),
      blitz: toRating(cell(7)),
      birthYear: toRating(cell(8)),
    });
  });
  return out;
}

export function parseProfile(html: string, fideId: string): Profile {
  const $ = cheerio.load(html);
  const rating = (cls: string) => toRating($(`.${cls} p`).first().text());
  const rankText = $(".profile-rank-block").first().find(".profile-rank-row p").first().text();
  const title = $(".profile-info-title p").first().text().trim();
  return {
    fideId,
    name: $("h1.player-title").first().text().trim(),
    title: title === "None" ? "" : title,
    fed: "",
    federationName: $(".profile-info-country").first().text().trim(),
    standard: rating("profile-standart"),
    rapid: rating("profile-rapid"),
    blitz: rating("profile-blitz"),
    birthYear: toRating($(".profile-info-byear").text()),
    sex: $(".profile-info-sex").text().trim(),
    inactive: $(".inactiv_note").text().trim().length > 0,
    worldRank: toRating(rankText),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseHistory(json: string): HistoryEntry[] {
  const rows = JSON.parse(json.replace(/^﻿+/, "")) as Array<Record<string, string | null>>;
  const out = rows
    .map((r) => {
      const [y, m] = (r.date_2 ?? "").split("-");
      const month = MONTHS.indexOf(m) + 1;
      if (!y || month < 1) return null;
      return {
        period: `${y}-${String(month).padStart(2, "0")}`,
        fed: r.country ?? "",
        standard: toRating(r.rating),
        standardGames: parseInt(r.period_games ?? "0", 10) || 0,
        rapid: toRating(r.rapid_rtng),
        rapidGames: parseInt(r.rapid_games ?? "0", 10) || 0,
        blitz: toRating(r.blitz_rtng),
        blitzGames: parseInt(r.blitz_games ?? "0", 10) || 0,
      } satisfies HistoryEntry;
    })
    .filter((x): x is HistoryEntry => x !== null);
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

export function parseCalculations(html: string): RatedEvent[] {
  const $ = cheerio.load(html);
  const out: RatedEvent[] = [];
  $('a[href*="report.phtml?event="]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const eventId = href.match(/event=(\d+)/)?.[1];
    if (!eventId) return;
    const dates = $(a)
      .closest(".default_div_full")
      .find(".dates_span")
      .map((_, d) => $(d).text().trim())
      .get();
    out.push({ eventId, name: $(a).text().trim(), start: dates[0] ?? "", end: dates[1] ?? dates[0] ?? "" });
  });
  return out;
}

// ---------- network ----------

export function searchPlayers(query: string): Promise<PlayerSummary[]> {
  const q = query.trim();
  return cached(`fide:search:${q.toLowerCase()}`, async () => {
    const { text } = await fetchText(
      `${FIDE}/incl_search_l.php?search=${encodeURIComponent(q)}&simple=1`,
      { headers: AJAX },
    );
    return parseSearch(text);
  });
}

/** Current published ratings of a player, looked up by FIDE ID (lightweight). */
export async function getRatingsById(fideId: string): Promise<PlayerSummary | null> {
  const rows = await searchPlayers(fideId);
  return rows.find((r) => r.fideId === fideId) ?? null;
}

export function getProfile(fideId: string): Promise<Profile> {
  return cached(`fide:profile:${fideId}`, async () => {
    const { text } = await fetchText(`${FIDE}/profile/${fideId}`);
    const profile = parseProfile(text, fideId);
    if (!profile.name) throw new Error(`No FIDE player with ID ${fideId}`);
    // The profile page only shows the federation's full name; the history has the code.
    const history = await getHistory(fideId).catch(() => []);
    profile.fed = history.at(-1)?.fed ?? "";
    return profile;
  });
}

export function getHistory(fideId: string): Promise<HistoryEntry[]> {
  return cached(`fide:history:${fideId}`, async () => {
    const { text } = await fetchText(`${FIDE}/a_chart_data.phtml?event=${fideId}&period=0`, {
      method: "POST",
      headers: AJAX,
    });
    return parseHistory(text);
  });
}

const TYPE_CODE: Record<RatingType, number> = { standard: 0, rapid: 1, blitz: 2 };

/** Tournaments FIDE already rated for the player in the list of `period` ("YYYY-MM"). */
export function getRatedEvents(fideId: string, period: string, type: RatingType): Promise<RatedEvent[]> {
  return cached(`fide:calc:${fideId}:${period}:${type}`, async () => {
    const { text } = await fetchText(
      `${FIDE}/a_indv_calculations.php?id_number=${fideId}&rating_period=${period}-01&t=${TYPE_CODE[type]}`,
      { headers: AJAX },
    );
    return parseCalculations(text);
  });
}
