import { NextResponse } from "next/server";
import { searchByFideId } from "@/lib/chessResults";
import { getHistory, getProfile } from "@/lib/fide";
import type { Profile } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ fideId: string }> }) {
  const { fideId } = await params;
  if (!/^\d+$/.test(fideId)) return NextResponse.json({ error: "Invalid FIDE ID" }, { status: 400 });
  try {
    const [profile, history] = await Promise.all([getProfile(fideId), getHistory(fideId).catch(() => [])]);
    return NextResponse.json({ profile: { ...profile, source: "fide" }, history });
  } catch (fideError) {
    // ratings.fide.com blocks cloud IPs at times; build a minimal profile from chess-results.
    const rows = await searchByFideId(fideId).catch(() => []);
    const latest = rows[0];
    if (!latest) return NextResponse.json({ error: (fideError as Error).message }, { status: 502 });
    const profile: Profile = {
      fideId,
      name: latest.playerName,
      title: "",
      fed: latest.fed,
      federationName: latest.fed,
      standard: null,
      rapid: null,
      blitz: null,
      birthYear: null,
      sex: "",
      inactive: false,
      worldRank: null,
      source: "chess-results",
    };
    return NextResponse.json({ profile, history: [] });
  }
}
