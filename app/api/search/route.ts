import { NextResponse } from "next/server";
import { groupPlayers, searchByFideId, searchByName } from "@/lib/chessResults";
import { searchPlayers } from "@/lib/fide";
import type { PlayerSummary } from "@/lib/types";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ players: [] });
  try {
    const players = await searchPlayers(q);
    return NextResponse.json({ players: players.slice(0, 50), total: players.length, source: "fide" });
  } catch (fideError) {
    // ratings.fide.com blocks cloud IPs at times; chess-results knows FIDE IDs too.
    try {
      const found = /^\d+$/.test(q) ? groupPlayers(await searchByFideId(q)) : await searchByName(q);
      const players: PlayerSummary[] = found.map((p) => ({
        fideId: p.fideId,
        name: p.name,
        title: "",
        fed: p.fed,
        standard: null,
        rapid: null,
        blitz: null,
        birthYear: null,
        lastPlayed: p.lastPlayed,
      }));
      return NextResponse.json({ players: players.slice(0, 50), total: players.length, source: "chess-results" });
    } catch (e) {
      return NextResponse.json(
        { error: `Search failed: ${(fideError as Error).message}; chess-results: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }
}
