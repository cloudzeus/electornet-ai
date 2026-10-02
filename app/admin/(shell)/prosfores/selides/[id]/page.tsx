import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { LandingEditor } from "@/components/admin/promos/LandingEditor";
import type { Block } from "@/lib/promo/landing-blocks";

export const metadata = { title: "Landing page" };
export const dynamic = "force-dynamic";

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog.promos.write");
  const { id } = await params;
  const [page, promos, cats] = await Promise.all([
    db.landingPage.findUnique({ where: { id } }),
    db.promotion.findMany({ where: { status: { not: "archived" } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, code: true } }),
    db.category.findMany({ where: { active: true, depth: { lte: 1 } }, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true } }),
  ]);
  if (!page) notFound();
  return (
    <LandingEditor
      initial={{ id: page.id, slug: page.slug, title: page.title, promotionId: page.promotionId, status: page.status as "draft", startsAt: page.startsAt?.toISOString() ?? null, endsAt: page.endsAt?.toISOString() ?? null, seoTitle: page.seoTitle, seoDesc: page.seoDesc, blocks: page.blocks as unknown as Block[] }}
      promos={promos.map((p) => ({ id: p.id, label: `${p.name} · ${p.code}` }))}
      categories={cats.map((c) => ({ id: c.id, label: c.depth ? `— ${c.name}` : c.name }))}
    />
  );
}
