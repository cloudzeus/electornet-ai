import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Smartphone, Landmark, Plus, CalendarClock } from "lucide-react";
import { getInstalmentPlans, getPaymentMethods } from "@/lib/data/repo";
import { priceLong } from "@/lib/format";

export const metadata: Metadata = { title: "Πληρωμές & δόσεις" };

/**
 * @dynamic /logariasmos/pliromes — saved methods come masked from the
 * PSP token vault (`getPaymentMethods`); instalment plans from SoftOne
 * FINDOC (card) and the Eurobank consumer-credit API (χωρίς κάρτα).
 * Adding a card redirects to the PSP hosted page — never a form here.
 */
export default async function PaymentsPage() {
  const [methods, plans] = await Promise.all([getPaymentMethods(), getInstalmentPlans()]);
  const icon = { card: CreditCard, iris: Smartphone, bank: Landmark };
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Πληρωμές & δόσεις</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Οι κάρτες αποθηκεύονται στον πάροχο πληρωμών με 3D Secure. Η Euronics βλέπει μόνο τα 4 τελευταία ψηφία.</p>
      </div>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="pm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pm" className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">
            Αποθηκευμένοι τρόποι πληρωμής
          </h2>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">
            <Plus className="size-4" aria-hidden /> Προσθήκη κάρτας
          </button>
        </div>
        <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {methods.map((m) => {
            const Icon = icon[m.kind];
            return (
              <li key={m.id} className={`relative overflow-hidden rounded-2xl border-2 p-4 grid gap-2 ${m.kind === "card" ? "bg-[linear-gradient(135deg,#122A58_0%,#1D428A_70%,#2b5bb8_100%)] text-white border-transparent shadow-[0_16px_32px_-20px_rgba(18,42,88,.6)]" : "bg-white"} ${m.isDefault && m.kind !== "card" ? "border-eu-blue" : m.kind !== "card" ? "border-eu-line" : ""}`}>
                {m.kind === "card" && <span className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-eu-yellow/15" aria-hidden />}
                <div className="flex items-center gap-3">
                  <span className={`size-11 rounded-xl inline-flex items-center justify-center ${m.kind === "card" ? "bg-white/15 text-eu-yellow" : "bg-eu-surface text-eu-blue"}`}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className={`font-bold text-[length:var(--fs-16)] tabular-nums ${m.kind === "card" ? "text-white" : "text-eu-ink"}`}>
                      {m.label}
                      {m.last4 ? ` •••• ${m.last4}` : ""}
                    </div>
                    <div className={`text-[length:var(--fs-14)] ${m.kind === "card" ? "text-eu-on-dark-2" : "text-eu-muted"}`}>{m.expires ? `Λήξη ${m.expires}` : "Άμεση πληρωμή από mobile banking"}</div>
                  </div>
                  {m.isDefault && <span className={`ml-auto rounded-full font-bold text-[length:var(--fs-13)] px-2.5 py-1 ${m.kind === "card" ? "bg-eu-yellow text-eu-navy" : "bg-eu-chip text-eu-blue"}`}>Προεπιλογή</span>}
                </div>
                <div className="flex gap-3 text-[length:var(--fs-14)] font-bold">
                  {!m.isDefault && (
                    <button type="button" className={`hover:underline min-h-9 ${m.kind === "card" ? "text-eu-yellow" : "text-eu-blue"}`}>
                      Ορισμός ως προεπιλογή
                    </button>
                  )}
                  <button type="button" className={`min-h-9 ${m.kind === "card" ? "text-eu-on-dark-2 hover:text-white" : "text-eu-muted hover:text-eu-red"}`}>
                    Αφαίρεση
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="ip">
        <h2 id="ip" className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">
          Ενεργά προγράμματα δόσεων
        </h2>
        <ul className="m-0 p-0 list-none grid gap-3">
          {plans.map((p) => {
            const left = p.months - p.paid;
            const pct = Math.round((p.paid / p.months) * 100);
            return (
              <li key={p.id} className="bg-white rounded-2xl border border-eu-line p-5 grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">{p.title}</div>
                    <div className="text-eu-muted text-[length:var(--fs-14)]">
                      Παραγγελία{" "}
                      <Link href={`/logariasmos/paraggelies/${p.orderNumber}`} className="text-eu-blue underline">
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
