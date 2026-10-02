import { NextResponse } from "next/server";
import { tickPromos } from "@/lib/promo/offers";
import { refreshInfoTags } from "@/lib/promo/tags";

let lastTags = 0;

/**
 * Cron (Coolify / εξωτερικός scheduler, ανά λεπτό): `GET /api/cron/promos` με `Authorization: Bearer $CRON_SECRET`.
 * ?force=1 = πλήρης επαναϋπολογισμός. Οι αυτόματες ετικέτες (Best Seller, Top Rated…) ξαναϋπολογίζονται μία φορά την ώρα ή με ?tags=1.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const promos = await tickPromos({ force: u.searchParams.get("force") === "1" });
  let tags: Record<string, number> | null = null;
  if (u.searchParams.get("tags") === "1" || Date.now() - lastTags > 3600_000) { lastTags = Date.now(); tags = await refreshInfoTags().catch(() => null); }
  return NextResponse.json({ ...promos, tags });
}
