import Link from "next/link";
import { AlertTriangle, CheckCircle2, CreditCard, Phone, TrendingDown, TrendingUp } from "lucide-react";
import type { failureBoard } from "@/lib/payments/events";
import { ATTEMPT_MINUTES, SPIKE, pct, reasonCounts, reasonLabel, type BoardOutcome, type BoardRow } from "@/lib/payments/events-core";
import { payLabel } from "@/lib/account/labels";
import { Badge, dateTime, eur } from "@/components/admin/orders/ui";

export type SP = { d?: string; out?: string; pay?: string; r?: string };
const PERIODS = [{ d: 1, label: "24 ώρες", prev: "το προηγούμενο 24ωρο" }, { d: 7, label: "7 ημέρες", prev: "τις προηγούμενες 7 ημέρες" }, { d: 30, label: "30 ημέρες", prev: "τις προηγούμενες 30 ημέρες" }];
const OUTCOMES: { id: BoardOutcome; label: string }[] = [{ id: "unpaid", label: "Ακόμα απλήρωτες" }, { id: "paid", label: "Πλήρωσαν τελικά" }, { id: "cancelled", label: "Ακυρώθηκαν" }];
const SHOWN = 100;
/** Οι ημέρες του διαστήματος από την παράμετρο `d` της διεύθυνσης (προεπιλογή 7). */
export const PERIOD_DAYS = (d?: string) => (PERIODS.find((p) => String(p.d) === d) ?? PERIODS[1]).d;

const pill = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:text-eu-navy hover:border-eu-navy"}`;
const tries = (r: BoardRow) => (r.missed === r.attempts ? `${r.attempts === 1 ? "1 προσπάθεια" : `${r.attempts} προσπάθειες`}, καμία δεν πέρασε` : `${r.missed} από ${r.attempts} προσπάθειες δεν πέρασαν`);

