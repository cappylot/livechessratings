import { NextResponse } from "next/server";
import { getHistory, getProfile } from "@/lib/fide";

export async function GET(_req: Request, { params }: { params: Promise<{ fideId: string }> }) {
  const { fideId } = await params;
  if (!/^\d+$/.test(fideId)) return NextResponse.json({ error: "Invalid FIDE ID" }, { status: 400 });
  try {
    const [profile, history] = await Promise.all([getProfile(fideId), getHistory(fideId).catch(() => [])]);
    return NextResponse.json({ profile, history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
