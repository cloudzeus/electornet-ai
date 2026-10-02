import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Κλικ σε διαφημιστική θέση: μέτρηση και ανακατεύθυνση στον σύνδεσμο που όρισε ο διαχειριστής. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await db.adPlacement.update({ where: { id }, data: { clicks: { increment: 1 } }, select: { href: true } }).catch(() => null);
  const href = ad?.href && (/^\/(?!\/)/.test(ad.href) || /^https:\/\//.test(ad.href)) ? ad.href : "/prosfores";
  return NextResponse.redirect(new URL(href, req.url), 302);
}
