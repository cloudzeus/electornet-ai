import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup/run";

export const maxDuration = 300;

/** Daily cron: `GET /api/cron/backup` with `Authorization: Bearer $CRON_SECRET` (Coolify scheduled task / crontab / external scheduler). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runBackup("cron");
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
