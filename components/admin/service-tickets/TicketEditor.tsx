"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail } from "lucide-react";
import { saveTicket } from "@/app/admin/(shell)/service/actions";
import { emailFor, isStatus, MODE_LABEL, NEXT_STATUS, SLOTS, STATUS_LABEL, type TicketStatus } from "@/lib/service/core";

interface Ticket { id: string; status: string; scheduledAt: string | null; slot: string | null; technician: string | null; storeId: string | null; mode: string | null; erpJob: string | null; cost: number | null; inWarranty: boolean; hasEmail: boolean }

const EMAIL_TEXT = { "appointment-confirmed": "«Το ραντεβού σου» με ημέρα, ζώνη, τεχνικό και διεύθυνση", "service-done": "«Το service ολοκληρώθηκε» με τη σημείωση ως εργασίες και το κόστος", "service-cancelled": "«Το αίτημα ακυρώθηκε» με τη σημείωση ως λόγο" } as const;

/** Τοπική ημέρα/ώρα (Ελλάδα, από τον browser) από ISO. */
const local = (iso: string | null) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
};

/**
 * Φόρμα ενημέρωσης αιτήματος service: μόνο οι επιτρεπτές επόμενες καταστάσεις, ραντεβού (ημέρα + ζώνη ή ώρα),
 * τεχνικός, κατάστημα, τρόπος, κόστος/εγγύηση, SoftOne job, σημείωση (εσωτερική ή ορατή) και email στον πελάτη —
 * δείχνει πριν την αποθήκευση ποιο email θα φύγει.
 */
