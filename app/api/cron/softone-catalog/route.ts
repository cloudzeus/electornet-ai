import { NextResponse } from "next/server";
import { syncCatalog } from "@/lib/softone/catalog";
import { refreshProductDocs, embedStale } from "@/lib/vector/index";

export const maxDuration = 300;

/**
 * Cron: `GET /api/cron/softone-catalog` με `Authorization: Bearer $CRON_SECRET`.
 * Φέρνει τις αλλαγές του καταλόγου από το SoftOne (μόνο ανάγνωση) και ενημερώνει
 * το ευρετήριο του Ερμή για ό,τι άλλαξε. `?mode=full` για πλήρη ανάγνωση ειδών
 * (π.χ. μία φορά την εβδομάδα, ώστε να εντοπίζονται όσα αφαιρέθηκαν από το site).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const mode = new URL(req.url).searchParams.get("mode") === "full" ? "full" : "delta";
  const sync = await syncCatalog(mode, "cron");
  const ok = sync.every((x) => x.ok);
  // Χωρίς επιτυχή συγχρονισμό δεν αγγίζουμε το ευρετήριο
  const index = ok ? { docs: await refreshProductDocs(), emb: await embedStale(3000) } : null;
  return NextResponse.json({ ok: ok && !index?.emb.error, mode, sync, index }, { status: ok ? 200 : 500 });
}
