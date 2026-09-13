import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/stores/geocode";

/** @dynamic Place → point for «Κοντά σε: πόλη / Τ.Κ. / διεύθυνση» (Nominatim, Greece only). Short label for the UI. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ error: "Γράψε πόλη, Τ.Κ. ή διεύθυνση." }, { status: 400 });
  const r = await geocodeAddress(/ελλάδα|greece/i.test(q) ? q : `${q}, Ελλάδα`).catch(() => null);
  if (!r) return NextResponse.json({ error: "Δεν βρέθηκε αυτή η περιοχή." }, { status: 404 });
  const parts = r.label.split(",").map((s) => s.trim()).filter((s) => s && !/^\d{3}\s?\d{2}$/.test(s) && !/^(Δημοτική|Δήμος|Περιφερειακή|Περιφέρεια|Αποκεντρωμένη|Ελλάδα|Greece)/i.test(s));
  // first meaningful part (city / village / street); a second part only when the first looks like a street number address
  const label = /\d/.test(parts[0] ?? "") ? parts.slice(0, 2).join(", ") : parts[0] ?? r.label;
  return NextResponse.json({ lat: r.lat, lng: r.lng, label }, { headers: { "cache-control": "public, max-age=86400" } });
}
