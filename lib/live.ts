import {
  getPlayerCard,
  getTournamentInfo,
  searchByFideId,
  tournamentUrl,
  type CrGame,
  type CrSearchRow,
  type CrTournamentInfo,
} from "./chessResults";
import { kFactor } from "./elo";
import { getHistory, getProfile, getRatedEvents, getRatingsById } from "./fide";
import { classifyTimeControl } from "./timeControl";
import {
  RATING_TYPES,
  type HistoryEntry,
  type KInfo,
  type LiveGame,
  type LiveResponse,
  type LiveTournament,
  type RatedEvent,
  type RatingType,
} from "./types";

const MAX_TOURNAMENTS = 30;

const today = () => new Date().toISOString().slice(0, 10);

/** Tournaments ending this close to a list date are often only rated in the following list. */
const LATE_REPORT_DAYS = 5;

const shiftDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

function previousMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 1));
  const tb = new Set(normalize(b).split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.min(ta.size, tb.size);
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

function findRated(info: CrTournamentInfo, endDate: string, rated: RatedEvent[]): RatedEvent | undefined {
  if (info.fideEventId) {
    const exact = rated.find((r) => r.eventId === info.fideEventId);
    if (exact) return exact;
  }
  return rated.find((r) => r.end && dayDiff(r.end, endDate) <= 3 && similarity(r.name, info.name) >= 0.5);
}

/** Map a chess-results game row to the opponent's FIDE ID via the starting list. */
function opponentFideId(game: CrGame, info: CrTournamentInfo): string | null {
  const bySno = game.sno ? info.startList.find((p) => p.sno === game.sno) : undefined;
  if (bySno && similarity(bySno.name, game.name) >= 0.5) return bySno.fideId;
  const byName = info.startList.find((p) => normalize(p.name) === normalize(game.name));
  return byName?.fideId ?? null;
}

async function buildGames(
  games: CrGame[],
  info: CrTournamentInfo,
  type: RatingType,
  lookupRatings: boolean,
): Promise<LiveGame[]> {
  return Promise.all(
    games.map(async (g): Promise<LiveGame> => {
      const base: LiveGame = {
        round: g.round,
        opponent: g.name,
        opponentFideId: null,
        opponentRating: null,
        ratingSource: null,
        result: g.result,
        rawResult: g.rawResult,
        skip: g.skip,
      };
      if (g.skip) return base;
      const fid = opponentFideId(g, info);
      base.opponentFideId = fid;
      // A starting list with FIDE IDs means opponents without one are FIDE-unrated.
      if (!fid && info.startList.some((p) => p.fideId)) {
        base.skip = "opponent has no FIDE ID";
        return base;
      }
      if (fid && lookupRatings) {
        const row = await getRatingsById(fid).catch(() => null);
        if (row) {
          base.opponentRating = row[type];
          base.ratingSource = "fide";
          if (base.opponentRating === null) base.skip = `opponent has no FIDE ${type} rating`;
          return base;
        }
      }
      if (g.rating) {
        base.opponentRating = g.rating;
        base.ratingSource = "chess-results";
      } else {
        base.skip = "opponent unrated";
      }
      return base;
    }),
  );
}

async function buildTournament(
  row: CrSearchRow,
  lastList: string,
  rated: Record<RatingType, RatedEvent[]>,
): Promise<LiveTournament> {
  const base: LiveTournament = {
    tnr: row.tnr,
    snr: row.snr,
    name: row.tournament,
    url: tournamentUrl(row.tnr, row.snr),
    startDate: null,
    endDate: row.endDate,
    ongoing: false,
    type: null,
    timeControl: "",
    fideEventId: null,
    status: "pending",
    chessResultsChange: null,
    games: [],
  };
  try {
    const [info, card] = await Promise.all([getTournamentInfo(row.tnr), getPlayerCard(row.tnr, row.snr)]);
    const now = today();
    base.name = info.name || row.tournament;
    base.startDate = info.startDate;
    base.endDate = info.endDate ?? row.endDate;
    base.ongoing = base.endDate > now;
    base.timeControl = info.timeControl;
    base.fideEventId = info.fideEventId;
    base.chessResultsChange = card.fideChange;
    base.type = classifyTimeControl(info.statedType, base.name, info.timeControl);

    if (info.isTest || /\btest\d*\b/i.test(base.name))
      return { ...base, status: "test", reason: "Marked as a test tournament on chess-results" };
    if ((base.startDate ?? base.endDate) > now)
      return { ...base, status: "future", reason: "Hasn't started yet" };

    const type = base.type ?? "standard";
    if (!base.type) base.reason = "Time control unknown, assumed standard";

    const ratedMatch = findRated(info, base.endDate, rated[type]);
    // chess-results shows "FIDE rtg +/-" even for national events, so it is only a
    // hint for recent tournaments that FIDE hasn't registered yet.
    const recent = base.endDate >= `${lastList}-01`;
    const fideRated =
      !!info.fideEventId ||
      /international|fide/i.test(info.ratingCalculation) ||
      (recent && !!card.fideChange) ||
      !!ratedMatch;

    let status: LiveTournament["status"] = "pending";
    let reason = base.reason;
    if (ratedMatch) {
      status = "rated";
      reason = `Already in the official FIDE list (${ratedMatch.name})`;
    } else if (!fideRated) {
      status = "not-fide";
      reason = "Not marked as FIDE-rated on chess-results";
    } else if (base.endDate < `${previousMonth(lastList)}-01`) {
      status = "old";
      reason = "Ended before the previous rating list";
    } else if (base.endDate < shiftDays(`${lastList}-01`, -LATE_REPORT_DAYS)) {
      status = "not-fide";
      reason = "Not in the latest FIDE list although it ended before it — probably not FIDE-rated";
    } else if (!recent) {
      reason = "Ended just before the latest list but isn't in it — probably goes into the next one";
    }

    const games = await buildGames(card.games, info, type, status === "pending" || status === "not-fide");
    return { ...base, type: base.type ?? "standard", status, reason, games };
  } catch (e) {
    return { ...base, status: "error", reason: `Could not load tournament: ${(e as Error).message}` };
  }
}

export async function buildLive(fideId: string): Promise<LiveResponse> {
  const warnings: string[] = [];
  const [profile, history] = await Promise.all([getProfile(fideId), getHistory(fideId).catch(() => [] as HistoryEntry[])]);

  const lastList = history.at(-1)?.period ?? today().slice(0, 7);
  const windowStart = `${previousMonth(lastList)}-01`;

  const official: Record<RatingType, number | null> = {
    standard: profile.standard,
    rapid: profile.rapid,
    blitz: profile.blitz,
  };
  const year = new Date().getFullYear();
  const k = Object.fromEntries(
    RATING_TYPES.map((t) => [t, kFactor(t, official[t], history, profile.birthYear, year)]),
  ) as Record<RatingType, KInfo>;

  // Tournaments FIDE has already rated in the last two lists.
  const rated = Object.fromEntries(
    await Promise.all(
      RATING_TYPES.map(async (t) => {
        const lists = await Promise.all(
          [lastList, previousMonth(lastList)].map((p) => getRatedEvents(fideId, p, t).catch(() => [])),
        );
        return [t, lists.flat()];
      }),
    ),
  ) as Record<RatingType, RatedEvent[]>;

  let rows: CrSearchRow[] = [];
  try {
    rows = await searchByFideId(fideId);
  } catch (e) {
    warnings.push(`chess-results search failed: ${(e as Error).message}`);
  }
  const seen = new Set<string>();
  const candidates = rows.filter((r) => {
    const id = `${r.tnr}:${r.snr}`;
    if (seen.has(id) || r.endDate < windowStart) return false;
    seen.add(id);
    return true;
  });
  if (candidates.length > MAX_TOURNAMENTS) {
    warnings.push(`Only the ${MAX_TOURNAMENTS} most recent tournaments were checked.`);
    candidates.length = MAX_TOURNAMENTS;
  }

  const tournaments = await Promise.all(candidates.map((r) => buildTournament(r, lastList, rated)));
  tournaments.sort((a, b) => b.endDate.localeCompare(a.endDate));

  return { fideId, lastList, official, k, tournaments, warnings };
}
