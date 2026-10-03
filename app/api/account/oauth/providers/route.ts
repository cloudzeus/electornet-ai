import { NextResponse } from "next/server";
import { liveProviders } from "@/lib/account/oauth";

/** Οι πάροχοι που μπορεί να χρησιμοποιήσει ο πελάτης τώρα (ενεργοί και πλήρως ρυθμισμένοι). */
export async function GET() {
  return NextResponse.json({ providers: await liveProviders() }, { headers: { "cache-control": "no-store" } });
}