export function TicketEditor({ ticket: t, request, stores, technicians }: { ticket: Ticket; request: { date: string | null; slot: string | null } | null; stores: { id: string; label: string }[]; technicians: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const init = local(t.scheduledAt);
  const [f, setF] = useState({
    status: t.status, date: init.date, time: t.slot ? "" : init.time, slot: t.slot ?? "", technician: t.technician ?? "", storeId: t.storeId ?? "", mode: t.mode ?? "",
    erpJob: t.erpJob ?? "", cost: t.cost == null ? "" : String(t.cost), inWarranty: t.inWarranty, note: "", publicNote: false, notify: t.hasEmail,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };

  const scheduledAt = useMemo(() => {
    if (!f.date) return null;
    // ζώνη χωρίς ώρα → ώρα έναρξης της ζώνης (για ταξινόμηση και υπενθύμιση)
    const h = /(\d{1,2})\s*[–-]/.exec(f.slot)?.[1];
    const d = new Date(`${f.date}T${f.time || `${(h ?? "9").padStart(2, "0")}:00`}`);
    return isNaN(+d) ? null : d.toISOString();
  }, [f.date, f.time, f.slot]);

  const options: string[] = isStatus(t.status) ? [t.status, ...NEXT_STATUS[t.status]] : [t.status];
  const mail = emailFor({ status: t.status, scheduledAt: t.scheduledAt, slot: t.slot, technician: t.technician }, { status: f.status === "new" && scheduledAt ? "scheduled" : f.status, scheduledAt, slot: f.slot || null, technician: f.technician.trim() || null });
  const needsNote = (f.status === "cancelled" && t.status !== "cancelled") || (f.status === "done" && t.status !== "done");

  const field = "rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] w-full";
  const label = "grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2 min-w-0";
  const hint = "font-normal text-eu-muted text-[length:var(--fs-13)]";

  const submit = () =>
    start(async () => {
      const r = await saveTicket(t.id, {
        status: f.status, scheduledAt, slot: f.slot || null, technician: f.technician, storeId: f.storeId || null, mode: f.mode || null, erpJob: f.erpJob,
        cost: f.cost.trim() ? Number(f.cost.replace(",", ".")) : null, inWarranty: f.inWarranty, note: f.note, publicNote: f.publicNote, notify: f.notify,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.emailed ? "Αποθηκεύτηκε — στάλθηκε email στον πελάτη." : mail && f.notify ? "Αποθηκεύτηκε — το email δεν στάλθηκε (δες Ρυθμίσεις → Email)." : "Αποθηκεύτηκε." });
      setF((x) => ({ ...x, note: "", publicNote: false }));
      router.refresh();
    });

  return (
    <section data-help="editor" className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
      <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Ενημέρωση</h3>
      <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-3">
        <label className={label}>
          Κατάσταση
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className={field}>
            {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s as TicketStatus] ?? s}{s === t.status ? " (τώρα)" : ""}</option>)}
          </select>
          <span className={hint}>Μόνο οι επόμενες δυνατές καταστάσεις.</span>
        </label>
        <label className={label}>
          Ημέρα ραντεβού
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={field} />
          <span className={hint}>Με ημέρα, το νέο αίτημα γίνεται «Με ραντεβού».</span>
        </label>
        <label className={label}>
          Ζώνη ώρας
          <select value={SLOTS.includes(f.slot as (typeof SLOTS)[number]) || !f.slot ? f.slot : "__custom"} onChange={(e) => set("slot", e.target.value === "__custom" ? f.slot || " " : e.target.value)} className={field}>
            <option value="">Συγκεκριμένη ώρα →</option>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            {f.slot && !SLOTS.includes(f.slot as (typeof SLOTS)[number]) && <option value="__custom">{f.slot}</option>}
          </select>
        </label>
        {!f.slot && (
          <label className={label}>
            Ώρα
            <input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={field} />
          </label>
        )}
        <label className={label}>
          Τεχνικός
          <input list="svc-techs" value={f.technician} onChange={(e) => set("technician", e.target.value)} placeholder="π.χ. Κ. Δημητρίου" className={field} />
          <datalist id="svc-techs">{technicians.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className={label}>
          Κατάστημα
          <select value={f.storeId} onChange={(e) => set("storeId", e.target.value)} className={field}>
            <option value="">—</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={label}>
          Τρόπος
          <select value={f.mode} onChange={(e) => set("mode", e.target.value)} className={field}>
            <option value="">—</option>
            {Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className={label}>
          Κόστος (€, με ΦΠΑ)
          <input inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="κενό = χωρίς χρέωση" className={field} />
        </label>
        <label className={label}>
          SoftOne job
          <input value={f.erpJob} onChange={(e) => set("erpJob", e.target.value)} className={`${field} font-mono`} />
          <span className={hint}>Αριθμός εργασίας service στο SoftOne, αν ανοίχτηκε.</span>
        </label>
      </div>
      {request?.date && (
        <button type="button" onClick={() => setF((x) => ({ ...x, date: request.date!, slot: request.slot ?? x.slot, time: request.slot ? "" : x.time }))} className="w-fit rounded-full border-2 border-eu-red/40 text-eu-red font-bold px-4 min-h-11 text-[length:var(--fs-14)]">
          Χρήση της ημέρας που ζήτησε ο πελάτης
        </button>
      )}
      <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-semibold min-h-11 w-fit">
        <input type="checkbox" checked={f.inWarranty} onChange={(e) => set("inWarranty", e.target.checked)} className="size-5" /> Σε εγγύηση (χωρίς χρέωση για τον πελάτη)
      </label>
      <label className={label}>
        Σημείωση{needsNote ? f.status === "done" ? " — τι έγινε (μπαίνει στο email)" : " — λόγος (μπαίνει στο email)" : ""}
        <textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} className={`${field} py-2`} placeholder={f.status === "done" ? "π.χ. Αντικατάσταση αντλίας, έλεγχος στεγανότητας" : "Τι έγινε, τι συμφωνήθηκε με τον πελάτη"} />
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-semibold min-h-11">
          <input type="checkbox" checked={f.publicNote} onChange={(e) => set("publicNote", e.target.checked)} className="size-5" /> Η σημείωση φαίνεται στον πελάτη
        </label>
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-semibold min-h-11">
          <input type="checkbox" checked={f.notify} disabled={!t.hasEmail} onChange={(e) => set("notify", e.target.checked)} className="size-5" /> Email στον πελάτη
        </label>
      </div>
      <p className={`m-0 flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${mail && f.notify ? "bg-eu-chip text-eu-blue" : "bg-eu-surface text-eu-muted"}`}>
        <Mail className="size-4 mt-0.5 shrink-0" aria-hidden />
        {!t.hasEmail ? "Ο πελάτης δεν έχει email — ενημέρωσέ τον τηλεφωνικά." : mail ? (f.notify ? `Θα σταλεί: ${EMAIL_TEXT[mail]}.` : `Χωρίς email (θα ταίριαζε: ${EMAIL_TEXT[mail]}).`) : "Αυτή η αλλαγή δεν στέλνει email (στέλνεται σε νέο ραντεβού, ολοκλήρωση ή ακύρωση)."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={submit} className="rounded-full bg-eu-navy text-white font-extrabold px-6 min-h-11 inline-flex items-center gap-2 text-[length:var(--fs-15)] disabled:opacity-60">
          <Check className="size-4" aria-hidden /> {pending ? "Αποθήκευση…" : "Αποθήκευση"}
        </button>
        {msg && <span role="status" className={`font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
