import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { SegmentsEditor } from "@/components/admin/promos/SegmentsEditor";
import { describeSegment, type SegmentRules } from "@/lib/promo/segments";

export const metadata = { title: "Κοινά πελατών" };
export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  await requirePermission("catalog.promos.write");
  const [segs, cats, coupons, customers, promoRules] = await Promise.all([
    db.segment.findMany({ where: { archived: false }, orderBy: { createdAt: "desc" } }),
    db.category.findMany({ where: { active: true, depth: { lte: 1 } }, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true } }),
    db.promotion.findMany({ where: { mechanism: { startsWith: "coupon" }, status: { in: ["active", "scheduled"] }, held: false }, select: { code: true, name: true } }),
    db.customer.count({ where: { status: "active" } }),
    db.promotion.findMany({ where: { status: { notIn: ["archived", "ended"] } }, select: { rules: true } }),
  ]);
  // σε πόσες προσφορές χρησιμοποιείται κάθε κοινό (στόχευση ή early access)
  const usedIn = new Map<string, number>();
  for (const p of promoRules) { const r = (p.rules ?? {}) as { segments?: string[]; earlyAccess?: { segments?: string[] } }; for (const id of new Set([...(r.segments ?? []), ...(r.earlyAccess?.segments ?? [])])) usedIn.set(id, (usedIn.get(id) ?? 0) + 1); }
  const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs active="segments" title="Κοινά πελατών" lead={`Ομάδες πελατών με κοινά χαρακτηριστικά, για στοχευμένες προσφορές, early access και προσωπικά κουπόνια · ${customers.toLocaleString("el-GR")} ενεργοί λογαριασμοί.`} />
      <SegmentsEditor
        segments={segs.map((s) => ({ id: s.id, name: s.name, description: s.description, rules: s.rules as SegmentRules, members: s.members, computedAt: s.computedAt?.toISOString() ?? null, summary: describeSegment(s.rules as SegmentRules, names), usedIn: usedIn.get(s.id) ?? 0 }))}
        customers={customers}
        categories={cats.map((c) => ({ id: c.id, label: c.depth ? `— ${c.name}` : c.name }))}
        coupons={coupons.map((c) => ({ id: c.code, label: `${c.name} · ${c.code}` }))}
      />
    </div>
  );
}
