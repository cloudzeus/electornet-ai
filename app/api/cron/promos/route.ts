import { NextResponse } from "next/server";
import { tickPromos } from "@/lib/promo/offers";

/** Cron (Coolify / εξωτερικός scheduler, ανά λεπτό): `GET /api/cron/promos` με `Authorization: Bearer $CRON_SECRET`. ?force=1 = πλήρης επαναϋπολογισμός. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await tickPromos({ force: new URL(req.url).searchParams.get("force") === "1" }));
}
