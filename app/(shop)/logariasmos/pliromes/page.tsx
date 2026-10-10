import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, CalendarClock, ShieldCheck } from "lucide-react";
import { accountInstalments, accountPayments, requireCustomer } from "@/lib/account/data";
import { payLabel } from "@/lib/account/labels";
import { priceLong } from "@/lib/format";

export const metadata: Metadata = { title: "Πληρωμές & δόσεις" };

const STATUS: Record<string, { t: string; cls: string }> = {
  paid: { t: "Πληρώθηκε", cls: "bg-eu-green/12 text-eu-green" }, pending: { t: "Αναμένεται", cls: "bg-eu-amber/15 text-eu-ink-2" },
  processing: { t: "Επιβεβαιώνεται", cls: "bg-eu-chip text-eu-blue" }, failed: { t: "Απέτυχε", cls: "bg-eu-red/10 text-eu-red" },
  cancelled: { t: "Ακυρώθηκε", cls: "bg-eu-surface text-eu-muted" }, review: { t: "Σε έλεγχο", cls: "bg-eu-amber/15 text-eu-ink-2" },
};

/**
 * /logariasmos/pliromes — πραγματικά δεδομένα: ιστορικό πληρωμών των παραγγελιών e-shop και τα προγράμματα δόσεων.
 * Κάρτες ΔΕΝ αποθηκεύουμε: τις κρατά ο πάροχος (Viva) και τις βλέπεις στη σελίδα πληρωμής του.
 */
export default async function PaymentsPage() {
  const me = await requireCustomer("/logariasmos/pliromes");
  const [payments, plans] = await Promise.all([accountPayments(me.id), accountInstalments(me.id)]);
  const active = plans.filter((p) => p.paid < p.months);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Πληρωμές & δόσεις</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Οι πληρωμές των παραγγελιών σου και οι δόσεις που τρέχουν.</p>
      </div>

      <p className="m-0 flex items-start gap-3 rounded-2xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">
        <ShieldCheck className="size-5 shrink-0 mt-0.5 text-eu-green" aria-hidden />
        <span>Δεν αποθηκεύουμε κάρτες. Πληρώνεις στην ασφαλή σελίδα της Viva, που θυμάται τις κάρτες σου (και όσες έχεις χρησιμοποιήσει σε άλλα καταστήματα με Viva) — η Euronics δεν βλέπει ποτέ τα στοιχεία τους.</span>
      </p>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="ph">
        <h2 id="ph" className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Ιστορικό πληρωμών</h2>
        {payments.length ? (
          <ul className="m-0 p-0 list-none grid gap-2">
            {payments.map((p) => { const st = STATUS[p.status] ?? STATUS.pending; return (
              <li key={p.number} className="bg-white rounded-2xl border border-eu-line p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <CreditCard className="size-5 text-eu-blue shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/logariasmos/paraggelies/${encodeURIComponent(p.number)}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{p.number}</Link>
                  <div className="text-eu-muted text-[length:var(--fs-14)]">{new Date(p.date).toLocaleDateString("el-GR")} · {payLabel(p.method)}{p.instalments > 1 ? ` · ${p.instalments} δόσεις` : ""}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${st.cls}`}>{st.t}</span>
                <span className="font-extrabold text-eu-ink tabular-nums text-[length:var(--fs-16)]">{priceLong(p.total)}</span>
              </li>
            ); })}
          </ul>
        ) : <p className="m-0 rounded-2xl border border-eu-line bg-white p-5 text-eu-ink-3 text-[length:var(--fs-15)]">Δεν έχεις ακόμη πληρωμές στο e-shop.</p>}
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="ip">
        <h2 id="ip" className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">
          Ενεργά προγράμματα δόσεων
        </h2>
        {!active.length && <p className="m-0 rounded-2xl border border-eu-line bg-white p-5 text-eu-ink-3 text-[length:var(--fs-15)]">Δεν έχεις δόσεις που τρέχουν.</p>}
        <ul className="m-0 p-0 list-none grid gap-3">
          {active.map((p) => {
            const left = p.months - p.paid;
            const pct = Math.round((p.paid / p.months) * 100);
            return (
              <li key={p.id} className="bg-white rounded-2xl border border-eu-line p-5 grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">{p.title}</div>
                    <div className="text-eu-muted text-[length:var(--fs-14)]">
                      Παραγγελία{" "}
                      <Link href={`/logariasmos/paraggelies/${encodeURIComponent(p.orderNumber)}`} className="text-eu-blue underline">
                        {p.orderNumber}
                      </Link>{" "}
                      · {p.provider === "eurobank" ? "Δόσεις χωρίς κάρτα · Eurobank" : "Άτοκες δόσεις με κάρτα"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-eu-ink text-[length:var(--fs-22)] leading-none">{priceLong(p.monthly)}</div>
                    <div className="text-eu-muted text-[length:var(--fs-14)]">/ μήνα</div>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-eu-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-eu-green origin-left animate-[eu-grow_.9s_var(--eu-ease-out)_both]" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-[length:var(--fs-14)] text-eu-ink-2">
                  <span>
                    {p.paid} από {p.months} δόσεις · απομένουν {left} ({priceLong(left * p.monthly)})
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink">
                    <CalendarClock className="size-4 text-eu-blue" aria-hidden /> Επόμενη {new Date(p.nextDate).toLocaleDateString("el-GR", { day: "numeric", month: "long" })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
