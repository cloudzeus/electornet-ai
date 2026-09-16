import { NextResponse } from "next/server";
import { suggestAddresses } from "@/lib/geo/suggest";

/** @dynamic Προτάσεις διεύθυνσης για autocomplete (Ελλάδα). Ελάχιστο 3 χαρακτήρες. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ items: [] });
  const items = await suggestAddresses(q);
  return NextResponse.json({ items }, { headers: { "cache-control": "public, max-age=600" } });
}
