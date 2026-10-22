export type RatingType = "standard" | "rapid" | "blitz";
export const RATING_TYPES: RatingType[] = ["standard", "rapid", "blitz"];

export type PlayerSummary = {
  fideId: string;
  name: string;
  title: string;
  fed: string;
  standard: number | null;
  rapid: number | null;
  blitz: number | null;
  birthYear: number | null;
  /** End date of the latest tournament on chess-results (fallback search only) */
  lastPlayed?: string;
};

export type Profile = PlayerSummary & {
  federationName: string;
  sex: string;
  inactive: boolean;
  worldRank: number | null;
  /** "chess-results" when FIDE was unreachable and the profile is incomplete */
  source?: "fide" | "chess-results";
};

export type HistoryEntry = {
  /** "YYYY-MM" of the published list */
  period: string;
  /** Federation code at the time, e.g. "GER" */
  fed: string;
  standard: number | null;
  standardGames: number;
  rapid: number | null;
  rapidGames: number;
  blitz: number | null;
  blitzGames: number;
};

export type RatedEvent = { eventId: string; name: string; start: string; end: string };

export type LiveGame = {
  round: string;
  opponent: string;
  opponentFideId: string | null;
  /** FIDE rating of the opponent in this tournament's rating type */
  opponentRating: number | null;
  /** "fide" when looked up on ratings.fide.com, "chess-results" when taken from the tournament page */
  ratingSource: "fide" | "chess-results" | null;
  result: number | null;
  rawResult: string;
  /** Why the game does not count, if it does not */
  skip?: string;
};

export type TournamentStatus =
  | "pending" // counts towards the live rating
  | "rated" // already in an official FIDE list
  | "not-fide" // not FIDE-rated
  | "test"
  | "future"
  | "old"
  | "error";

export type LiveTournament = {
  tnr: string;
  snr: string;
  name: string;
  url: string;
  startDate: string | null;
  endDate: string;
  ongoing: boolean;
  type: RatingType | null;
  timeControl: string;
  fideEventId: string | null;
  status: TournamentStatus;
  reason?: string;
  /** The player's FIDE rating in this tournament, from their chess-results card */
  playerRating: number | null;
  /** Rating change reported by chess-results ("FIDE rtg +/-"), for cross-checking */
  chessResultsChange: number | null;
  games: LiveGame[];
};

export type KInfo = { base: number; reason: string };

export type LiveResponse = {
  fideId: string;
  lastList: string; // "YYYY-MM"
  official: Record<RatingType, number | null>;
  k: Record<RatingType, KInfo>;
  tournaments: LiveTournament[];
  warnings: string[];
  /** false when ratings.fide.com could not be reached and chess-results data was used */
  fideAvailable: boolean;
};
