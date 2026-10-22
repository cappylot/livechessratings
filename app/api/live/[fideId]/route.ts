import { NextResponse } from "next/server";
import { buildLive } from "@/lib/live";

export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ fideId: string }> }) {
  const { fideId } = await params;
  if (!/^\d+$/.test(fideId)) return NextResponse.json({ error: "Invalid FIDE ID" }, { status: 400 });
  try {
    return NextResponse.json(await buildLive(fideId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