/** Η παρουσίαση της σελίδας (χωριστά από τη φόρτωση — δοκιμάζεται και με ψεύτικα δεδομένα). */
export function FailuresView({ b, sp }: { b: Awaited<ReturnType<typeof failureBoard>>; sp: SP }) {
  const period = PERIODS.find((p) => String(p.d) === sp.d) ?? PERIODS[1];
  const out = OUTCOMES.find((o) => o.id === sp.out)?.id ?? "", pay = sp.pay ?? "", r = sp.r ?? "";
  const href = (o: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ d: period.d === 7 ? "" : String(period.d), out, pay, r, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders/pliromes${u.size ? `?${u}` : ""}`;
  };

  const recovered = b.rows.filter((x) => x.outcome === "paid").length;
  const unpaid = b.rows.filter((x) => x.outcome === "unpaid");
  const rate = pct(b.rows.length, b.tried), prevRate = pct(b.prev.missed, b.prev.tried), diff = rate - prevRate;
  const methods = [...new Set(b.rows.map((x) => x.payMethod).filter((m): m is string => !!m))];
  const scoped = b.rows.filter((x) => (!out || x.outcome === out) && (!pay || x.payMethod === pay));
  const reasons = reasonCounts(scoped), max = reasons[0]?.count ?? 0;
  const list = scoped.filter((x) => !r || x.reason.key === r);

  return (
    <div className="@container grid gap-3 min-w-0 max-w-5xl">
      <div data-help="payfail.header" className="grid gap-1">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><CreditCard className="size-5 text-eu-blue" aria-hidden /> Αποτυχημένες πληρωμές</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[75ch]">
          Παραγγελίες όπου ο πελάτης δοκίμασε να πληρώσει online και τουλάχιστον μία προσπάθεια δεν πέρασε: τι έφταιξε και ποιον αξίζει να πάρεις τηλέφωνο.
          {b.since && <> Η καταγραφή ξεκίνησε στις {dateTime(b.since)}· παλιότερες παραγγελίες δεν φαίνονται εδώ.</>}
        </p>
      </div>

      {!b.ready && (
        <p role="status" className="m-0 rounded-xl border border-eu-amber/40 bg-eu-amber/10 p-3 text-eu-ink-2 text-[length:var(--fs-13)] inline-flex gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /> Η καταγραφή δεν έχει ενεργοποιηθεί ακόμα: λείπει ο πίνακας του ιστορικού πληρωμής στη βάση (prisma/sql/2026-11-24-payment-events.sql). Μέχρι τότε η σελίδα μένει άδεια.
        </p>
      )}

      <nav data-help="payfail.period" aria-label="Διάστημα" className="flex flex-wrap gap-1">
        {PERIODS.map((p) => <Link key={p.d} href={href({ d: p.d === 7 ? "" : String(p.d), r: "" })} aria-current={p.d === period.d ? "page" : undefined} className={pill(p.d === period.d)}>{p.label}</Link>)}
      </nav>

      <dl data-help="payfail.kpi" className="m-0 grid grid-cols-1 @md:grid-cols-3 gap-1.5">
        <div className="grid gap-0.5 rounded-xl border border-eu-line bg-white px-3 py-2">
          <dt className="text-eu-muted text-[length:var(--fs-12)]">Είχαν πρόβλημα στην πληρωμή</dt>
          <dd className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-20)] tabular-nums leading-tight">{b.rows.length} <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">από {b.tried} που δοκίμασαν</span></dd>
          <dd className={`m-0 text-[length:var(--fs-12)] inline-flex items-center gap-1 ${!b.tried || !b.prev.tried ? "text-eu-muted" : diff >= 3 ? "text-eu-red" : diff <= -3 ? "text-eu-green" : "text-eu-muted"}`}>
            {!b.tried ? "Καμία online πληρωμή σε αυτό το διάστημα" : !b.prev.tried ? `${rate}% · δεν υπάρχει προηγούμενο διάστημα για σύγκριση` : <>{diff >= 3 ? <TrendingUp className="size-3.5" aria-hidden /> : diff <= -3 ? <TrendingDown className="size-3.5" aria-hidden /> : null}{rate}%, {diff >= 3 ? "χειρότερα από" : diff <= -3 ? "καλύτερα από" : "όπως"} {period.prev} ({prevRate}%)</>}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-xl border border-eu-line bg-white px-3 py-2">
          <dt className="text-eu-muted text-[length:var(--fs-12)]">Πλήρωσαν τελικά</dt>
          <dd className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-20)] tabular-nums leading-tight">{recovered} <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">από {b.rows.length}</span></dd>
          <dd className={`m-0 text-[length:var(--fs-12)] inline-flex items-center gap-1 ${recovered ? "text-eu-green" : "text-eu-muted"}`}>{recovered ? <><CheckCircle2 className="size-3.5" aria-hidden /> Δεν χρειάζονται ενέργεια</> : "Κανείς ακόμα"}</dd>
        </div>
        <Link href={href({ out: out === "unpaid" ? "" : "unpaid", r: "" })} aria-current={out === "unpaid" ? "true" : undefined} className={`grid gap-0.5 rounded-xl border bg-white px-3 py-2 hover:border-eu-navy transition-colors ${out === "unpaid" ? "border-eu-navy ring-1 ring-eu-navy" : "border-eu-line"}`}>
          <dt className="text-eu-muted text-[length:var(--fs-12)]">Ακόμα απλήρωτες</dt>
          <dd className={`m-0 font-heading font-extrabold text-[length:var(--fs-20)] tabular-nums leading-tight ${unpaid.length ? "text-eu-red" : "text-eu-ink"}`}>{unpaid.length}</dd>
          <dd className={`m-0 text-[length:var(--fs-12)] inline-flex items-center gap-1 ${unpaid.length ? "text-eu-ink-2" : "text-eu-green"}`}>{unpaid.length ? <><Phone className="size-3.5 text-eu-amber" aria-hidden /> {eur(unpaid.reduce((a, x) => a + x.total, 0))} · αξίζει ένα τηλέφωνο</> : <><CheckCircle2 className="size-3.5" aria-hidden /> Καμία εκκρεμότητα</>}</dd>
        </Link>
      </dl>

      {b.spike && (
        <p data-help="payfail.spike" role="alert" className="m-0 rounded-xl border border-eu-red/40 bg-eu-red/10 p-3 grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 text-[length:var(--fs-13)]">
          <AlertTriangle className="size-4 mt-0.5 text-eu-red" aria-hidden />
          <span><span className="font-bold text-eu-red">{b.spike.count} απορρίψεις «{b.spike.reason.label}» την τελευταία ώρα</span><span className="block text-eu-ink-2 text-[length:var(--fs-12)]">Τόσες ίδιες μαζί δείχνουν πρόβλημα στη Viva ή σε τράπεζα, όχι στους πελάτες. Δες την κατάσταση της Viva και δοκίμασε μια πληρωμή.</span></span>
        </p>
      )}

      {reasons.length > 0 && (
        <section data-help="payfail.reasons" aria-label="Γιατί απέτυχαν" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
          <div>
            <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Γιατί απέτυχαν</h3>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Η τελευταία αιτία κάθε παραγγελίας. Πάτα μια αιτία για να δεις μόνο αυτές.</p>
          </div>
          <ul className="m-0 p-0 list-none grid gap-1">
            {reasons.map((x) => (
              <li key={x.key}>
                <Link href={href({ r: r === x.key ? "" : x.key })} aria-current={r === x.key ? "true" : undefined} title={`${x.label}: ${x.count} ${x.count === 1 ? "παραγγελία" : "παραγγελίες"} (${pct(x.count, scoped.length)}%)`} className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 min-h-11 hover:bg-eu-surface ${r && r !== x.key ? "opacity-45" : ""} ${r === x.key ? "bg-eu-surface" : ""}`}>
                  <span className={`text-[length:var(--fs-13)] ${r === x.key ? "font-bold text-eu-navy" : "text-eu-ink-2"}`}>{x.label}</span>
                  <span className="text-eu-ink font-bold text-[length:var(--fs-13)] tabular-nums">{x.count}</span>
                  <span className="col-span-2 h-2.5 rounded-r bg-eu-blue group-hover:bg-eu-navy" style={{ width: `${Math.max(2, Math.round((x.count / max) * 100))}%` }} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.rows.length > 0 && (
        <nav data-help="payfail.filters" aria-label="Φίλτρα" className="flex flex-wrap gap-1">
          <Link href={href({ out: "", r: "" })} aria-current={!out ? "page" : undefined} className={pill(!out)}>Όλες<span className={`tabular-nums text-[length:var(--fs-12)] ${!out ? "text-white/75" : "text-eu-muted"}`}>{b.rows.length}</span></Link>
          {OUTCOMES.map((o) => { const n = b.rows.filter((x) => x.outcome === o.id).length; return <Link key={o.id} href={href({ out: o.id, r: "" })} aria-current={out === o.id ? "page" : undefined} className={pill(out === o.id)}>{o.label}<span className={`tabular-nums text-[length:var(--fs-12)] ${out === o.id ? "text-white/75" : "text-eu-muted"}`}>{n}</span></Link>; })}
          {methods.length > 1 && methods.map((m) => <Link key={m} href={href({ pay: pay === m ? "" : m, r: "" })} aria-current={pay === m ? "true" : undefined} className={pill(pay === m)}>{payLabel(m)}</Link>)}
        </nav>
      )}

      <section data-help="payfail.list" aria-label="Παραγγελίες" className="rounded-xl border border-eu-line bg-white">
        <h3 className="m-0 px-3 py-2 font-bold text-eu-ink text-[length:var(--fs-14)]">{r ? `${reasonLabel(r)} · ${list.length}` : `Παραγγελίες · ${list.length}`}</h3>
        {list.length === 0 ? (
          <p className="m-0 px-3 pb-3 text-eu-ink-3 text-[length:var(--fs-13)] inline-flex items-center gap-1.5">
            {b.rows.length === 0 ? <><CheckCircle2 className="size-4 text-eu-green" aria-hidden /> Καμία αποτυχημένη πληρωμή σε αυτό το διάστημα.</> : <>Καμία παραγγελία με αυτά τα φίλτρα. <Link href={href({ out: "", pay: "", r: "" })} className="font-bold text-eu-blue hover:underline">Καθάρισμα φίλτρων</Link></>}
          </p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {list.slice(0, SHOWN).map((x) => (
              <li key={x.id} className="border-t border-eu-line">
                <Link href={`/admin/orders/${encodeURIComponent(x.number)}#pliromi`} className="grid grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[8.5rem_11.5rem_minmax(0,1fr)_6.5rem_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 min-h-11 hover:bg-eu-surface text-[length:var(--fs-13)]">
                  <time dateTime={x.lastAt.toISOString()} className="order-3 @2xl:order-none text-eu-muted tabular-nums">{dateTime(x.lastAt)}</time>
                  <span className="order-1 @2xl:order-none font-mono font-bold text-eu-blue">{x.number}</span>
                  <span className="order-5 @2xl:order-none col-span-2 @2xl:col-span-1 min-w-0">
                    <span className="text-eu-ink">{x.reason.label}</span> <span className="text-eu-muted">· {tries(x)}</span>
                    {x.outcome === "unpaid" && <span className="block text-eu-ink-3 text-[length:var(--fs-12)]">{x.reason.advice}</span>}
                  </span>
                  <span className="order-4 @2xl:order-none text-right text-eu-ink tabular-nums">{eur(x.total)}</span>
                  <span className="order-2 @2xl:order-none justify-self-end">{x.outcome === "paid" ? <Badge tone="good">Πλήρωσε: {payLabel(x.payMethod)}</Badge> : x.outcome === "cancelled" ? <Badge tone="neutral">Ακυρώθηκε</Badge> : <Badge tone="warn">Απλήρωτη</Badge>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.length > SHOWN && <p className="m-0 px-3 py-2 border-t border-eu-line text-eu-muted text-[length:var(--fs-12)]">Φαίνονται οι {SHOWN} πιο πρόσφατες από {list.length}. Στένεψε το διάστημα ή διάλεξε αιτία.</p>}
      </section>

      <p className="m-0 text-eu-muted text-[length:var(--fs-12)] max-w-[80ch]">
        «Έφυγε χωρίς να πληρώσει»: άνοιξε τη σελίδα πληρωμής και σε {ATTEMPT_MINUTES} λεπτά δεν ήρθε κανένα αποτέλεσμα, άρα δεν έγινε χρέωση. Η ειδοποίηση για πρόβλημα στον πάροχο βγαίνει όταν μαζευτούν {SPIKE.count} ίδιες απορρίψεις μέσα σε {SPIKE.minutes} λεπτά.
      </p>
    </div>
  );
}
