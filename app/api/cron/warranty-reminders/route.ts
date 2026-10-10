import { NextResponse } from "next/server";
import { runWarrantyReminders } from "@/lib/warranty/remind";

/** Cron (Coolify / εξωτερικός scheduler, μία φορά τη μέρα): `GET /api/cron/warranty-reminders` με `Authorization: Bearer $CRON_SECRET`. `?dry=1` μόνο μετρά. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  return NextResponse.json(await runWarrantyReminders({ dryRun: dry }));
}
