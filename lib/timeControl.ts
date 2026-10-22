import type { RatingType } from "./types";

/**
 * Classify a tournament as standard / rapid / blitz. Prefers what chess-results
 * states ("Time control (Rapid)"), then name keywords, then the time-control text:
 * FIDE counts the playing time for 60 moves (base + 60 x increment).
 */
export function classifyTimeControl(
  stated: RatingType | null,
  tournamentName: string,
  timeControl: string,
): RatingType | null {
  if (stated) return stated;

  const name = tournamentName.toLowerCase();
  if (/blitz|bullet/.test(name)) return "blitz";
  if (/rapid|schnellschach|rápid|rapide|rapido|snelschaak|szybk/.test(name)) return "rapid";

  const tc = timeControl.toLowerCase();
  if (!tc) return null;

  // Base time: the largest minute value mentioned in the first time segment.
  const firstSegment = tc.split(/\+|,|;|\bplus\b|\band\b/)[0];
  const minuteValues = [
    ...firstSegment.matchAll(/(\d+)\s*(?:min|minutes|m\b|'(?!')|’)/g),
    ...firstSegment.matchAll(/\/\s*(\d+)/g), // "40/90"
    ...firstSegment.matchAll(/^\s*(\d+)\s*$/g), // bare "90"
  ].map((m) => parseInt(m[1], 10));
  const leading = firstSegment.match(/^\s*(?:game\s*\/\s*)?(\d+)/);
  if (!minuteValues.length && leading) minuteValues.push(parseInt(leading[1], 10));
  const base = minuteValues.length ? Math.max(...minuteValues) : null;

  const incMatch = tc.match(/(\d+)\s*(?:sec|seconds|s\b|''|"|”|sek)/);
  const inc = incMatch ? parseInt(incMatch[1], 10) : 0;

  if (base === null) return null;
  const total = base + inc; // minutes for 60 moves
  if (total >= 60) return "standard";
  if (total > 10) return "rapid";
  return "blitz";
}
