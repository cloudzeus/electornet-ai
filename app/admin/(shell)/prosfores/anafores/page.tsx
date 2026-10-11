import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { BarChart, KpiTile, LineChart, RankBars } from "@/components/admin/charts/Charts";
import { MECHANISM_LABEL } from "@/lib/promo/catalog";
import { promoStats, delta } from "@/lib/promo/stats";
import { SLOTS } from "@/lib/promo/landing-blocks";

export const metadata = { title: "Αναφορές προσφορών" };
export const dynamic = "force-dynamic";

const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const eur0 = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const n = (v: number) => v.toLocaleString("el-GR");
/** χρονική αφετηρία του αιτήματος (εκτός render, για τον κανόνα καθαρότητας) */
const requestTime = () => Date.now();
const card = "rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3 content-start min-w-0";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]";
const Empty = () => <p className="m-0 grid place-items-center min-h-32 rounded-xl bg-eu-surface/60 text-eu-muted text-[length:var(--fs-14)] text-center px-4">Καμία παραγγελία με προσφορά σε αυτή την περίοδο — το γράφημα γεμίζει με την πρώτη.</p>;

/**
 * Αναφορές προσφορών: KPIs με σύγκριση με την προηγούμενη περίοδο, παραγγελίες και έκπτωση ανά ημέρα, απόδοση ανά
 * καμπάνια (έσοδα ανά 1 € έκπτωσης), ανά μηχανισμό, κουπόνια, διαφημιστικές θέσεις, προϊόντα και παραστατικά.
 * Πηγή: PromotionUsage (γράφεται στη συναλλαγή της παραγγελίας) + γραμμές παραγγελίας + μετρητές banners.
 */
