import * as cheerio from "cheerio";
import { cached, cookieHeader, fetchText } from "./http";
import type { RatingType } from "./types";

export const CR_BASE = "https://s3.chess-results.com";
const SEARCH_URL = `${CR_BASE}/SpielerSuche.aspx?lan=1`;

export type CrSearchRow = {
  tnr: string;
  snr: string;
  playerName: string;
  fideId: string;
  fed: string;
  tournament: string;
  endDate: string; // YYYY-MM-DD
  rounds: number;
};

export type CrGame = {
  round: string;
  sno: string | null;
  name: string;
  rating: number | null;
  fed: string;
  rawResult: string;
  /** 1, 0.5 or 0 for a played game; null for byes, forfeits and unplayed rounds */
  result: number | null;
  skip?: string;
};

export type CrPlayerCard = {
  name: string;
  fideId: string | null;
  ratingInternational: number | null;
  fideChange: number | null;
  games: CrGame[];
};

export type CrStartEntry = { sno: string; name: string; fideId: string | null; rating: number | null };

export type CrTournamentInfo = {
  tnr: string;
  name: string;
  details: Record<string, string>;
  timeControl: string;
  /** Rating type stated by chess-results, e.g. "Time control (Rapid)" */
  statedType: RatingType | null;
  ratingCalculation: string;
  fideEventId: string | null;
  startDate: string | null;
  endDate: string | null;
  isTest: boolean;
  startList: CrStartEntry[];
};

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const toInt = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isoDate = (s: string) => {
  const m = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** Collect every form field ASP.NET expects back (hidden + text inputs, selects). */
function formFields($: cheerio.CheerioAPI): Record<string, string> {
  const form: Record<string, string> = {};
  $("input").each((_, el) => {
    const name = $(el).attr("name");
    const type = ($(el).attr("type") ?? "text").toLowerCase();
    if (!name || type === "submit" || type === "checkbox" || type === "image") return;
    form[name] = $(el).attr("value") ?? "";
  });
  $("select").each((_, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    const selected = $(el).find("option[selected]").attr("value") ?? $(el).find("option").first().attr("value");
    form[name] = selected ?? "";
  });
  return form;
}

/** Map header labels ("Rd.", "Name", ...) to column indexes of a chess-results table. */
function headerIndex($: cheerio.CheerioAPI, headerRow: cheerio.Cheerio<never>): Record<string, number> {
  const idx: Record<string, number> = {};
  headerRow.children("th,td").each((i, el) => {
    const label = clean($(el).text());
    if (label && idx[label] === undefined) idx[label] = i;
  });
  return idx;
}

// ---------- parsers ----------

export function parseSearchResults(html: string): CrSearchRow[] {
  const $ = cheerio.load(html);
  const out: CrSearchRow[] = [];
  const header = $("tr")
    .filter((_, tr) => {
      const labels = $(tr).children("th,td").map((_, c) => clean($(c).text())).get();
      return labels.includes("End-Date") && labels.includes("FideID");
    })
    .first();
  if (!header.length) return out;
  const idx = headerIndex($, header as never);
  header.nextAll("tr").each((_, tr) => {
    const td = $(tr).children("td");
    const link = $(tr).find('a[href*="art=9"]').attr("href") ?? "";
    const m = link.match(/tnr(\d+)\.aspx\?.*snr=(\d+)/);
    if (!m) return;
    const cell = (label: string) => clean($(td[idx[label]]).text());
    const end = isoDate(cell("End-Date"));
    if (!end) return;
    out.push({
      tnr: m[1],
      snr: m[2],
      playerName: cell("Name"),
      fideId: cell("FideID"),
      fed: cell("FED"),
      tournament: cell("Tournament"),
      endDate: end,
      rounds: parseInt(cell("Rd."), 10) || 0,
    });
  });
  return out;
}

export function parseResult(raw: string): { result: number | null; skip?: string } {
  const r = clean(raw);
  if (!r) return { result: null, skip: "not played yet" };
  // Forfeits ("+", "-", "1K", "0K", "+ 1K"...) and byes don't count for FIDE.
  if (/K|^[+\-]$|^[+\-]\s/.test(r)) return { result: null, skip: "forfeit" };
  if (r === "1") return { result: 1 };
  if (r === "0") return { result: 0 };
  if (r === "½" || r === "1/2" || r === "0,5" || r === "0.5") return { result: 0.5 };
  return { result: null, skip: `unknown result "${r}"` };
}

export function parsePlayerCard(html: string): CrPlayerCard {
  const $ = cheerio.load(html);
  const info: Record<string, string> = {};
  $("table.CRs1")
    .first()
    .find("tr")
    .each((_, tr) => {
      const td = $(tr).children("td");
      if (td.length === 2) info[clean($(td[0]).text())] = clean($(td[1]).text());
    });

  const games: CrGame[] = [];
  const header = $("tr")
    .filter((_, tr) => {
      const labels = $(tr).children("th").map((_, th) => clean($(th).text())).get();
      return labels.includes("Rd.") && labels.includes("Res.");
    })
    .first();
  if (header.length) {
    const idx = headerIndex($, header as never);
    const headerCount = header.children("th,td").length;
    header.nextAll("tr").each((_, tr) => {
      const td = $(tr).children("td");
      if (td.length < 3) return;
      // Some cards have more cells per row than header labels (e.g. an unlabeled
      // board column after "Rd."), so align everything but "Rd." from the right.
      const offset = Math.max(0, td.length - headerCount);
      const col = (label: string) => (idx[label] === undefined ? -1 : idx[label] === 0 ? 0 : idx[label] + offset);
      const cell = (label: string) => (col(label) < 0 ? "" : clean($(td[col(label)]).text()));
      // The result cell wraps a colour marker table; take its last text cell.
      const resCell = $(td[col("Res.")]);
      const inner = resCell.find("td");
      const rawResult = clean((inner.length ? inner.last() : resCell).text());
      const name = cell("Name");
      const sno = cell("SNo") || null;
      const parsed = parseResult(rawResult);
      const isBye = !name || /^(bye|spielfrei|not paired|nicht ausgelost)/i.test(name);
      games.push({
        round: cell("Rd."),
        sno,
        name,
        rating: toInt(cell("Rtg")),
        fed: cell("FED"),
        rawResult,
        result: isBye ? null : parsed.result,
        skip: isBye ? "bye" : parsed.skip,
      });
    });
  }

  const change = info["FIDE rtg +/-"];
  return {
    name: info["Name"] ?? "",
    fideId: info["Fide-ID"] && info["Fide-ID"] !== "0" ? info["Fide-ID"] : null,
    ratingInternational: toInt(info["Rating international"] ?? ""),
    fideChange: change !== undefined && change !== "" && !isNaN(parseFloat(change)) ? parseFloat(change.replace(",", ".")) : null,
    games,
  };
}

export function parseTournamentInfo(html: string, tnr: string): CrTournamentInfo {
  const $ = cheerio.load(html);
  const details: Record<string, string> = {};
  $("tr").each((_, tr) => {
    const td = $(tr).children("td.CR");
    if (td.length === 2 && $(tr).children().length === 2) {
      const label = clean($(td[0]).text());
      if (label && !(label in details)) details[label] = clean($(td[1]).text());
    }
  });

  const tcKey = Object.keys(details).find((k) => k.startsWith("Time control"));
  const typeMatch = tcKey?.match(/\((Standard|Rapid|Blitz)\)/i);
  const statedType = typeMatch ? (typeMatch[1].toLowerCase() as RatingType) : null;

  const dateText = details["Date"] ?? "";
  const dates = [...dateText.matchAll(/\d{4}\/\d{2}\/\d{2}/g)].map((m) => isoDate(m[0])!);

  const startList: CrStartEntry[] = [];
  const header = $("tr")
    .filter((_, tr) => {
      const labels = $(tr).children("th").map((_, th) => clean($(th).text())).get();
      return labels.includes("No.") && labels.includes("Name");
    })
    .first();
  if (header.length) {
    const idx = headerIndex($, header as never);
    header.nextAll("tr").each((_, tr) => {
      const td = $(tr).children("td");
      const cell = (label: string) => (idx[label] === undefined ? "" : clean($(td[idx[label]]).text()));
      const sno = cell("No.");
      if (!/^\d+$/.test(sno)) return;
      const fid = cell("FideID");
      startList.push({ sno, name: cell("Name"), fideId: /^\d+$/.test(fid) && fid !== "0" ? fid : null, rating: toInt(cell("Rtg")) });
    });
  }

  return {
    tnr,
    name: clean($("h2").first().text()),
    details,
    timeControl: tcKey ? details[tcKey] : "",
    statedType,
    ratingCalculation: details["Rating calculation"] ?? "",
    fideEventId: details["FIDE-Event-ID"]?.match(/\d+/)?.[0] ?? null,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    isTest: /This is a test tournament/i.test($("body").text()),
    startList,
  };
}

// ---------- network ----------

/** Replay the ASP.NET player-search form with the given fields. */
async function playerSearch(fields: Record<string, string>): Promise<CrSearchRow[]> {
  const first = await fetchText(SEARCH_URL);
  const form = formFields(cheerio.load(first.text));
  Object.assign(form, fields, {
    ctl00$P1$combo_anzahl_zeilen: "1", // 250 rows
    ctl00$P1$cb_suchen: "Search",
  });
  const res = await fetchText(SEARCH_URL, { form, cookie: cookieHeader(first.cookies) });
  return parseSearchResults(res.text);
}

export function searchByFideId(fideId: string): Promise<CrSearchRow[]> {
  return cached(`cr:search:${fideId}`, async () => {
    const rows = await playerSearch({
      ctl00$P1$txt_fideID: fideId,
      ctl00$P1$combo_Sort: "2", // FIDE-ID, end date descending
    });
    return rows.filter((r) => r.fideId === fideId);
  });
}

export type CrPlayer = { fideId: string; name: string; fed: string; tournaments: number; lastPlayed: string };

/** Group search rows (one per tournament) into players with a FIDE ID, most active first. */
export function groupPlayers(rows: CrSearchRow[]): CrPlayer[] {
  const byId = new Map<string, CrPlayer>();
  const today = new Date().toISOString().slice(0, 10);
  // Prefer a past tournament over a registration for a future one.
  const better = (date: string, than: string) =>
    date <= today ? than > today || date > than : than > today && date < than;
  for (const r of rows) {
    if (!/^\d+$/.test(r.fideId) || r.fideId === "0") continue;
    const p = byId.get(r.fideId);
    if (!p) {
      byId.set(r.fideId, { fideId: r.fideId, name: r.playerName, fed: r.fed, tournaments: 1, lastPlayed: r.endDate });
    } else {
      p.tournaments++;
      if (better(r.endDate, p.lastPlayed)) {
        p.lastPlayed = r.endDate;
        p.name = r.playerName;
        p.fed = r.fed || p.fed;
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
}

/**
 * Name search on chess-results (fallback when ratings.fide.com is unreachable).
 * Accepts "Last, First", "First Last" or just a last name.
 */
export function searchByName(query: string): Promise<CrPlayer[]> {
  const q = query.trim().replace(/\s+/g, " ");
  return cached(`cr:name:${q.toLowerCase()}`, async () => {
    const search = (last: string, first = "") =>
      playerSearch({ ctl00$P1$txt_nachname: last, ctl00$P1$txt_vorname: first, ctl00$P1$combo_Sort: "0" }).then(
        groupPlayers,
      );
    if (q.includes(",")) {
      const [last, first] = q.split(",").map((x) => x.trim());
      return search(last, first);
    }
    const words = q.split(" ");
    if (words.length === 1) return search(q);
    // "Magnus Carlsen" or "Carlsen Magnus": try both orders, then the whole text as last name.
    const asFirstLast = await search(words.at(-1)!, words.slice(0, -1).join(" "));
    if (asFirstLast.length) return asFirstLast;
    const asLastFirst = await search(words[0], words.slice(1).join(" "));
    return asLastFirst.length ? asLastFirst : search(q);
  });
}

export function getPlayerCard(tnr: string, snr: string): Promise<CrPlayerCard> {
  return cached(`cr:card:${tnr}:${snr}`, async () => {
    const { text } = await fetchText(`${CR_BASE}/tnr${tnr}.aspx?lan=1&art=9&snr=${snr}`);
    return parsePlayerCard(text);
  });
}

/**
 * Tournament details + starting list. For tournaments that ended more than 5
 * days ago chess-results hides the details behind a "Show tournament details"
 * postback, which we replay.
 */
export function getTournamentInfo(tnr: string): Promise<CrTournamentInfo> {
  return cached(`cr:info:${tnr}`, async () => {
    const url = `${CR_BASE}/tnr${tnr}.aspx?lan=1&art=0&turdet=YES`;
    const first = await fetchText(url);
    let html = first.text;
    if (html.includes('name="cb_alleDetails"')) {
      const $ = cheerio.load(html);
      const form = formFields($);
      form.cb_alleDetails = "Show tournament details";
      html = (await fetchText(url, { form, cookie: cookieHeader(first.cookies) })).text;
    }
    return parseTournamentInfo(html, tnr);
  });
}

export const tournamentUrl = (tnr: string, snr?: string) =>
  `${CR_BASE}/tnr${tnr}.aspx?lan=1${snr ? `&art=9&snr=${snr}` : ""}`;
