import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { publishExtractions } from "@/lib/catalog/banner-extract";
import type { StudioDoc } from "@/lib/catalog/banner-doc";

export const runtime = "nodejs";
export const maxDuration = 180;

/** POST { items: [{ id, doc }], hideSources } — δημοσίευση στη σελίδα του προϊόντος, με τη σειρά των items. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα επεξεργασίας προϊόντων." }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { items?: { id?: string; doc?: StudioDoc }[]; hideSources?: boolean } | null;
  const items = (b?.items ?? []).filter((i): i is { id: string; doc: StudioDoc } => typeof i?.id === "string" && !!i.doc && Array.isArray(i.doc.sections));
  if (!items.length) return NextResponse.json({ error: "Δεν υπάρχει τίποτα για δημοσίευση." }, { status: 400 });
  try {
    const r = await publishExtractions(id, items, { hideSources: b?.hideSources !== false });
    await audit(session.user.id, "catalog.banner.publish", "Product", id, null, { extractions: items.map((i) => i.id), ...r });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η δημοσίευση απέτυχε." }, { status: 500 });
  }
}
