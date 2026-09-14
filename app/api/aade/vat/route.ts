import { NextResponse } from "next/server";
import { lookupAfm, getAadeConfig, isValidAfm, cleanAfm } from "@/lib/aade/vat";
import { reconcile } from "@/lib/aade/map";
import { captureEvidence } from "@/lib/gdpr/evidence";

export const maxDuration = 30;

const bucket = new Map<string, { n: number; at: number }>();
function limited(ip: string, max = 30) {
  const now = Date.now(); const b = bucket.get(ip);
  if (!b || now - b.at > 3600000) { bucket.set(ip, { n: 1, at: now }); return false; }
  b.n++; return b.n > max;
}

/** GET ?afm=094019245 → στοιχεία μητρώου + αντιστοίχιση με τη δική μας ΔΟΥ. 30 κλήσεις/ώρα/IP. */
export async function GET(req: Request) {
  const afm = cleanAfm(new URL(req.url).searchParams.get("afm") ?? "");
  if (!isValidAfm(afm)) return NextResponse.json({ ok: false, code: "INVALID_AFM", message: "Μη έγκυρος ΑΦΜ." }, { status: 400 });
  const ev = await captureEvidence();
  if (limited(ev.ipHash ?? "anon")) return NextResponse.json({ ok: false, code: "RATE", message: "Πολλές αναζητήσεις. Δοκίμασε αργότερα." }, { status: 429 });
  const cfg = await getAadeConfig();
  if (!cfg.enabled) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED", message: "Η αναζήτηση ΑΦΜ δεν είναι ενεργή." }, { status: 503 });
  const r = await lookupAfm(afm);
  if (!r.ok) return NextResponse.json(r, { status: r.code === "NOT_FOUND" ? 404 : 502 });
  return NextResponse.json({ ok: true, ...(await reconcile(r.company)) }, { headers: { "cache-control": "private, max-age=300" } });
}
