import Link from "next/link";
import { BarChart, KpiTile } from "@/components/admin/charts/Charts";
import type { ProductOverview as PO } from "@/lib/catalog/product-overview";

const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const eur2 = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const SRC: Record<string, [string, string]> = { eshop: ["e-shop", "bg-eu-chip text-eu-blue"], softone: ["SoftOne", "bg-eu-green/12 text-eu-green"], nop: ["παλιό e-shop", "bg-eu-surface text-eu-muted"] };
const TICKET: Record<string, string> = { repair: "Επισκευή", installation: "Εγκατάσταση", delivery: "Παράδοση", pickup: "Παραλαβή", appointment: "Ραντεβού", "warranty-claim": "Εγγύηση" };
const card = "rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-2 content-start min-w-0";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]";

/**
 * Επισκόπηση προϊόντος: πωλήσεις (e-shop + SoftOne) με τάση 12 μηνών, επιστροφές, αγοραστές, συσκευές σε εγγύηση,
 * service, κριτικές, ερωτήσεις, αγαπημένα και η τιμή/προσφορά τώρα — όλα από τη βάση μας.
 */
export function ProductOverview({ o, price, stock }: { o: PO; price: number | null; stock: number }) {
  const s = o.sales;
  const returnRate = s.units ? Math.round((s.returned / s.units) * 1000) / 10 : 0;
  return (
    <div data-help="product.overview" className="grid gap-3">
      <div className="grid grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-6 gap-2">
        <KpiTile label="Τεμάχια" value={s.units.toLocaleString("el-GR")} sub={`${s.last12.toLocaleString("el-GR")} τους τελευταίους 12 μήνες`} />
        <KpiTile label="Έσοδα" value={eur(s.revenue)} sub={s.units ? `μέση τιμή ${eur(s.avg)}` : "καμία πώληση"} />
        <KpiTile label="Πελάτες" value={s.customers.toLocaleString("el-GR")} sub={`e-shop ${s.eshopUnits} · SoftOne ${s.erpUnits} τεμ.`} />
        <KpiTile label="Τελευταία πώληση" value={s.last ? day(s.last) : "—"} sub={s.first ? `πρώτη ${day(s.first)}` : undefined} />
        <KpiTile label="Επιστροφές" value={s.returned.toLocaleString("el-GR")} sub={s.units ? `${returnRate} % των πωλήσεων` : undefined} tone={returnRate >= 5 ? "warn" : undefined} />
        <KpiTile label="Σε εγγύηση" value={`${o.devices.inWarranty.toLocaleString("el-GR")}`} sub={`από ${o.devices.total} συσκευές πελατών · ${o.devices.extended} με επέκταση`} />
      </div>

      <div className="grid gap-3 @5xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <section className={card} aria-labelledby="po-m"><h3 id="po-m" className={h3}>Τεμάχια ανά μήνα</h3>
          {o.monthly.some((m) => m.units > 0) ? <BarChart labels={o.monthly.map((m) => m.label)} series={[{ key: "u", label: "Τεμάχια", values: o.monthly.map((m) => m.units) }]} height={170} /> : <p className="m-0 grid place-items-center min-h-28 rounded-xl bg-eu-surface/60 text-eu-muted text-[length:var(--fs-14)] text-center px-4">Καμία πώληση τους τελευταίους 12 μήνες.</p>}
        </section>
        <section className={card} aria-labelledby="po-now"><h3 id="po-now" className={h3}>Τώρα στη βιτρίνα</h3>
          <dl className="m-0 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[length:var(--fs-14)]">
            <dt className="text-eu-muted">Τιμή</dt><dd className="m-0 font-bold text-eu-ink tabular-nums">{o.offer && o.offer.price < o.offer.listPrice ? <><s className="text-eu-muted font-normal">{eur2(o.offer.listPrice)}</s> <span className="text-eu-red">{eur2(o.offer.price)}</span></> : price != null ? eur2(price) : "—"}</dd>
            {o.offer?.promo && <><dt className="text-eu-muted">Προσφορά</dt><dd className="m-0 min-w-0"><Link href={`/admin/prosfores/${o.offer.promo.id}`} className="font-bold text-eu-blue hover:underline">{o.offer.promo.name}</Link>{o.offer.endsAt && <span className="text-eu-muted"> · έως {day(o.offer.endsAt)}</span>}</dd></>}
            {o.offer?.lowest30 != null && <><dt className="text-eu-muted">Χαμηλότερη 30 ημ.</dt><dd className="m-0 tabular-nums">{eur2(o.offer.lowest30)}</dd></>}
            <dt className="text-eu-muted">Απόθεμα</dt><dd className={`m-0 font-bold ${stock > 0 ? "text-eu-green" : "text-eu-ink-3"}`}>{stock > 0 ? `${stock} τεμ.` : "κατόπιν παραγγελίας"}</dd>
            <dt className="text-eu-muted">Αγαπημένα</dt><dd className="m-0">{o.wishlist ? `σε ${o.wishlist.toLocaleString("el-GR")} λίστες` : "—"}</dd>
            <dt className="text-eu-muted">Κριτικές</dt><dd className="m-0">{o.reviews.count ? <><b className="text-eu-yellow-dark">★ {o.reviews.avg?.toLocaleString("el-GR", { maximumFractionDigits: 1 })}</b> από {o.reviews.count}</> : "καμία"}{o.reviews.pending ? <span className="text-eu-amber font-bold"> · {o.reviews.pending} για έγκριση</span> : null}</dd>
            <dt className="text-eu-muted">Ερωτήσεις</dt><dd className="m-0">{o.questions.count ? `${o.questions.count}` : "καμία"}{o.questions.unanswered ? <span className="text-eu-amber font-bold"> · {o.questions.unanswered} χωρίς απάντηση</span> : null}</dd>
          </dl>
        </section>
      </div>

      <div className="grid gap-3 @5xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <section className={card} aria-labelledby="po-r"><h3 id="po-r" className={h3}>Τελευταίες πωλήσεις <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">({s.docs.toLocaleString("el-GR")} συνολικά)</span></h3>
          {o.recent.length ? (
            <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-xl border border-eu-line">
              {o.recent.map((r, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[6.5rem_minmax(0,1fr)_auto_auto] gap-x-3 items-center px-2.5 py-1.5 text-[length:var(--fs-13)]">
                  <span className="text-eu-ink-3 tabular-nums">{day(r.date)}</span>
                  <span className="row-start-2 col-span-2 @2xl:row-start-auto @2xl:col-span-1 min-w-0 truncate">{r.customerId ? <Link href={`/admin/customers/${r.customerId}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.customer}</Link> : <span className="text-eu-muted">πελάτης λιανικής</span>} <span className="text-eu-muted font-mono">· {r.ref}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${SRC[r.src]?.[1] ?? ""}`}>{SRC[r.src]?.[0] ?? r.src}</span>
                  <span className="hidden @2xl:block text-right tabular-nums"><b>{r.qty > 1 ? `${r.qty}× ` : ""}</b>{eur2(r.total)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 rounded-xl bg-eu-surface/60 px-3 py-2 text-eu-muted text-[length:var(--fs-14)]">Δεν έχει πουληθεί ακόμη.</p>}
        </section>
        <section className={card} aria-labelledby="po-s"><h3 id="po-s" className={h3}>Service {o.service.total ? <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">({o.service.open} ανοιχτά από {o.service.total})</span> : null}</h3>
          {o.service.recent.length ? (
            <ul className="m-0 p-0 list-none grid gap-1">
              {o.service.recent.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><b className="font-mono">{t.number}</b><span className="text-eu-ink-3">{TICKET[t.kind] ?? t.kind} · {day(t.createdAt)}{t.inWarranty ? " · εγγύηση" : ""}</span>{t.customerId && <Link href={`/admin/customers/${t.customerId}?tab=service`} className="ml-auto font-bold text-eu-blue hover:underline truncate max-w-[12rem]">{t.customer}</Link>}</li>
              ))}
            </ul>
          ) : <p className="m-0 rounded-xl bg-eu-surface/60 px-3 py-2 text-eu-muted text-[length:var(--fs-14)]">Κανένα αίτημα service για αυτό το προϊόν.</p>}
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Συσκευές πελατών: {o.devices.total} ({o.devices.fromErp} από SoftOne) — εγγύηση από τα χαρακτηριστικά του προϊόντος, αλλιώς 24 μήνες.</p>
        </section>
      </div>
    </div>
  );
}
