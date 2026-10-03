import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { SegmentsEditor } from "@/components/admin/promos/SegmentsEditor";
import { describeSegment, type SegmentRules } from "@/lib/promo/segments";

export const metadata = { title: "Κοινά πελατών" };
export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  await requirePermission("catalog.promos.write");
  const [segs, cats, coupons, customers] = await Promise.all([
    db.segment.findMany({ where: { archived: false }, orderBy: { createdAt: "desc" } }),
    db.category.findMany({ where: { active: true, depth: { lte: 1 } }, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true } }),
    db.promotion.findMany({ where: { mechanism: { startsWith: "coupon" }, status: { in: ["active", "scheduled"] }, held: false }, select: { code: true, name: true } }),
    db.customer.count({ where: { status: "active" } }),
  ]);
  const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="segments" active="segments" title="Κοινά πελατών" lead={`Ομάδες πελατών με κοινά χαρακτηριστικά, για στοχευμένες προσφορές, early access και προσωπικά κουπόνια. Σήμερα υπάρχουν ${customers.toLocaleString("el-GR")} ενεργοί λογαριασμοί.`} />
      <SegmentsEditor
        segments={segs.map((s) => ({ id: s.id, name: s.name, description: s.description, rules: s.rules as SegmentRules, members: s.members, computedAt: s.computedAt?.toISOString() ?? null, summary: describeSegment(s.rules as SegmentRules, names) }))}
        categories={cats.map((c) => ({ id: c.id, label: c.depth ? `— ${c.name}` : c.name }))}
        coupons={coupons.map((c) => ({ id: c.code, label: `${c.name} · ${c.code}` }))}
      />
    </div>
  );
}
