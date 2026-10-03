import { NextResponse } from "next/server";
import { tickPromos } from "@/lib/promo/offers";
import { refreshInfoTags } from "@/lib/promo/tags";
import { runBirthdays, runCartReminders } from "@/lib/promo/jobs";

let lastTags = 0;

/**
 * Cron (Coolify / εξωτερικός scheduler, ανά λεπτό): `GET /api/cron/promos` με `Authorization: Bearer $CRON_SECRET`.
 * ?force=1 = πλήρης επαναϋπολογισμός. Οι αυτόματες ετικέτες (Best Seller, Top Rated…) ξαναϋπολογίζονται μία φορά την ώρα ή με ?tags=1.
 * Κουπόνια γενεθλίων: μία φορά την ημέρα. Υπενθυμίσεις καλαθιού: ανά 15 λεπτά. Και τα δύο μόνο αν είναι ενεργά στους κανόνες.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const promos = await tickPromos({ force: u.searchParams.get("force") === "1" });
  let tags: Record<string, number> | null = null;
  if (u.searchParams.get("tags") === "1" || Date.now() - lastTags > 3600_000) { lastTags = Date.now(); tags = await refreshInfoTags().catch(() => null); }
  const [birthdays, carts] = await Promise.all([runBirthdays().catch((e) => ({ error: String(e) })), runCartReminders().catch((e) => ({ error: String(e) }))]);
  return NextResponse.json({ ...promos, tags, birthdays, carts });
}
