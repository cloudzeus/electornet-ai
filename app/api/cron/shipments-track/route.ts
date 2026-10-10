import { NextResponse } from "next/server";
import { trackShipments } from "@/lib/couriers/shipments";

/** Cron (Coolify, π.χ. κάθε 2 ώρες): `GET /api/cron/shipments-track` με `Authorization: Bearer $CRON_SECRET` — κατάσταση αποστολών Γενικής. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await trackShipments());
}
