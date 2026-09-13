import { NextResponse } from "next/server";
import { runWishlistAlerts } from "@/lib/wishlist/notify";

/** Cron (Coolify / external scheduler): `GET /api/cron/wishlist-alerts` with `Authorization: Bearer $CRON_SECRET`. Also called after every price sync. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runWishlistAlerts());
}
