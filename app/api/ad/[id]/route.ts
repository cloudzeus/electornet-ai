import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeAdHref } from "@/lib/security/url-allow";

/** Κλικ σε διαφημιστική θέση: μέτρηση και ανακατεύθυνση στον σύνδεσμο που όρισε ο διαχειριστής. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await db.adPlacement.update({ where: { id }, data: { clicks: { increment: 1 } }, select: { href: true } }).catch(() => null);
  // έλεγχος τη στιγμή της ανακατεύθυνσης: μόνο εσωτερική διαδρομή ή http(s) — ποτέ javascript:/data:/«//άλλο-site»
  const href = safeAdHref(ad?.href) ?? "/prosfores";
  return NextResponse.redirect(new URL(href, req.url), 302);
}
