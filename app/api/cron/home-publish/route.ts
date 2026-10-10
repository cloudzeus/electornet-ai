import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runDueScenarios } from "@/lib/cms/home-plans";

/** Cron (Coolify, π.χ. κάθε 5′): `GET /api/cron/home-publish` με `Authorization: Bearer $CRON_SECRET` — δημοσιεύει τα προγραμματισμένα σενάρια της αρχικής. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const published = await runDueScenarios({ force: true });
  if (published) revalidatePath("/");
  return NextResponse.json({ published });
}
