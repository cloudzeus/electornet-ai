import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { LineChart, RankBars, StatTile } from "@/components/admin/charts/Charts";

export const metadata = { title: "Αναφορές προσφορών" };
export const dynamic = "force-dynamic";

const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const n = (v: number) => v.toLocaleString("el-GR");
const since = (days: number) => new Date(Date.now() - days * 86400_000);

/**
 * Αναφορά ανά καμπάνια και ανά παραστατικό: ποια προσφορά, σε ποια παραγγελία, με ποιους όρους (έκδοση) και πόσο κόστισε.
 * Πηγή: PromotionUsage (γράφεται στη συναλλαγή της παραγγελίας) + γραμμές παραγγελίας.
 */
export default async function PromoReportsPage({ searchParams }: { searchParams: Promise<{ d?: string; promo?: string }> }) {
  await requirePermission("reports.read");
  const { d = "30", promo = "" } = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(d)) ? Number(d) : 30;
  const from = since(days);
  const where = { createdAt: { gte: from }, ...(promo ? { promotionId: promo } : {}) };
  const [usages, ordersAll, promoRow] = await Promise.all([
    db.promotionUsage.findMany({ where, select: { promotionId: true, version: true, orderId: true, orderLineId: true, amount: true, couponCode: true, createdAt: true, promotion: { select: { name: true, code: true, mechanism: true } } }, take: 20000 }),
    db.order.count({ where: { createdAt: { gte: from }, status: { notIn: ["cancelled"] } } }),
    promo ? db.promotion.findUnique({ where: { id: promo }, select: { id: true, name: true, code: true } }) : null,
  ]);
  const lineIds = [...new Set(usages.map((u) => u.orderLineId).filter((x): x is string => !!x))];
  const orderIds = [...new Set(usages.map((u) => u.orderId))];
  const [lines, orders] = await Promise.all([
    lineIds.length ? db.orderLine.findMany({ where: { id: { in: lineIds } }, select: { id: true, title: true, qty: true, lineTotal: true, listPrice: true, isGift: true } }) : [],
    orderIds.length ? db.order.findMany({ where: { id: { in: orderIds } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, total: true, discountTotal: true, couponCode: true, createdAt: true, status: true, erpSync: { select: { status: true } } } }) : [],
  ]);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const total = usages.reduce((a, u) => a + Number(u.amount), 0);

  // ανά καμπάνια
  const byPromo = new Map<string, { id: string; name: string; code: string; orders: Set<string>; amount: number; revenue: number; units: number }>();
  for (const u of usages) {
    const r = byPromo.get(u.promotionId) ?? { id: u.promotionId, name: u.promotion.name, code: u.promotion.code, orders: new Set<string>(), amount: 0, revenue: 0, units: 0 };
    r.orders.add(u.orderId); r.amount += Number(u.amount);
    const l = u.orderLineId ? lineById.get(u.orderLineId) : null;
    if (l && !l.isGift) { r.revenue += Number(l.lineTotal ?? 0); r.units += l.qty; }
    byPromo.set(u.promotionId, r);
  }
  const promos = [...byPromo.values()].sort((a, b) => b.amount - a.amount);

  // ημερήσια έκπτωση
  const labels: string[] = [], values: number[] = [];
  const step = days > 90 ? 7 : 1;
  for (let k = days - 1; k >= 0; k -= step) {
    const d0 = since(k + step), d1 = since(k);
    labels.push(d1.toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }));
    values.push(Math.round(usages.filter((u) => u.createdAt >= d0 && u.createdAt < d1).reduce((a, u) => a + Number(u.amount), 0)));
  }
  // κορυφαία προϊόντα
  const prod = new Map<string, number>();
  for (const u of usages) { const l = u.orderLineId ? lineById.get(u.orderLineId) : null; if (l) prod.set(l.title, (prod.get(l.title) ?? 0) + Number(u.amount)); }
  const top = [...prod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value: Math.round(value) }));
  const q = (x: Record<string, string>) => `?${new URLSearchParams({ d: String(days), ...(promo ? { promo } : {}), ...x })}`;

  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="report" active="report" title={promoRow ? `Αναφορά · ${promoRow.name}` : "Αναφορές προσφορών"} lead="Κάθε χρήση προσφοράς γράφεται με την παραγγελία, τη γραμμή, την έκδοση και τον κωδικό κουπονιού — όπως θα γραφτεί και στο παραστατικό SoftOne."
        actions={<div className="flex flex-wrap gap-1.5">{[7, 30, 90, 365].map((x) => <Link key={x} href={q({ d: String(x) })} aria-current={x === days ? "page" : undefined} className={`rounded-full px-4 min-h-11 inline-flex items-center font-bold text-[length:var(--fs-14)] border-2 ${x === days ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{x === 365 ? "1 έτος" : `${x} ημέρες`}</Link>)}{promo && <Link href={`?d=${days}`} className="rounded-full px-4 min-h-11 inline-flex items-center font-bold text-[length:var(--fs-14)] border-2 border-eu-line">Όλες οι καμπάνιες</Link>}</div>} />
      <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-3">
        <StatTile label="Έκπτωση που δόθηκε" value={eur(total)} accent />
        <StatTile label="Παραγγελίες με προσφορά" value={n(orderIds.length)} sub={ordersAll ? `${Math.round((orderIds.length / ordersAll) * 100)} % των παραγγελιών` : "καμία παραγγελία ακόμη"} />
        <StatTile label="Έσοδα γραμμών σε προσφορά" value={eur(promos.reduce((a, p) => a + p.revenue, 0))} />
        <StatTile label="Καμπάνιες με χρήσεις" value={n(promos.length)} />
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Έκπτωση ανά {step === 7 ? "εβδομάδα" : "ημέρα"}</h3>
        <LineChart labels={labels} series={[{ key: "disc", label: "Έκπτωση", values }]} unit=" €" />
      </section>
      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
        <section className="rounded-2xl bg-white border border-eu-line overflow-hidden">
          <table className="eu-rtable w-full text-[length:var(--fs-14)]">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Καμπάνια</th><th className="py-2 px-3 text-right">Παραγγελίες</th><th className="py-2 px-3 text-right">Τεμάχια</th><th className="py-2 px-3 text-right">Έσοδα</th><th className="py-2 px-3 text-right">Έκπτωση</th></tr></thead>
            <tbody>
              {promos.map((p) => <tr key={p.id} className="border-t border-eu-line"><td className="py-2 px-3"><Link href={q({ promo: p.id })} className="font-bold hover:text-eu-blue hover:underline">{p.name}</Link><div className="text-eu-muted font-mono text-[length:var(--fs-13)]">{p.code}</div></td><td data-label="Παραγγελίες" className="py-2 px-3 text-right tabular-nums">{n(p.orders.size)}</td><td data-label="Τεμάχια" className="py-2 px-3 text-right tabular-nums">{n(p.units)}</td><td data-label="Έσοδα" className="py-2 px-3 text-right tabular-nums">{eur(p.revenue)}</td><td data-label="Έκπτωση" className="py-2 px-3 text-right tabular-nums font-bold">{eur(p.amount)}</td></tr>)}
              {!promos.length && <tr><td colSpan={5} className="p-6 text-center text-eu-muted">Καμία χρήση προσφοράς σε αυτό το διάστημα.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Προϊόντα με τη μεγαλύτερη έκπτωση</h3>
          {top.length ? <RankBars rows={top} unit=" €" /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">—</p>}
        </section>
      </div>
      <section className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <h3 className="m-0 px-4 pt-4 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Παραστατικά (τελευταία 50)</h3>
        <table className="eu-rtable w-full text-[length:var(--fs-14)] mt-2">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Παραγγελία</th><th className="py-2 px-3">Ημερομηνία</th><th className="py-2 px-3">Κουπόνι</th><th className="py-2 px-3 text-right">Έκπτωση</th><th className="py-2 px-3 text-right">Σύνολο</th><th className="py-2 px-3">SoftOne</th></tr></thead>
          <tbody>
            {orders.map((o) => <tr key={o.id} className="border-t border-eu-line"><td className="py-2 px-3"><Link href={`/admin/prosfores/anafores/paraggelia/${o.id}`} className="font-bold text-eu-blue hover:underline">{o.number}</Link></td><td data-label="Ημερομηνία" className="py-2 px-3">{o.createdAt.toLocaleString("el-GR")}</td><td data-label="Κουπόνι" className="py-2 px-3 font-mono">{o.couponCode ?? "—"}</td><td data-label="Έκπτωση" className="py-2 px-3 text-right tabular-nums">{eur(Number(o.discountTotal))}</td><td data-label="Σύνολο" className="py-2 px-3 text-right tabular-nums">{eur(Number(o.total))}</td><td data-label="SoftOne" className="py-2 px-3">{o.erpSync?.status === "preview" ? "προεπισκόπηση" : o.erpSync?.status ?? "—"}</td></tr>)}
            {!orders.length && <tr><td colSpan={6} className="p-6 text-center text-eu-muted">Καμία παραγγελία με προσφορά.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
