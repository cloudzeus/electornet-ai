import { NextResponse } from "next/server";
import { syncAllLookups } from "@/lib/softone/lookups";

export const maxDuration = 300;

/** Nightly cron: `GET /api/cron/softone-lookups` with `Authorization: Bearer $CRON_SECRET`. Refreshes every reference table from SoftOne (read-only on the ERP side). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await syncAllLookups("cron");
  return NextResponse.json({ ok: r.every((x) => x.ok), results: r }, { status: r.every((x) => x.ok) ? 200 : 500 });
}
