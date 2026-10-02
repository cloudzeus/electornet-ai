import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PlacementsEditor } from "@/components/admin/promos/PlacementsEditor";

export const metadata = { title: "Διαφημιστικές θέσεις" };
export const dynamic = "force-dynamic";

export default async function PlacementsPage() {
  await requirePermission("catalog.promos.write");
  const [rows, promos, landings, cats] = await Promise.all([
    db.adPlacement.findMany({ where: { status: { not: "archived" } }, orderBy: [{ slot: "asc" }, { priority: "asc" }] }),
    db.promotion.findMany({ where: { status: { not: "archived" } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, code: true, status: true } }),
    db.landingPage.findMany({ where: { status: { not: "archived" } }, select: { id: true, title: true, slug: true } }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { slug: true, name: true } }),
  ]);
  const promoStatus = Object.fromEntries(promos.map((p) => [p.id, p.status]));
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs active="ads" title="Διαφημιστικές θέσεις" lead="Banners σε σταθερά σημεία της βιτρίνας. Δεμένα με προσφορά, εμφανίζονται μόνο όσο εκείνη είναι ενεργή· με ίδια θέση, κερδίζει η μικρότερη προτεραιότητα. Μετρούνται προβολές και κλικ." />
      <PlacementsEditor
        rows={rows.map((r) => ({ id: r.id, slot: r.slot, title: r.title, image: r.image, imageMobile: r.imageMobile, alt: r.alt, href: r.href, promotionId: r.promotionId, landingId: r.landingId, status: r.status as "draft", startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null, priority: r.priority, categories: ((r.audience as { categories?: string[] } | null)?.categories) ?? [], impressions: r.impressions, clicks: r.clicks, promoLive: r.promotionId ? ["active", "scheduled"].includes(promoStatus[r.promotionId] ?? "") : null }))}
        promos={promos.map((p) => ({ id: p.id, label: `${p.name} · ${p.code}` }))}
        landings={landings.map((l) => ({ id: l.id, label: `${l.title} · /prosfores/${l.slug}` }))}
        categories={cats.map((c) => ({ id: c.slug, label: c.name }))}
      />
    </div>
  );
}
