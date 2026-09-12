import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Wrench, Truck, Store as StoreIcon, MapPin, User } from "lucide-react";
import { getAppointments } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Ραντεβού & service" };

const KIND = { installation: { icon: Wrench, label: "Εγκατάσταση" }, service: { icon: Wrench, label: "Service" }, delivery: { icon: Truck, label: "Παράδοση" }, pickup: { icon: StoreIcon, label: "Παραλαβή" } };
const STATUS = { scheduled: { label: "Προγραμματισμένο", tone: "bg-eu-chip text-eu-blue" }, confirmed: { label: "Επιβεβαιωμένο", tone: "bg-eu-green/10 text-eu-green" }, done: { label: "Ολοκληρώθηκε", tone: "bg-eu-surface text-eu-muted" }, cancelled: { label: "Ακυρώθηκε", tone: "bg-eu-red/10 text-eu-red" } };

/**
 * @dynamic /logariasmos/rantevou — `getAppointments(session)` from the
 * SoftOne Service module (installations, repairs) and the delivery
 * scheduler. Reschedule / cancel call the store calendar API.
 */
export default async function AppointmentsPage() {
  const all = await getAppointments();
  const upcoming = all.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const past = all.filter((a) => a.status === "done" || a.status === "cancelled");
  const Card = ({ a }: { a: (typeof all)[number] }) => {
    const K = KIND[a.kind];
    const S = STATUS[a.status];
    return (
      <li className="bg-white rounded-2xl border border-eu-line p-5 grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_auto] gap-4">
        <div className="min-w-0 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-surface text-eu-ink font-bold text-[length:var(--fs-13-5)] px-2.5 py-1">
              <K.icon className="size-3.5 text-eu-blue" aria-hidden /> {K.label}
            </span>
            <span className={`rounded-full font-bold text-[length:var(--fs-13-5)] px-2.5 py-1 ${S.tone}`}>{S.label}</span>
          </div>
          <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">{a.title}</div>
          {a.productTitle && <div className="text-eu-ink-2 text-[length:var(--fs-15)]">{a.productTitle}</div>}
          <dl className="m-0 grid grid-cols-1 @sm:grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--fs-14)] text-eu-ink-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CalendarClock className="size-4 text-eu-blue shrink-0" aria-hidden />
              <dd className="m-0">
                {new Date(a.date).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "long" })} · {a.slot}
              </dd>
              {(a.status === "scheduled" || a.status === "confirmed") && (() => {
                const days = Math.ceil((new Date(a.date).getTime() - Date.now()) / 86400000);
                return <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold ${days <= 1 ? "bg-eu-yellow text-eu-navy" : "bg-eu-chip text-eu-blue"}`}>{days <= 0 ? "σήμερα" : days === 1 ? "αύριο" : `σε ${days} ημέρες`}</span>;
              })()}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="size-4 text-eu-blue shrink-0" aria-hidden />
              <dd className="m-0 truncate">{a.store}</dd>
            </div>
            {a.technician && (
              <div className="flex items-center gap-1.5">
                <User className="size-4 text-eu-blue shrink-0" aria-hidden />
                <dd className="m-0">Τεχνικός: {a.technician}</dd>
              </div>
            )}
            {a.orderNumber && (
              <div>
                <dd className="m-0">
                  Παραγγελία{" "}
                  <Link href={`/logariasmos/paraggelies/${a.orderNumber}`} className="text-eu-blue underline">
                    {a.orderNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
          {a.notes && <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">{a.notes}</p>}
        </div>
        {(a.status === "scheduled" || a.status === "confirmed") && (
          <div className="flex @md:flex-col gap-2 self-start">
            <button type="button" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface">
              Αλλαγή ώρας
            </button>
            <button type="button" className="rounded-full border-2 border-eu-line text-eu-muted font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:border-eu-red hover:text-eu-red">
              Ακύρωση
            </button>
          </div>
        )}
      </li>
    );
  };
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Ραντεβού & service</h1>
          <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Εγκαταστάσεις, επισκευές και παραδόσεις με ραντεβού από το κατάστημα της περιοχής σου.</p>
        </div>
        <Link href="/ypiresies/syntirisi-episkeyi" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 inline-flex items-center hover:bg-eu-blue">
          Νέο ραντεβού service
        </Link>
      </div>
      <section className="grid grid-cols-1 gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Επερχόμενα</h2>
        {upcoming.length ? (
          <ul className="m-0 p-0 list-none grid gap-3">
            {upcoming.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-eu-muted">Δεν έχεις προγραμματισμένα ραντεβού.</p>
        )}
      </section>
      {past.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Ιστορικό</h2>
          <ul className="m-0 p-0 list-none grid gap-3">
            {past.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
