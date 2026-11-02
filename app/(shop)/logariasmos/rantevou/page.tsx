import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Wrench, Truck, Store as StoreIcon, MapPin, User, ShieldCheck, MessageSquareWarning, Plus } from "lucide-react";
import { accountAppointments, requireCustomer, type AccountTicket } from "@/lib/account/data";
import { customerDevices } from "@/lib/warranty/server";
import { CUSTOMER_STEPS } from "@/lib/service/core";
import { CancelAppointment } from "@/components/account/CancelAppointment";
import { ServiceRequest } from "@/components/account/ServiceRequest";
import { TicketActions } from "@/components/account/TicketActions";

export const metadata: Metadata = { title: "Ραντεβού & service" };

const KIND = { installation: Wrench, service: Wrench, delivery: Truck, pickup: StoreIcon };
const TONE = { scheduled: "bg-eu-amber/15 text-eu-ink-2", confirmed: "bg-eu-green/10 text-eu-green", done: "bg-eu-surface text-eu-muted", cancelled: "bg-eu-red/10 text-eu-red" };
const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
const dt = (iso: string) => new Date(iso).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });

/**
 * /logariasmos/rantevou — τα αιτήματα service του πελάτη (ServiceTicket): βήματα, πορεία, συνημμένα, αίτημα αλλαγής
 * ώρας, μήνυμα με φωτογραφίες, ακύρωση πριν ξεκινήσει. ?neo=1 ανοίγει νέο αίτημα (με ή χωρίς συσκευή).
 */
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ neo?: string }> }) {
  const [{ neo }, me] = await Promise.all([searchParams, requireCustomer("/logariasmos/rantevou")]);
  const [all, devices] = await Promise.all([accountAppointments(me.id), neo ? customerDevices(me.id) : Promise.resolve([])]);
  const upcoming = all.filter((a) => a.open);
  const past = all.filter((a) => !a.open);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Ραντεβού & service</h1>
          <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Επισκευές, εγκαταστάσεις και παραδόσεις με ραντεβού — με την πορεία κάθε αιτήματος.</p>
        </div>
        {!neo && (
          <Link href="/logariasmos/rantevou?neo=1" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 inline-flex items-center gap-2 hover:bg-eu-blue">
            <Plus className="size-4" aria-hidden /> Νέο αίτημα service
          </Link>
        )}
      </div>
      {neo && (
        <div className="grid gap-2">
          <ServiceRequest devices={devices.filter((d) => d.deviceId).map((d) => ({ id: d.deviceId, title: `${d.brand} ${d.title}`.trim(), inWarranty: d.daysLeft > 0 }))} />
          <Link href="/logariasmos/rantevou" className="text-eu-muted font-bold text-[length:var(--fs-14)] min-h-11 inline-flex items-center w-fit">Κλείσιμο</Link>
        </div>
      )}
      <section className="grid grid-cols-1 gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Ανοιχτά αιτήματα</h2>
        {upcoming.length ? (
          <ul className="m-0 p-0 list-none grid gap-3">
            {upcoming.map((a) => <Card key={a.id} a={a} />)}
          </ul>
        ) : (
          <p className="m-0 text-eu-muted">Δεν έχεις ανοιχτά αιτήματα. Για βλάβη σε συσκευή σου, πάτα «Service» στην κάρτα της στις <Link href="/logariasmos/eggyiseis" className="text-eu-blue underline">Εγγυήσεις</Link>.</p>
        )}
      </section>
      {past.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Ιστορικό</h2>
          <ul className="m-0 p-0 list-none grid gap-3">
            {past.map((a) => <Card key={a.id} a={a} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Card({ a }: { a: AccountTicket }) {
  const K = KIND[a.kind];
  const days = a.status === "confirmed" ? daysTo(a.date) : null;
  return (
    <li className="bg-white rounded-2xl border border-eu-line p-5 grid gap-4 min-w-0">
      <div className="grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_auto] gap-4">
        <div className="min-w-0 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-surface text-eu-ink font-bold text-[length:var(--fs-13-5)] px-2.5 py-1">
              <K className="size-3.5 text-eu-blue" aria-hidden /> {a.title}
            </span>
            <span className={`rounded-full font-bold text-[length:var(--fs-13-5)] px-2.5 py-1 ${TONE[a.status]}`}>{a.statusLabel}</span>
            {a.inWarranty && a.kind === "service" && <span className="inline-flex items-center gap-1 rounded-full bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-13)] px-2 py-1"><ShieldCheck className="size-3.5" aria-hidden /> Εγγύηση</span>}
            <span className="text-eu-muted text-[length:var(--fs-13)] font-mono">#{a.number}</span>
          </div>
          {a.productTitle && <div className="font-bold text-eu-ink text-[length:var(--fs-17)] break-words">{a.productTitle}</div>}
          <dl className="m-0 grid grid-cols-1 @sm:grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--fs-14)] text-eu-ink-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CalendarClock className="size-4 text-eu-blue shrink-0" aria-hidden />
              <dd className="m-0">
                {a.status === "scheduled" ? `Αίτημα στις ${new Date(a.date).toLocaleDateString("el-GR", { day: "numeric", month: "long" })}` : new Date(a.date).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "long", timeZone: "Europe/Athens" })}{a.slot ? ` · ${a.slot}` : ""}
              </dd>
              {days != null && days >= 0 && a.open && <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold ${days <= 1 ? "bg-eu-yellow text-eu-navy" : "bg-eu-chip text-eu-blue"}`}>{days <= 0 ? "σήμερα" : days === 1 ? "αύριο" : `σε ${days} ημέρες`}</span>}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="size-4 text-eu-blue shrink-0" aria-hidden />
              <dd className="m-0 truncate">{a.store}{a.modeLabel && a.store !== a.modeLabel ? ` · ${a.modeLabel}` : ""}</dd>
            </div>
            {a.technician && (
              <div className="flex items-center gap-1.5">
                <User className="size-4 text-eu-blue shrink-0" aria-hidden />
                <dd className="m-0">Τεχνικός: {a.technician}</dd>
              </div>
            )}
          </dl>
        </div>
        {a.canCancel && <div className="self-start"><CancelAppointment id={a.id} /></div>}
      </div>

      {a.step >= 0 && (
        <ol aria-label="Πορεία αιτήματος" className="m-0 p-0 list-none grid grid-cols-4 gap-1">
          {CUSTOMER_STEPS.map((s, i) => (
            <li key={s} aria-current={i === a.step ? "step" : undefined} className="grid gap-1 min-w-0">
              <span className={`h-1.5 rounded-full ${i <= a.step ? "bg-eu-green" : "bg-eu-line"}`} />
              <span className={`text-[length:var(--fs-13)] leading-tight break-words ${i === a.step ? "font-extrabold text-eu-ink" : "text-eu-muted"}`}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {a.request && (
        <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">
          <MessageSquareWarning className="size-4 mt-0.5 shrink-0 text-eu-ink-2" aria-hidden />
          Ζήτησες αλλαγή ώρας{a.request.date ? ` για ${new Date(a.request.date).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })}` : ""}{a.request.slot ? `, ${a.request.slot}` : ""} — περιμένουμε επιβεβαίωση από το κατάστημα.
        </p>
      )}

      {a.notes && <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)] whitespace-pre-wrap break-words">{a.notes}</p>}

      {a.attachments.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Συνημμένα">
          {a.attachments.map((f, i) => (
            <li key={i}>
              <a href={f.url} target="_blank" rel="noreferrer" className="block size-16 rounded-lg overflow-hidden border border-eu-line bg-eu-surface">
                {f.kind === "video" && !f.thumb ? <span className="size-full grid place-items-center text-[length:var(--fs-13)] font-bold text-eu-muted">Βίντεο</span> : <img src={f.thumb ?? f.url} alt={f.kind === "video" ? "Βίντεο" : "Φωτογραφία"} className="size-full object-cover" />}
              </a>
            </li>
          ))}
        </ul>
      )}

      {a.history.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-14)] min-h-11 inline-flex items-center">Πορεία ({a.history.length})</summary>
          <ol className="m-0 mt-1 p-0 list-none grid gap-1.5 border-l-2 border-eu-line pl-3">
            {[...a.history].reverse().map((h, i) => (
              <li key={i} className="text-[length:var(--fs-14)] text-eu-ink-2 break-words">
                <span className="text-eu-muted text-[length:var(--fs-13)]">{dt(h.at)} · {h.by === "customer" ? "εσύ" : "Euronics"}</span>
                <span className="block">{h.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {a.open && <TicketActions id={a.id} pendingRequest={!!a.request} />}
    </li>
  );
}
