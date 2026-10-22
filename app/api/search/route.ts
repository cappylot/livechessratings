import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/fide";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ players: [] });
  try {
    const players = await searchPlayers(q);
    return NextResponse.json({ players: players.slice(0, 50), total: players.length });
  } catch (e) {
    return NextResponse.json({ error: `FIDE search failed: ${(e as Error).message}` }, { status: 502 });
  }
}
