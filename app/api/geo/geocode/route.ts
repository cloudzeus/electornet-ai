import { NextResponse } from "next/server";
import { geocodePlace } from "@/lib/stores/geocode";

/** @dynamic Place → point for «Κοντά σε: πόλη / Τ.Κ. / διεύθυνση» (Nominatim, Greece only). Short label for the UI. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ error: "Γράψε πόλη, Τ.Κ. ή διεύθυνση." }, { status: 400 });
  const r = await geocodePlace(q);
  if (!r) return NextResponse.json({ error: "Δεν βρέθηκε αυτή η περιοχή. Δοκίμασε τον Τ.Κ. ή το όνομα της πόλης." }, { status: 404 });
  return NextResponse.json(r, { headers: { "cache-control": "public, max-age=86400" } });
}
