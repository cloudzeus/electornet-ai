import Link from "next/link";
import { BarChart } from "@/components/admin/charts/Charts";
import type { ProductOverview as PO } from "@/lib/catalog/product-overview";

const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const eur2 = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) : "-");
const SRC: Record<string, [string, string]> = { eshop: ["e-shop", "bg-eu-chip text-eu-blue"], softone: ["SoftOne", "bg-eu-navy/10 text-eu-navy"], nop: ["παλιό e-shop", "bg-eu-surface text-eu-muted"] };
const TICKET: Record<string, string> = { repair: "Επισκευή", installation: "Εγκατάσταση", delivery: "Παράδοση", pickup: "Παραλαβή", appointment: "Ραντεβού", "warranty-claim": "Εγγύηση" };
// πυκνή μορφή διαχείρισης: κάρτες 12px padding, τίτλοι 14, κείμενο 13, ετικέτες 12
const card = "rounded-xl bg-white border border-eu-line p-3 grid gap-2 content-start min-w-0";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-14)]";
const empty = "m-0 rounded-lg bg-eu-surface/60 px-2.5 py-1.5 text-eu-muted text-[length:var(--fs-13)]";

/** Ένα κελί της λωρίδας δεικτών. */
const Stat = ({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) => (
  <div className="px-3 py-2 min-w-0">
    <div className="text-eu-muted text-[length:var(--fs-12)] font-semibold truncate">{label}</div>
    <div className={`font-heading font-extrabold text-[length:var(--fs-18)] leading-tight tabular-nums truncate ${warn ? "text-eu-amber" : "text-eu-ink"}`}>{value}</div>
    {sub && <div className="text-eu-ink-3 text-[length:var(--fs-12)] truncate" title={sub}>{sub}</div>}
  </div>
);

/**
 * Επισκόπηση προϊόντος: λωρίδα δεικτών (πωλήσεις e-shop + SoftOne, επιστροφές, αγοραστές, συσκευές σε εγγύηση) και δύο
 * στήλες: αριστερά τάση 12 μηνών και τελευταίες πωλήσεις, δεξιά βιτρίνα τώρα και service. Όλα από τη βάση μας.
 */
export function ProductOverview({ o, price, stock }: { o: PO; price: number | null; stock: number }) {
  const s = o.sales;
  const returnRate = s.units ? Math.round((s.returned / s.units) * 1000) / 10 : 0;
  return (
    <div data-help="product.overview" className="grid gap-2.5">
      <div className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-6 rounded-xl border border-eu-line bg-white overflow-hidden [&>*]:border-eu-line-2 [&>*]:border-b [&>*]:border-r">
        <Stat label="Τεμάχια" value={s.units.toLocaleString("el-GR")} sub={`${s.last12.toLocaleString("el-GR")} σε 12 μήνες`} />
        <Stat label="Έσοδα" value={eur(s.revenue)} sub={s.units ? `μέση τιμή ${eur(s.avg)}` : "καμία πώληση"} />
        <Stat label="Πελάτες" value={s.customers.toLocaleString("el-GR")} sub={`e-shop ${s.eshopUnits} · SoftOne ${s.erpUnits}`} />
        <Stat label="Τελευταία πώληση" value={day(s.last)} sub={s.first ? `πρώτη ${day(s.first)}` : undefined} />
        <Stat label="Επιστροφές" value={s.returned.toLocaleString("el-GR")} sub={s.units ? `${returnRate} % των πωλήσεων` : undefined} warn={returnRate >= 5} />
        <Stat label="Σε εγγύηση" value={o.devices.inWarranty.toLocaleString("el-GR")} sub={`από ${o.devices.total} συσκευές · ${o.devices.extended} επέκταση`} />
      </div>

      <div className="grid gap-2.5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <div className="grid gap-2.5 min-w-0">
          <section className={card} aria-labelledby="po-m"><h3 id="po-m" className={h3}>Τεμάχια ανά μήνα</h3>
            {o.monthly.some((m) => m.units > 0) ? <BarChart labels={o.monthly.map((m) => m.label)} series={[{ key: "u", label: "Τεμάχια", values: o.monthly.map((m) => m.units) }]} height={150} /> : <p className={empty}>Καμία πώληση τους τελευταίους 12 μήνες.</p>}
          </section>
          <section className={card} aria-labelledby="po-r"><h3 id="po-r" className={h3}>Τελευταίες πωλήσεις <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">({s.docs.toLocaleString("el-GR")} συνολικά)</span></h3>
            {o.recent.length ? (
              <ul className="m-0 p-0 list-none divide-y divide-eu-line-2 rounded-lg border border-eu-line">
                {o.recent.map((r, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[6rem_minmax(0,1fr)_auto_auto] gap-x-2.5 items-center px-2.5 py-1 text-[length:var(--fs-13)]">
                    <span className="text-eu-ink-3 tabular-nums">{day(r.date)}</span>
                    <span className="row-start-2 col-span-2 @2xl:row-start-auto @2xl:col-span-1 min-w-0 truncate">{r.customerId ? <Link href={`/admin/customers/${r.customerId}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.customer}</Link> : <span className="text-eu-muted">πελάτης λιανικής</span>} <span className="text-eu-muted font-mono text-[length:var(--fs-12)]">{r.ref}</span></span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--fs-12)] font-bold ${SRC[r.src]?.[1] ?? ""}`}>{SRC[r.src]?.[0] ?? r.src}</span>
                    <span className="hidden @2xl:block text-right tabular-nums"><b>{r.qty > 1 ? `${r.qty}× ` : ""}</b>{eur2(r.total)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className={empty}>Δεν έχει πουληθεί ακόμη.</p>}
          </section>
        </div>

        <div className="grid gap-2.5 min-w-0">
          <section className={card} aria-labelledby="po-now"><h3 id="po-now" className={h3}>Τώρα στη βιτρίνα</h3>
            <dl className="m-0 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[length:var(--fs-13)]">
              <dt className="text-eu-muted">Τιμή</dt><dd className="m-0 font-bold text-eu-ink tabular-nums">{o.offer && o.offer.price < o.offer.listPrice ? <><s className="text-eu-muted font-normal">{eur2(o.offer.listPrice)}</s> <span className="text-eu-red">{eur2(o.offer.price)}</span></> : price != null ? eur2(price) : "-"}</dd>
              {o.offer?.promo && <><dt className="text-eu-muted">Προσφορά</dt><dd className="m-0 min-w-0"><Link href={`/admin/prosfores/${o.offer.promo.id}`} className="font-bold text-eu-blue hover:underline">{o.offer.promo.name}</Link>{o.offer.endsAt && <span className="text-eu-muted"> έως {day(o.offer.endsAt)}</span>}</dd></>}
              {o.offer?.lowest30 != null && <><dt className="text-eu-muted">Χαμηλότερη 30 ημ.</dt><dd className="m-0 tabular-nums">{eur2(o.offer.lowest30)}</dd></>}
              <dt className="text-eu-muted">Απόθεμα</dt><dd className={`m-0 font-bold ${stock > 0 ? "text-eu-green" : "text-eu-ink-3"}`}>{stock > 0 ? `${stock} τεμ.` : "κατόπιν παραγγελίας"}</dd>
              <dt className="text-eu-muted">Αγαπημένα</dt><dd className="m-0">{o.wishlist ? `σε ${o.wishlist.toLocaleString("el-GR")} λίστες` : "-"}</dd>
              <dt className="text-eu-muted">Κριτικές</dt><dd className="m-0">{o.reviews.count ? <><b className="text-eu-yellow-dark">★ {o.reviews.avg?.toLocaleString("el-GR", { maximumFractionDigits: 1 })}</b> από {o.reviews.count}</> : "καμία"}{o.reviews.pending ? <span className="text-eu-amber font-bold">, {o.reviews.pending} για έγκριση</span> : null}</dd>
              <dt className="text-eu-muted">Ερωτήσεις</dt><dd className="m-0">{o.questions.count ? `${o.questions.count}` : "καμία"}{o.questions.unanswered ? <span className="text-eu-amber font-bold">, {o.questions.unanswered} χωρίς απάντηση</span> : null}</dd>
            </dl>
          </section>
          <section className={card} aria-labelledby="po-s"><h3 id="po-s" className={h3}>Service {o.service.total ? <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">({o.service.open} ανοιχτά από {o.service.total})</span> : null}</h3>
            {o.service.recent.length ? (
              <ul className="m-0 p-0 list-none grid gap-1">
                {o.service.recent.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><b className="font-mono">{t.number}</b><span className="text-eu-ink-3">{TICKET[t.kind] ?? t.kind} · {day(t.createdAt)}{t.inWarranty ? " · εγγύηση" : ""}</span>{t.customerId && <Link href={`/admin/customers/${t.customerId}?tab=service`} className="ml-auto font-bold text-eu-blue hover:underline truncate max-w-[12rem]">{t.customer}</Link>}</li>
                ))}
              </ul>
            ) : <p className={empty}>Κανένα αίτημα service για αυτό το προϊόν.</p>}
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Συσκευές πελατών: {o.devices.total} ({o.devices.fromErp} από SoftOne). Εγγύηση από τα χαρακτηριστικά του προϊόντος, αλλιώς 24 μήνες.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
