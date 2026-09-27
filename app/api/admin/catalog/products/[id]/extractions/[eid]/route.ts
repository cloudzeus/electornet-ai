import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { saveDraft, unpublishExtraction } from "@/lib/catalog/banner-extract";
import type { StudioDoc } from "@/lib/catalog/banner-doc";

export const runtime = "nodejs";

async function guard(params: Promise<{ id: string; eid: string }>) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return { error: NextResponse.json({ error: "Δεν έχεις δικαίωμα επεξεργασίας προϊόντων." }, { status: 403 }) };
  const { id, eid } = await params;
  const row = await db.bannerExtraction.findFirst({ where: { id: eid, productId: id }, select: { id: true } });
  if (!row) return { error: NextResponse.json({ error: "Η απόδελτίωση δεν βρέθηκε." }, { status: 404 }) };
  return { userId: session.user.id, id, eid };
}

const validDoc = (d: unknown): d is StudioDoc => !!d && typeof d === "object" && Array.isArray((d as StudioDoc).sections) && typeof (d as StudioDoc).sourceUrl === "string";

/** PATCH { doc } — αυτόματη αποθήκευση πρόχειρου. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const g = await guard(params); if ("error" in g) return g.error;
  const b = (await req.json().catch(() => null)) as { doc?: unknown } | null;
  if (!validDoc(b?.doc)) return NextResponse.json({ error: "Μη έγκυρο έγγραφο." }, { status: 400 });
  await saveDraft(g.eid, b.doc);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

/** DELETE — απόρριψη πρόχειρου, ή (?unpublish=1) αναίρεση δημοσίευσης: σβήνει τις ενότητες και ξαναδείχνει το banner. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const g = await guard(params); if ("error" in g) return g.error;
  if (new URL(req.url).searchParams.get("unpublish")) {
    await unpublishExtraction(g.id, g.eid);
    await audit(g.userId, "catalog.banner.unpublish", "Product", g.id, null, { extractionId: g.eid });
    return NextResponse.json({ ok: true });
  }
  await db.bannerExtraction.update({ where: { id: g.eid }, data: { status: "discarded" } });
  return NextResponse.json({ ok: true });
}
