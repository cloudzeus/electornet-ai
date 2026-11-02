import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, MessageSquareWarning, Phone, ShieldCheck, ShieldX, User } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { KIND_LABEL, MODE_LABEL, openRescheduleRequest, parseAttachments, parseTimeline, STATUS_LABEL, STATUS_TONE, type TicketStatus } from "@/lib/service/core";
import { TicketEditor } from "@/components/admin/service-tickets/TicketEditor";

export const metadata = { title: "Αίτημα service" };
export const dynamic = "force-dynamic";

const dt = (s: string | Date) => new Date(s).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });
const future = (d: Date | null) => !!d && d.getTime() > Date.now();
const day = (d: Date | null) => (d ? d.toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * Καρτέλα αιτήματος service: πελάτης, συσκευή και εγγύηση, περιγραφή και συνημμένα, πλήρης πορεία (και εσωτερικές
 * σημειώσεις), εκκρεμές αίτημα αλλαγής ώρας και η φόρμα ενημέρωσης με email στον πελάτη.
 */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("service.tickets.read");
  const { id } = await params;
  const t = await db.serviceTicket.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, number: true, firstName: true, lastName: true, email: true, mobile: true, phone: true, addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], take: 1, select: { street: true, number: true, floor: true, zip: true, city: true, notes: true } } } },
      device: { select: { id: true, brand: true, title: true, model: true, serial: true, purchasedAt: true, warrantyUntil: true, extendedUntil: true, invoiceNo: true, registeredBy: true } },
    },
  });
  if (!t) notFound();
  const [stores, techs, others] = await Promise.all([
    db.store.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true } }),
    db.serviceTicket.findMany({ where: { technician: { not: null } }, distinct: ["technician"], select: { technician: true }, take: 200 }),
    db.serviceTicket.findMany({ where: { customerId: t.customerId, id: { not: t.id } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, kind: true, status: true, createdAt: true } }),
  ]);
  const tl = parseTimeline(t.timeline);
  const request = openRescheduleRequest(tl);
  const files = parseAttachments(t.attachments);
  const d = t.device;
  const until = d ? new Date(Math.max(d.warrantyUntil?.getTime() ?? 0, d.extendedUntil?.getTime() ?? 0)) : null;
  const covered = future(until);
  const a = t.customer.addresses[0];
  const canWrite = can(user.permissions, "service.tickets.write");
  const box = "rounded-2xl bg-white border border-eu-line p-4 grid gap-2 content-start min-w-0";
  const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]";

  return (
    <>
      <div className="grid gap-2">
        <Link href="/admin/service" className="inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 w-fit"><ArrowLeft className="size-4" aria-hidden /> Ουρά service</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] font-mono">{t.number}</h2>
          <span className={`rounded-full px-3 py-1 font-bold text-[length:var(--fs-14)] ${STATUS_TONE[t.status] ?? ""}`}>{STATUS_LABEL[t.status as TicketStatus] ?? t.status}</span>
          <span className="rounded-full px-3 py-1 font-bold text-[length:var(--fs-14)] bg-eu-surface text-eu-ink-2">{KIND_LABEL[t.kind] ?? t.kind}</span>
          {t.mode && <span className="rounded-full px-3 py-1 font-bold text-[length:var(--fs-14)] bg-eu-surface text-eu-ink-2">{MODE_LABEL[t.mode] ?? t.mode}</span>}
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καταχωρήθηκε {dt(t.createdAt)} · τελευταία αλλαγή {dt(t.updatedAt)}{t.erpJob ? ` · SoftOne ${t.erpJob}` : ""}</p>
      </div>

      {request && (
        <div data-help="request" role="status" className="rounded-2xl bg-eu-red/10 border border-eu-red/30 p-4 flex gap-3 items-start">
          <MessageSquareWarning className="size-5 text-eu-red shrink-0 mt-0.5" aria-hidden />
          <div className="text-[length:var(--fs-15)] text-eu-ink-2">
            <div className="font-bold text-eu-ink">Ο πελάτης ζητά αλλαγή ώρας ({dt(request.at)})</div>
            {request.request?.date && <div>Προτιμά: <b>{new Date(request.request.date).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })}</b>{request.request.slot ? `, ${request.request.slot}` : ""}</div>}
            {request.note && <div>«{request.note}»</div>}
            <div className="text-[length:var(--fs-13)] text-eu-muted mt-1">Όρισε νέο ραντεβού παρακάτω (ή γράψε σημείωση) — με το email ο πελάτης παίρνει την επιβεβαίωση και η ένδειξη φεύγει.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="grid gap-4 min-w-0">
          <section data-help="description" className={box}>
            <h3 className={h3}>Περιγραφή</h3>
            <p className="m-0 whitespace-pre-wrap break-words text-eu-ink-2 text-[length:var(--fs-15)]">{t.description}</p>
            {files.length > 0 && (
              <ul data-help="attachments" className="m-0 p-0 list-none grid grid-cols-3 @xl:grid-cols-5 gap-2">
                {files.map((f, i) => (
                  <li key={i}>
                    <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden bg-eu-surface border border-eu-line" title={f.name ?? "Συνημμένο"}>
                      {f.kind === "video" ? (f.thumb ? <img src={f.thumb} alt="Βίντεο" className="size-full object-cover" /> : <span className="size-full grid place-items-center text-[length:var(--fs-13)] font-bold text-eu-muted">Βίντεο</span>) : <img src={f.thumb ?? f.url} alt="Φωτογραφία πελάτη" className="size-full object-cover" />}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canWrite ? (
            <TicketEditor
              ticket={{ id: t.id, status: t.status, scheduledAt: t.scheduledAt?.toISOString() ?? null, slot: t.slot, technician: t.technician, storeId: t.storeId, mode: t.mode, erpJob: t.erpJob, cost: t.cost == null ? null : Number(t.cost), inWarranty: t.inWarranty, hasEmail: !!t.customer.email }}
              request={request ? { date: request.request?.date ?? null, slot: request.request?.slot ?? null } : null}
              stores={stores.map((s) => ({ id: s.id, label: `${s.city} — ${s.name}` }))}
              technicians={techs.map((x) => x.technician!).filter(Boolean)}
            />
          ) : (
            <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-muted text-[length:var(--fs-14)]">Μόνο ανάγνωση — για αλλαγές χρειάζεται το δικαίωμα «Ανάθεση, ραντεβού, κλείσιμο αιτημάτων».</p>
          )}

          <section data-help="timeline" className={box}>
            <h3 className={h3}>Πορεία</h3>
            <ol className="m-0 p-0 list-none grid gap-2">
              {[...tl].reverse().map((e, i) => (
                <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[length:var(--fs-14)] border-t border-eu-line first:border-t-0 pt-2 first:pt-0">
                  <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{dt(e.at)}</span>
                  <span className="min-w-0 break-words">
                    <b className="text-eu-ink">{e.kind === "reschedule-request" ? "Αίτημα αλλαγής ώρας" : e.kind === "customer-note" ? "Μήνυμα πελάτη" : e.kind === "attachment" ? "Αρχεία πελάτη" : e.kind === "email" ? "Email" : STATUS_LABEL[e.status as TicketStatus] ?? e.status}</b>
                    {e.request?.date ? ` → ${new Date(e.request.date).toLocaleDateString("el-GR")}${e.request.slot ? `, ${e.request.slot}` : ""}` : ""}
                    {e.note ? ` — ${e.note}` : ""}
                    <span className="text-eu-muted"> · {e.by === "customer" ? "πελάτης" : e.by === "system" ? "σύστημα" : e.by ?? "—"}{e.public ? " · ορατή στον πελάτη" : ""}</span>
                  </span>
                </li>
              ))}
              {!tl.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Χωρίς καταγραφές.</li>}
            </ol>
          </section>
        </div>

        <aside className="grid gap-4 min-w-0">
          <section data-help="customer" className={box}>
            <h3 className={h3}>Πελάτης</h3>
            <Link href={`/admin/customers/${t.customer.id}?tab=service`} className="inline-flex items-center gap-1.5 font-bold text-eu-blue text-[length:var(--fs-15)] min-h-11 break-words"><User className="size-4 shrink-0" aria-hidden /> {t.customer.firstName} {t.customer.lastName} · #{t.customer.number}</Link>
            {(t.customer.mobile || t.customer.phone) && <a href={`tel:${t.customer.mobile ?? t.customer.phone}`} className="inline-flex items-center gap-1.5 text-eu-ink-2 text-[length:var(--fs-15)] min-h-11"><Phone className="size-4 text-eu-blue" aria-hidden /> {t.customer.mobile ?? t.customer.phone}</a>}
            {t.customer.email && <a href={`mailto:${t.customer.email}`} className="inline-flex items-center gap-1.5 text-eu-ink-2 text-[length:var(--fs-15)] min-h-11 break-all"><Mail className="size-4 text-eu-blue shrink-0" aria-hidden /> {t.customer.email}</a>}
            {a && <div className="flex items-start gap-1.5 text-eu-ink-2 text-[length:var(--fs-15)]"><MapPin className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /><span>{a.street} {a.number ?? ""}{a.floor ? `, ${a.floor}ος` : ""}, {a.zip} {a.city}{a.notes ? <span className="block text-eu-muted text-[length:var(--fs-13)]">{a.notes}</span> : null}</span></div>}
          </section>

          <section data-help="device" className={box}>
            <h3 className={h3}>Συσκευή & εγγύηση</h3>
            {d ? (
              <>
                <div className="font-bold text-eu-ink text-[length:var(--fs-15)] break-words">{d.brand} {d.title}</div>
                <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-14)]">
                  {d.model && <><dt className="text-eu-muted">Μοντέλο</dt><dd className="m-0 break-words">{d.model}</dd></>}
                  <dt className="text-eu-muted">S/N</dt><dd className="m-0 font-mono break-all">{d.serial ?? "—"}</dd>
                  <dt className="text-eu-muted">Αγορά</dt><dd className="m-0">{day(d.purchasedAt)}{d.invoiceNo ? ` · ${d.invoiceNo}` : ""}</dd>
                  <dt className="text-eu-muted">Εγγύηση έως</dt><dd className="m-0">{day(d.warrantyUntil)}</dd>
                  {d.extendedUntil && <><dt className="text-eu-muted">Επέκταση έως</dt><dd className="m-0">{day(d.extendedUntil)}</dd></>}
                </dl>
                <span className={`inline-flex items-center gap-1.5 w-fit rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${covered ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>
                  {covered ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldX className="size-4" aria-hidden />}{covered ? `Σε εγγύηση έως ${day(until)}` : "Εκτός εγγύησης"}
                </span>
                {covered !== t.inWarranty && <p className="m-0 text-[length:var(--fs-13)] text-eu-red">Το αίτημα είναι σημειωμένο «{t.inWarranty ? "σε εγγύηση" : "εκτός εγγύησης"}» — έλεγξε το πεδίο στη φόρμα.</p>}
                {d.serial && <Link href={`/admin/eggyiseis?q=${encodeURIComponent(d.serial)}`} className="text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 inline-flex items-center">Η συσκευή στις εγγυήσεις</Link>}
              </>
            ) : (
              <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Το αίτημα δεν αφορά καταχωρημένη συσκευή.</p>
            )}
          </section>

          {others.length > 0 && (
            <section className={box}>
              <h3 className={h3}>Άλλα αιτήματα του πελάτη</h3>
              <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">
                {others.map((o) => (
                  <li key={o.id}><Link href={`/admin/service/${o.id}`} className="flex flex-wrap gap-x-2 items-center min-h-11 hover:text-eu-blue"><span className="font-mono font-bold">{o.number}</span><span className="text-eu-muted">{KIND_LABEL[o.kind] ?? o.kind} · {STATUS_LABEL[o.status as TicketStatus] ?? o.status} · {day(o.createdAt)}</span></Link></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
