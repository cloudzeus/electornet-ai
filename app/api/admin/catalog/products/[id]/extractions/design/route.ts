import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { designPage } from "@/lib/catalog/banner-design";
import type { StudioDoc } from "@/lib/catalog/banner-doc";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { docs } — ο σχεδιαστής AI στήνει τη σελίδα: διάταξη, σειρά, διπλές, νούμερα. Επιστρέφει τα έγγραφα με τις αποφάσεις του. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα επεξεργασίας προϊόντων." }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { docs?: StudioDoc[] } | null;
  const docs = (b?.docs ?? []).filter((d) => d && Array.isArray(d.sections));
  if (!docs.length) return NextResponse.json({ error: "Δεν υπάρχει περιεχόμενο για σχεδιασμό." }, { status: 400 });
  const p = await db.product.findUnique({ where: { id }, select: { title: true, brand: { select: { name: true } }, category: { select: { name: true } } } });
  if (!p) return NextResponse.json({ error: "Το προϊόν δεν βρέθηκε." }, { status: 404 });
  try {
    return NextResponse.json(await designPage(docs, { brand: p.brand.name, title: p.title, typeName: p.category.name }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ο σχεδιασμός απέτυχε." }, { status: 500 });
  }
}