export default async function PromoReportsPage({ searchParams }: { searchParams: Promise<{ d?: string; promo?: string }> }) {
  await requirePermission("reports.read");
  const { d = "30", promo = "" } = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(d)) ? Number(d) : 30;
  const now = requestTime();
  const from = new Date(now - days * 86400_000), prevFrom = new Date(now - 2 * days * 86400_000);
  const where = { createdAt: { gte: from }, ...(promo ? { promotionId: promo } : {}) };
  const [stats, usages, ordersAll, ordersPrev, promoRow, campaigns, ads] = await Promise.all([
    promoStats(days, promo || undefined, now),
    db.promotionUsage.findMany({ where, select: { promotionId: true, orderId: true, orderLineId: true, amount: true, couponCode: true, promotion: { select: { name: true, code: true, mechanism: true, status: true } } }, take: 20000 }),
    db.order.count({ where: { createdAt: { gte: from }, status: { notIn: ["cancelled"] } } }),
    db.order.count({ where: { createdAt: { gte: prevFrom, lt: from }, status: { notIn: ["cancelled"] } } }),
    promo ? db.promotion.findUnique({ where: { id: promo }, select: { id: true, name: true, code: true } }) : null,
    db.promotion.findMany({ where: { usedCount: { gt: 0 } }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true } }),
    promo ? db.adPlacement.findMany({ where: { promotionId: promo }, select: { id: true, title: true, slot: true, status: true, impressions: true, clicks: true } }) : db.adPlacement.findMany({ where: { status: { not: "archived" }, impressions: { gt: 0 } }, orderBy: { impressions: "desc" }, take: 12, select: { id: true, title: true, slot: true, status: true, impressions: true, clicks: true } }),
  ]);
  const lineIds = [...new Set(usages.map((u) => u.orderLineId).filter((x): x is string => !!x))];
  const orderIds = [...new Set(usages.map((u) => u.orderId))];
  const [lines, orders] = await Promise.all([
    lineIds.length ? db.orderLine.findMany({ where: { id: { in: lineIds } }, select: { id: true, title: true, qty: true, lineTotal: true, isGift: true } }) : [],
    orderIds.length ? db.order.findMany({ where: { id: { in: orderIds } }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, number: true, total: true, discountTotal: true, couponCode: true, createdAt: true, erpSync: { select: { status: true } } } }) : [],
  ]);
  const lineById = new Map(lines.map((l) => [l.id, l]));

  // ανά καμπάνια, ανά μηχανισμό, ανά κουπόνι, ανά προϊόν
  type Row = { id: string; name: string; code: string; mechanism: string; orders: Set<string>; amount: number; revenue: number; units: number };
  const byPromo = new Map<string, Row>(), byMech = new Map<string, number>(), byCoupon = new Map<string, { uses: number; amount: number }>(), byProduct = new Map<string, number>();
  for (const u of usages) {
    const r = byPromo.get(u.promotionId) ?? { id: u.promotionId, name: u.promotion.name, code: u.promotion.code, mechanism: u.promotion.mechanism, orders: new Set<string>(), amount: 0, revenue: 0, units: 0 };
    const a = Number(u.amount);
    r.orders.add(u.orderId); r.amount += a;
    const l = u.orderLineId ? lineById.get(u.orderLineId) : null;
    if (l && !l.isGift) { r.revenue += Number(l.lineTotal ?? 0); r.units += l.qty; }
    if (l) byProduct.set(l.title, (byProduct.get(l.title) ?? 0) + a);
    byPromo.set(u.promotionId, r);
    byMech.set(u.promotion.mechanism, (byMech.get(u.promotion.mechanism) ?? 0) + a);
    if (u.couponCode) { const c = byCoupon.get(u.couponCode) ?? { uses: 0, amount: 0 }; c.uses++; c.amount += a; byCoupon.set(u.couponCode, c); }
  }
  const promos = [...byPromo.values()].sort((a, b) => b.amount - a.amount);
  const revenue = promos.reduce((a, p) => a + p.revenue, 0);
  const mech = [...byMech.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: MECHANISM_LABEL[k] ?? k, value: Math.round(v) }));
  const coupons = [...byCoupon.entries()].sort((a, b) => b[1].uses - a[1].uses).slice(0, 8).map(([label, c]) => ({ label, value: c.uses, sub: `−${eur0(c.amount)}` }));
  const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value: Math.round(value) }));
  const share = ordersAll ? Math.round((stats.total.orders / ordersAll) * 100) : 0;
  const prevShare = ordersPrev ? (stats.prev.orders / ordersPrev) * 100 : 0;
  const q = (x: Record<string, string>) => `?${new URLSearchParams({ d: String(days), ...(promo ? { promo } : {}), ...x })}`;
  const per = days > 90 ? "εβδομάδα" : "ημέρα";

  return (
    <div className="grid gap-4 min-w-0">
      <PromoTabs active="report" title={promoRow ? `Αναφορά · ${promoRow.name}` : "Αναφορές προσφορών"} lead="Τι κόστισε και τι απέδωσε κάθε προσφορά — με την παραγγελία, τη γραμμή και την έκδοση όπως γράφονται και στο παραστατικό SoftOne."
        actions={
          <form className="flex flex-wrap items-center gap-2" data-help="promo.report.filters">
            <input type="hidden" name="d" value={days} />
            <label className="sr-only" htmlFor="rp-promo">Καμπάνια</label>
            <select id="rp-promo" name="promo" defaultValue={promo} className="rounded-full border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] max-w-[16rem]">
              <option value="">Όλες οι καμπάνιες</option>
              {promoRow && !campaigns.some((c) => c.id === promoRow.id) && <option value={promoRow.id}>{promoRow.name}</option>}
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue">Εμφάνιση</button>
          </form>
        } />

      <nav aria-label="Περίοδος" className="flex flex-wrap items-center gap-1.5">
        {[7, 30, 90, 365].map((x) => <Link key={x} href={q({ d: String(x) })} aria-current={x === days ? "page" : undefined} className={`rounded-full px-3 min-h-10 inline-flex items-center font-bold text-[length:var(--fs-14)] border ${x === days ? "bg-eu-navy text-white border-eu-navy" : "bg-white border-eu-line hover:border-eu-blue"}`}>{x === 365 ? "1 έτος" : `${x} ημέρες`}</Link>)}
        <span className="text-eu-muted text-[length:var(--fs-13)] ml-1">σύγκριση με τις προηγούμενες {days === 365 ? "365" : days} ημέρες</span>
      </nav>

      <div data-help="promo.report.kpis" className="grid grid-cols-2 @4xl:grid-cols-4 gap-3">
        <KpiTile label="Έκπτωση που δόθηκε" value={eur0(stats.total.discount)} delta={delta(stats.total.discount, stats.prev.discount, "down")} trend={stats.discount} />
        <KpiTile label="Παραγγελίες με προσφορά" value={n(stats.total.orders)} sub={ordersAll ? `${share} % όλων (πριν ${Math.round(prevShare)} %)` : "καμία παραγγελία"} delta={delta(stats.total.orders, stats.prev.orders)} trend={stats.orders} />
        <KpiTile label="Έσοδα γραμμών σε προσφορά" value={eur0(revenue)} sub={stats.total.discount ? `${(revenue / stats.total.discount).toLocaleString("el-GR", { maximumFractionDigits: 1 })} € έσοδα ανά 1 € έκπτωσης` : undefined} />
        <KpiTile label="Μέση έκπτωση ανά παραγγελία" value={stats.total.orders ? eur(stats.total.discount / stats.total.orders) : "—"} sub={`${n(promos.length)} καμπάνιες με χρήσεις`} />
      </div>

      <div className="grid gap-3 @4xl:grid-cols-2">
        <section className={card} aria-labelledby="rp-o"><h3 id="rp-o" className={h3}>Παραγγελίες με προσφορά ανά {per}</h3>{stats.orders.some((v) => v > 0) ? <BarChart labels={stats.labels} series={[{ key: "o", label: "Παραγγελίες", values: stats.orders }]} height={190} /> : <Empty />}</section>
        <section className={card} aria-labelledby="rp-d"><h3 id="rp-d" className={h3}>Έκπτωση ανά {per}</h3>{stats.discount.some((v) => v > 0) ? <LineChart labels={stats.labels} series={[{ key: "d", label: "Έκπτωση", values: stats.discount }]} unit="€" height={190} /> : <Empty />}</section>
      </div>

      <section data-help="promo.report.campaigns" className="rounded-2xl bg-white border border-eu-line overflow-hidden" aria-labelledby="rp-c">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3"><h3 id="rp-c" className={h3}>Ανά καμπάνια</h3><span className="text-eu-muted text-[length:var(--fs-13)]">«Απόδοση» = έσοδα γραμμών ανά 1 € έκπτωσης</span></div>
        <table className="eu-rtable w-full text-[length:var(--fs-14)] mt-2">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Καμπάνια</th><th className="py-2 px-3 text-right">Παραγγελίες</th><th className="py-2 px-3 text-right">Τεμάχια</th><th className="py-2 px-3 text-right">Έσοδα</th><th className="py-2 px-3 text-right">Έκπτωση</th><th className="py-2 px-3 text-right">Απόδοση</th></tr></thead>
          <tbody>
            {promos.map((p) => {
              const roi = p.amount ? p.revenue / p.amount : 0;
              return (
                <tr key={p.id} className="border-t border-eu-line">
                  <td className="py-2 px-3"><Link href={q({ promo: p.id })} className="font-bold hover:text-eu-blue hover:underline">{p.name}</Link><div className="text-eu-muted text-[length:var(--fs-13)]"><span className="font-mono">{p.code}</span> · {MECHANISM_LABEL[p.mechanism] ?? p.mechanism} · <Link href={`/admin/prosfores/${p.id}`} className="text-eu-blue hover:underline">άνοιγμα</Link></div></td>
                  <td data-label="Παραγγελίες" className="py-2 px-3 text-right tabular-nums">{n(p.orders.size)}</td>
                  <td data-label="Τεμάχια" className="py-2 px-3 text-right tabular-nums">{n(p.units)}</td>
                  <td data-label="Έσοδα" className="py-2 px-3 text-right tabular-nums">{eur0(p.revenue)}</td>
                  <td data-label="Έκπτωση" className="py-2 px-3 text-right tabular-nums font-bold">{eur0(p.amount)}</td>
                  <td data-label="Απόδοση" className="py-2 px-3 text-right tabular-nums"><span className={`font-bold ${roi >= 5 ? "text-eu-green" : roi && roi < 2 ? "text-eu-red" : "text-eu-ink"}`}>{roi ? `${roi.toLocaleString("el-GR", { maximumFractionDigits: 1 })}×` : "—"}</span></td>
                </tr>
              );
            })}
            {!promos.length && <tr><td colSpan={6} className="p-6 text-center text-eu-muted">Καμία χρήση προσφοράς σε αυτό το διάστημα.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <section className={card} aria-labelledby="rp-m"><h3 id="rp-m" className={h3}>Έκπτωση ανά μηχανισμό</h3>{mech.length ? <RankBars rows={mech} unit="€" /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Χωρίς δεδομένα στην περίοδο.</p>}</section>
        <section className={card} aria-labelledby="rp-p"><h3 id="rp-p" className={h3}>Προϊόντα με τη μεγαλύτερη έκπτωση</h3>{top.length ? <RankBars rows={top} unit="€" /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Χωρίς δεδομένα στην περίοδο.</p>}</section>
        <section className={card} aria-labelledby="rp-k"><h3 id="rp-k" className={h3}>Κουπόνια · χρήσεις</h3>{coupons.length ? <RankBars rows={coupons} /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κανένα κουπόνι δεν χρησιμοποιήθηκε. <Link href="/admin/prosfores/kouponia" className="font-bold text-eu-blue hover:underline">Κουπόνια →</Link></p>}</section>
      </div>

      <section data-help="promo.report.ads" className="rounded-2xl bg-white border border-eu-line overflow-hidden" aria-labelledby="rp-a">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3"><h3 id="rp-a" className={h3}>Διαφημιστικές θέσεις</h3><span className="text-eu-muted text-[length:var(--fs-13)]">εμφανίσεις & κλικ από την αρχή κάθε banner</span></div>
        {ads.length ? (
          <table className="eu-rtable w-full text-[length:var(--fs-14)] mt-2">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Banner</th><th className="py-2 px-3">Θέση</th><th className="py-2 px-3 text-right">Εμφανίσεις</th><th className="py-2 px-3 text-right">Κλικ</th><th className="py-2 px-3 text-right">CTR</th></tr></thead>
            <tbody>{ads.map((a) => <tr key={a.id} className="border-t border-eu-line"><td className="py-2 px-3 font-bold">{a.title}{a.status !== "active" && <span className="ml-1 font-normal text-eu-muted">({a.status === "paused" ? "σε παύση" : a.status === "draft" ? "πρόχειρο" : a.status})</span>}</td><td data-label="Θέση" className="py-2 px-3 text-eu-ink-3">{SLOTS.find((s) => s.key === a.slot)?.label ?? a.slot}</td><td data-label="Εμφανίσεις" className="py-2 px-3 text-right tabular-nums">{n(a.impressions)}</td><td data-label="Κλικ" className="py-2 px-3 text-right tabular-nums">{n(a.clicks)}</td><td data-label="CTR" className="py-2 px-3 text-right tabular-nums font-bold">{a.impressions ? `${((a.clicks / a.impressions) * 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })} %` : "—"}</td></tr>)}</tbody>
          </table>
        ) : <p className="m-0 px-4 pb-4 pt-1 text-eu-muted text-[length:var(--fs-14)]">Κανένα banner με εμφανίσεις{promo ? " για αυτή την καμπάνια" : ""}. <Link href="/admin/prosfores/theseis" className="font-bold text-eu-blue hover:underline">Διαφημιστικές θέσεις →</Link></p>}
      </section>

      <details className="group rounded-2xl bg-white border border-eu-line overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 min-h-12 [&::-webkit-details-marker]:hidden"><span className={`${h3} flex-1`}>Παραστατικά με προσφορά ({n(orderIds.length)})</span><span className="font-bold text-eu-blue text-[length:var(--fs-13)] group-open:hidden">Άνοιγμα</span></summary>
        <table className="eu-rtable w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Παραγγελία</th><th className="py-2 px-3">Ημερομηνία</th><th className="py-2 px-3">Κουπόνι</th><th className="py-2 px-3 text-right">Έκπτωση</th><th className="py-2 px-3 text-right">Σύνολο</th><th className="py-2 px-3">SoftOne</th></tr></thead>
          <tbody>
            {orders.map((o) => <tr key={o.id} className="border-t border-eu-line"><td className="py-2 px-3"><Link href={`/admin/prosfores/anafores/paraggelia/${o.id}`} className="font-bold text-eu-blue hover:underline">{o.number}</Link></td><td data-label="Ημερομηνία" className="py-2 px-3">{o.createdAt.toLocaleString("el-GR")}</td><td data-label="Κουπόνι" className="py-2 px-3 font-mono">{o.couponCode ?? "—"}</td><td data-label="Έκπτωση" className="py-2 px-3 text-right tabular-nums">{eur(Number(o.discountTotal))}</td><td data-label="Σύνολο" className="py-2 px-3 text-right tabular-nums">{eur(Number(o.total))}</td><td data-label="SoftOne" className="py-2 px-3">{o.erpSync?.status === "preview" ? "προεπισκόπηση" : o.erpSync?.status ?? "—"}</td></tr>)}
            {!orders.length && <tr><td colSpan={6} className="p-6 text-center text-eu-muted">Καμία παραγγελία με προσφορά.</td></tr>}
          </tbody>
        </table>
        {orderIds.length > 25 && <p className="m-0 px-4 py-2 text-eu-muted text-[length:var(--fs-13)]">Τα 25 πιο πρόσφατα από {n(orderIds.length)}.</p>}
      </details>
    </div>
  );
}
