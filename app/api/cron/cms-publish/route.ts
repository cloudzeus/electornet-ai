import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runDueScenarios } from "@/lib/cms/doc-plans";
import { HOME_TARGET } from "@/lib/cms/home-plans";
import { brandTarget } from "@/lib/cms/brand-plans";

/**
 * Cron (Coolify, π.χ. κάθε 5′): `GET /api/cron/cms-publish` με `Authorization: Bearer $CRON_SECRET` —
 * δημοσιεύει τα προγραμματισμένα σενάρια της αρχικής και των σελίδων μαρκών.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const published: string[] = [];
  if (await runDueScenarios(HOME_TARGET, { force: true })) { published.push("home"); revalidatePath("/"); }
  const brands = await db.cmsDocument.findMany({ where: { collection: "brand.stores.plans", locale: "el" }, select: { key: true } });
  for (const { key } of brands) {
    if (await runDueScenarios(brandTarget(key), { force: true }).catch(() => false)) { published.push(`brand:${key}`); revalidatePath(`/brands/${key}`); revalidatePath("/brands"); }
  }
  return NextResponse.json({ published });
}
