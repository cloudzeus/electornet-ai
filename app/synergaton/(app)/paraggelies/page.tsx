import Link from "next/link";
import { ChevronDown, ClipboardList, FileText, Mail, MapPin, Phone, Search, Store, StickyNote, User } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { lastDays, ORDER_FILTERS, partnerOrders } from "@/lib/partner-portal/data";
import { FULFILMENT, ORDER_STATUS, statusLabel } from "@/lib/orders/model";
import { markRestocksSeen } from "@/lib/partner-portal/restock";
import { RestockPanel } from "@/components/synergaton/RestockPanel";
import { BarChart } from "@/components/admin/charts/Charts";
import { toneOfOrder } from "@/components/synergaton/log-kinds";
import { Badge, Card, CardHead, Empty, fmtDateTime, fmtEur, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Παραγγελίες" };
const FILTER_LABEL = { "": "Όλες", open: "Προς παραλαβή", done: "Παραδόθηκαν", cancelled: "Ακυρώθηκαν" } as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; store?: string; page?: string }> }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80), status = sp.status ?? "", store = sp.store ?? "";
  const days = lastDays(30);
  const [d, stores, recent] = await Promise.all([
    partnerOrders(u.partner.id, { q, status, store, page: Number(sp.page) || 1 }),
    db.store.findMany({ where: { partnerId: u.partner.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.order.findMany({ where: { pickupStore: { partnerId: u.partner.id }, createdAt: { gte: new Date(days[0]) } }, select: { createdAt: true, status: true } }),
  ]);
  // οι αποφάσεις της Euronics που φαίνονται εδώ θεωρούνται πλέον γνωστές (σβήνει η ειδοποίηση της αρχικής)
  await markRestocksSeen(u.partner.id, d.rows.flatMap((o) => o.restocks.filter((r) => !r.seenAt && r.status !== "requested").map((r) => r.id)));
  const key = (dt: Date) => dt.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
  const per = (pred: (s: string) => boolean) => days.map((day) => recent.filter((o) => key(o.createdAt) === day && pred(o.status)).length);
  const isCancel = (s: string) => (ORDER_FILTERS.cancelled as readonly string[]).includes(s);
  const count = (k: keyof typeof ORDER_FILTERS) => ORDER_FILTERS[k].reduce((n, s) => n + (d.byStatus[s] ?? 0), 0);
  const qs = (o: Record<string, string>) => { const p = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(store ? { store } : {}), ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); const s = p.toString(); return `${base}/paraggelies${s ? `?${s}` : ""}`; };
  const all = Object.values(d.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Πωλήσεις" title="Παραγγελίες παραλαβής" sub="Παραγγελίες του euronics.gr όπου ο πελάτης διάλεξε κατάστημά σας. Δεν χρειάζεται έγκριση: κάθε παραγγελία παραδίδεται στον πελάτη. Αν λείπει απόθεμα, ζητήστε αναπλήρωση από την Euronics μέσα από την παραγγελία." />

      <Card data-help="portal.orders-chart">
        <CardHead icon={ClipboardList} title="Τελευταίες 30 ημέρες" sub={`${recent.filter((o) => !isCancel(o.status)).length} παραγγελίες · ${recent.filter((o) => isCancel(o.status)).length} ακυρώσεις`} />
        <div className="p-4 sm:p-5">{recent.length ? <BarChart labels={days.map((x) => new Date(x).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }))} series={[{ key: "o", label: "Παραγγελίες", values: per((s) => !isCancel(s)) }, { key: "c", label: "Ακυρώσεις", values: per(isCancel), color: "#E63422" }]} height={180} /> : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία παραγγελία τον τελευταίο μήνα.</p>}</div>
      </Card>

      <div className="grid gap-3" data-help="portal.orders-filters">
        <nav aria-label="Κατάσταση" className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABEL) as (keyof typeof FILTER_LABEL)[]).map((k) => {
            const on = status === k, n = k ? count(k) : all;
            return <Link key={k || "all"} href={qs({ status: k, page: "" })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] border-2 transition-colors ${on ? "bg-eu-navy border-eu-navy text-white" : "bg-white border-eu-line text-eu-ink hover:border-eu-navy"}`}>{FILTER_LABEL[k]}<span className={`rounded-full px-2 text-[length:var(--fs-12)] tabular-nums ${on ? "bg-white/20" : k === "open" && n ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface-2"}`}>{n}</span></Link>;
          })}
        </nav>
        <form action={`${base}/paraggelies`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="relative min-w-0"><span className="sr-only">Αναζήτηση</span><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input name="q" defaultValue={q} placeholder="Αριθμός, επώνυμο ή προϊόν" className="w-full min-h-12 rounded-full border-2 border-eu-line bg-white pl-10 pr-4 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" /></label>
          {stores.length > 1 && <label className="min-w-0"><span className="sr-only">Κατάστημα</span><select name="store" defaultValue={store} className="w-full min-h-12 rounded-full border-2 border-eu-line bg-white px-4 text-[length:var(--fs-15)]"><option value="">Όλα τα καταστήματα</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <button className="min-h-12 rounded-full bg-eu-navy text-white font-bold px-6 text-[length:var(--fs-15)] hover:bg-eu-blue">Αναζήτηση</button>
        </form>
      </div>

      {d.rows.length ? (
        <ul data-help="portal.orders-list" className="m-0 p-0 list-none grid gap-2">
          {d.rows.map((o) => (
            <li key={o.id}>
              <details className="group rounded-2xl border border-eu-line bg-white open:shadow-sm">
                <summary className="list-none cursor-pointer grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-eu-blue/40 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><b className="font-heading text-[length:var(--fs-16)]">#{o.number}</b><Badge tone={toneOfOrder(o.status)}>{statusLabel(o.status)}</Badge></span>
                    <span className="block text-eu-ink-3 text-[length:var(--fs-13)]">{fmtDateTime(o.createdAt)} · {o.customer} · <Store className="inline size-3.5" aria-hidden /> {o.pickupStore?.name}</span>
                  </span>
                  <span className="text-[length:var(--fs-14)] text-eu-ink-2 tabular-nums">{o.lines.reduce((n, l) => n + l.qty, 0)} τεμ. · <b className="text-eu-ink">{fmtEur(o.total)}</b></span>
                  <ChevronDown className="hidden sm:block size-5 text-eu-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <div className="px-4 pb-4 grid gap-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                  <ul className="m-0 p-0 list-none grid gap-1.5">
                    {o.lines.map((l, i) => <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-14)]"><span className="min-w-0"><b className="block break-words">{l.title}</b>{l.erpCode && <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Κωδ. {l.erpCode}</span>}</span><span className="tabular-nums text-right">{l.qty} × {fmtEur(l.unitPrice)}</span></li>)}
                  </ul>
                  <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3">{isOrderHelp(o.status)}</p>
                  <section data-help="portal.orders-customer" aria-label="Στοιχεία πελάτη" className="grid gap-x-4 gap-y-1 sm:grid-cols-2 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)]">
                    <span className="flex items-center gap-2 min-w-0"><User className="size-4 shrink-0 text-eu-muted" aria-hidden /><b className="break-words">{o.buyer.name}</b></span>
                    {o.buyer.phone && <a href={`tel:${o.buyer.phone}`} className="flex items-center gap-2 min-h-11 text-eu-blue font-bold"><Phone className="size-4 shrink-0" aria-hidden /> {o.buyer.phone}</a>}
                    {o.buyer.email && <a href={`mailto:${o.buyer.email}`} className="flex items-center gap-2 min-h-11 min-w-0 text-eu-blue font-bold"><Mail className="size-4 shrink-0" aria-hidden /><span className="break-all">{o.buyer.email}</span></a>}
                    {o.buyer.address && <span className="flex items-start gap-2 min-w-0"><MapPin className="size-4 shrink-0 mt-0.5 text-eu-muted" aria-hidden /><span className="break-words">{o.buyer.address}</span></span>}
                    <span className="flex items-center gap-2 text-eu-ink-2"><Store className="size-4 shrink-0 text-eu-muted" aria-hidden />{FULFILMENT[o.fulfilment as keyof typeof FULFILMENT] ?? o.fulfilment}{o.paymentMethod ? ` · ${payLabel(o.paymentMethod)}` : ""}</span>
                    {o.buyer.invoice && <span className="flex items-start gap-2 min-w-0 text-eu-ink-2"><FileText className="size-4 shrink-0 mt-0.5 text-eu-muted" aria-hidden /><span className="break-words">Τιμολόγιο: {[o.buyer.invoice.company, `ΑΦΜ ${o.buyer.invoice.vatNumber}`, o.buyer.invoice.doy].filter(Boolean).join(" · ")}</span></span>}
                    {o.buyer.notes && <span className="sm:col-span-2 flex items-start gap-2 min-w-0 text-eu-ink-2"><StickyNote className="size-4 shrink-0 mt-0.5 text-eu-muted" aria-hidden /><span className="break-words">{o.buyer.notes}</span></span>}
                  </section>
                  <RestockPanel orderId={o.id} lines={o.lines} restocks={o.restocks} closed={(ORDER_FILTERS.cancelled as readonly string[]).includes(o.status)} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Card><Empty icon={ClipboardList} title={q || status || store ? "Καμία παραγγελία με αυτά τα φίλτρα" : "Καμία παραγγελία ακόμη"}>{q || status || store ? <Link className="text-eu-blue font-bold hover:underline" href={`${base}/paraggelies`}>Καθαρισμός φίλτρων</Link> : "Όταν πελάτης διαλέξει κατάστημά σας για παραλαβή, θα εμφανιστεί εδώ."}</Empty></Card>
      )}

      {d.pages > 1 && (
        <nav aria-label="Σελίδες" className="flex items-center justify-center gap-2 text-[length:var(--fs-14)]">
          {d.page > 1 && <Link href={qs({ page: String(d.page - 1) })} className="min-h-11 px-4 inline-flex items-center rounded-full border-2 border-eu-line font-bold hover:border-eu-navy">Προηγούμενη</Link>}
          <span className="tabular-nums text-eu-ink-3">Σελίδα {d.page} από {d.pages}</span>
          {d.page < d.pages && <Link href={qs({ page: String(d.page + 1) })} className="min-h-11 px-4 inline-flex items-center rounded-full border-2 border-eu-line font-bold hover:border-eu-navy">Επόμενη</Link>}
        </nav>
      )}
    </div>
  );
}

const PAY: Record<string, string> = { cod: "Αντικαταβολή", bank: "Τραπεζική μεταφορά", "bank-transfer": "Τραπεζική μεταφορά", store: "Πληρωμή στο κατάστημα" };
const payLabel = (m: string) => PAY[m] ?? "Πληρωμή online";

function isOrderHelp(s: string) {
  return s in ORDER_STATUS ? ORDER_STATUS[s as keyof typeof ORDER_STATUS].help : "";
}
