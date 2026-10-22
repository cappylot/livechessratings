import { notFound } from "next/navigation";
import { PlayerView } from "@/components/PlayerView";

export default async function PlayerPage({ params }: { params: Promise<{ fideId: string }> }) {
  const { fideId } = await params;
  if (!/^\d+$/.test(fideId)) notFound();
  return <PlayerView fideId={fideId} />;
}
