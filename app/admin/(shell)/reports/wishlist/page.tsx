import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { RankBars, StatTile } from "@/components/admin/charts/Charts";
import { WishlistAlertsRunner } from "@/components/admin/customers/WishlistAlertsRunner";

export const metadata = { title: "Αγαπημένα" };
export const dynamic = "force-dynamic";

/** Merchandising signal: which products customers save, how many wait for a price drop / stock. */
export default async function WishlistReport() {
  await requirePermission("reports.read");
  const notified = await db.wishlistItem.count({ where: { lastNotifiedAt: { not: null } } });
  const alerts = await db.customerEvent.findMany({ where: { kind: "wishlist-alert" }, orderBy: { at: "desc" }, take: 10, include: { customer: { select: { firstName: true, lastName: true } } } });
  const [top, totals, customers, drops] = await Promise.all([
    db.wishlistItem.groupBy({ by: ["productId"], _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 15 }),
    db.wishlistItem.aggregate({ _count: { _all: true } }),
    db.wishlistList.groupBy({ by: ["customerId"], _count: { _all: true } }),
    db.wishlistItem.count({ where: { notifyPriceDrop: true } }),
  ]);
  const products = await getProductsByIds(top.map((t) => t.productId));
  const rows = top.map((t) => { const p = products.find((x) => x.id === t.productId); return { label: p ? `${p.brand} ${p.title}` : t.productId, value: t._count._all, sub: p ? `${p.price.toLocaleString("el-GR")} €` : undefined }; });
  return (
    <>
      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Αναφορές</Link>
      <div><div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Ζήτηση</div><h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Αγαπημένα πελατών</h2><p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Τι αποθηκεύουν οι πελάτες στις λίστες τους: σήμα για προσφορές, απόθεμα και ειδοποιήσεις πτώσης τιμής.</p></div>
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3"><StatTile label="Αποθηκευμένα προϊόντα" value={totals._count._all.toLocaleString("el-GR")} accent /><StatTile label="Πελάτες με λίστα" value={String(customers.length)} /><StatTile label="Περιμένουν πτώση τιμής" value={drops.toLocaleString("el-GR")} /><StatTile label="Μέσο ανά πελάτη" value={customers.length ? (totals._count._all / customers.length).toFixed(1) : "—"} /></div>
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τα 15 πιο αποθηκευμένα</h3><RankBars rows={rows} unit="" /></section>
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ειδοποιήσεις πτώσης τιμής & διαθεσιμότητας</h3><WishlistAlertsRunner /></div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Τρέχει αυτόματα μετά από κάθε συγχρονισμό τιμών/αποθέματος και από το cron <code className="font-mono">/api/cron/wishlist-alerts</code>. Μία ειδοποίηση ανά πτώση τιμής, με σεβασμό στη συναίνεση κάθε πελάτη. Μέχρι τώρα: <b className="text-eu-ink">{notified}</b> προϊόντα ειδοποιημένα.</p>
        {alerts.length ? <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{alerts.map((a) => { const m = a.meta as { type?: string; productId?: string; was?: number; now?: number }; return <li key={a.id} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 border-t border-eu-line-2 py-1"><span className="tabular-nums text-eu-muted">{a.at.toLocaleString("el-GR")}</span><span>{a.customer?.lastName} {a.customer?.firstName} · {m.type === "price-drop" ? `πτώση τιμής ${m.was} € → ${m.now} €` : "ξανά διαθέσιμο"} · <span className="font-mono text-eu-muted">{m.productId}</span></span></li>; })}</ul> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία ειδοποίηση ακόμη.</p>}
      </section>
    </>
  );
}
