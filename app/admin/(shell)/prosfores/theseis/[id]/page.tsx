import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { DEFAULT_BANNER_DESIGN, normalizeBannerDesign } from "@/lib/promo/banner-design";
import { BannerEditor } from "@/components/admin/promos/BannerEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banner" };

/** Editor ενός banner: /theseis/new?slot=home-strip για νέο, /theseis/<id> για υπάρχον. */
export default async function BannerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ slot?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { id } = await params;
  const row = id === "new" ? null : await db.adPlacement.findUnique({ where: { id } });
  if (id !== "new" && !row) notFound();
  const slot = (await searchParams).slot;
  const [promos, landings, cats] = await Promise.all([
    db.promotion.findMany({ where: { status: { not: "archived" } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, code: true } }),
    db.landingPage.findMany({ where: { status: { not: "archived" } }, select: { id: true, title: true, slug: true } }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { slug: true, name: true } }),
  ]);
  return (
    <BannerEditor
      initial={row
        ? { id: row.id, slot: row.slot, title: row.title, image: row.image, imageMobile: row.imageMobile, alt: row.alt, href: row.href, promotionId: row.promotionId, landingId: row.landingId, status: row.status as "draft", startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null, priority: row.priority, categories: ((row.audience as { categories?: string[] } | null)?.categories) ?? [], design: normalizeBannerDesign(row.design) }
        : { id: null, slot: SLOTS.some((s) => s.key === slot) ? slot! : SLOTS[0].key, title: "", image: null, imageMobile: null, alt: null, href: null, promotionId: null, landingId: null, status: "draft", startsAt: null, endsAt: null, priority: 100, categories: [], design: DEFAULT_BANNER_DESIGN }}
      stats={row ? { impressions: row.impressions, clicks: row.clicks } : null}
      promos={promos.map((p) => ({ id: p.id, label: `${p.name} · ${p.code}` }))}
      landings={landings.map((l) => ({ id: l.id, label: `${l.title} · /prosfores/${l.slug}` }))}
      categories={cats.map((c) => ({ id: c.slug, label: c.name }))}
    />
  );
}
