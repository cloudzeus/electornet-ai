"use client";
import { useState, useTransition } from "react";
import { Check, Mail, PenLine, Sparkles } from "lucide-react";
import { fillMessage } from "@/lib/orders/erp-stages-core";

export interface StageRow { id: string; code: string; name: string; category: string | null; categoryLabel: string | null; notify: boolean; title: string; message: string; seen30: number; sent30: number }
type Save = (id: string, input: { notify: boolean; title: string; message: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const SAMPLE = { "όνομα": "Μαρία", "παραγγελία": "EUR-20261106-0042", "παραστατικό": "ΑΛΠ-12345", "ημερομηνία": "06/11/2026" };

/** Πρόταση κειμένου από το όνομα του τύπου — μόνο αφετηρία, ο διαχειριστής τη διορθώνει. */
function suggest(name: string): { title: string; message: string } {
  const n = name.toLowerCase();
  const m = (title: string, body: string) => ({ title, message: `Γεια σου {όνομα},\n${body}` });
  if (/ακυρ/.test(n)) return m("Η παραγγελία σου ακυρώθηκε", "η παραγγελία {παραγγελία} ακυρώθηκε. Αν πλήρωσες ήδη, τα χρήματα επιστρέφονται με τον ίδιο τρόπο πληρωμής.");
  if (/απλήρωτ|εκκρεμ/.test(n)) return m("Η πληρωμή σου εκκρεμεί", "δεν έχουμε λάβει ακόμη την πληρωμή για την παραγγελία {παραγγελία}. Ολοκλήρωσέ την για να μη χαθεί η κράτηση των προϊόντων.");
  if (/πιστωτ|επιστροφ/.test(n)) return m("Η επιστροφή σου ολοκληρώθηκε", "εκδόθηκε το πιστωτικό {παραστατικό} για την παραγγελία {παραγγελία}.");
  if (/πληρωμ/.test(n)) return m("Λάβαμε την πληρωμή σου", "η πληρωμή για την παραγγελία {παραγγελία} επιβεβαιώθηκε. Ξεκινάμε την προετοιμασία της.");
  if (/pkp|αποθηκ/.test(n)) return m("Η παραγγελία σου ετοιμάζεται", "η αποθήκη μας ξεκίνησε τη συλλογή των προϊόντων της παραγγελίας {παραγγελία}.");
  if (/δελτ/.test(n) && /αποστ/.test(n)) return m("Η παραγγελία σου στάλθηκε", "η παραγγελία {παραγγελία} έφυγε από την αποθήκη μας στις {ημερομηνία}.");
  if (/απόδ|αποδ|τιμολ/.test(n)) return m("Εκδόθηκε το παραστατικό σου", "εκδόθηκε το παραστατικό {παραστατικό} για την παραγγελία {παραγγελία}.");
  return m("Η παραγγελία σου επιβεβαιώθηκε", "η παραγγελία {παραγγελία} επιβεβαιώθηκε και περνά στην επεξεργασία.");
}

const field = "rounded-lg border border-eu-line px-3 min-h-11 md:min-h-10 text-[length:var(--fs-14)] bg-white w-full outline-none focus:border-eu-blue";

function Row({ r, save }: { r: StageRow; save: Save }) {
  const [saved, setSaved] = useState({ notify: r.notify, title: r.title, message: r.message });
  const [f, setF] = useState(saved);
  const [open, setOpen] = useState(r.notify);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = f.notify !== saved.notify || f.title !== saved.title || f.message !== saved.message;
  const persist = (next: typeof f) => start(async () => {
    const res = await save(r.id, next);
    if (res.ok) { setSaved(next); setMsg({ ok: true, text: "Αποθηκεύτηκε" }); } else setMsg({ ok: false, text: res.error });
  });
  const toggle = (on: boolean) => {
    const empty = on && !f.message.trim();
    const next = empty ? { ...f, ...suggest(r.name), notify: true } : { ...f, notify: on };
    setF(next); setMsg(null);
    if (on) setOpen(true);
    // χωρίς κείμενο: πρώτα η πρόταση, την αποθηκεύει ο διαχειριστής αφού τη διαβάσει
    if (!empty) persist(next);
  };
  const preview = { title: fillMessage(f.title.trim() || "Νέα ενημέρωση για την παραγγελία σου", SAMPLE), body: fillMessage(f.message, SAMPLE) };
  const id = `stage-${r.id}`;

  return (
    <li className={`rounded-2xl border bg-white p-3 @lg:p-4 grid gap-3 min-w-0 ${f.notify ? "border-eu-blue/40" : "border-eu-line"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 basis-full @xl:basis-0 flex-1">
          <div className="font-bold text-eu-ink text-[length:var(--fs-15)] break-words">{r.name}</div>
          <div className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">Κωδ. {r.code}{r.categoryLabel ? ` · ${r.categoryLabel}` : ""} · 30 ημέρες: {r.seen30} παραστατικά, {r.sent30} email</div>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink text-[length:var(--fs-13)] hover:border-eu-navy"><PenLine className="size-4" aria-hidden /> Κείμενο</button>
        <label data-help="orders.stages.toggle" className="inline-flex items-center gap-2 min-h-11 cursor-pointer select-none font-bold text-[length:var(--fs-14)]">
          <input type="checkbox" role="switch" checked={f.notify} disabled={pending} onChange={(e) => toggle(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="relative w-11 h-6 rounded-full bg-eu-line transition-colors peer-checked:bg-eu-blue peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          <span className={f.notify ? "text-eu-blue" : "text-eu-ink-3"}>{f.notify ? "Ενημερώνει" : "Χωρίς email"}</span>
        </label>
      </div>

      {open && (
        <div id={id} data-help="orders.stages.text" className="grid gap-3 @3xl:grid-cols-2 min-w-0">
          <div className="grid gap-2 min-w-0 content-start">
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Τίτλος (και θέμα του email)
              <input value={f.title} maxLength={140} onChange={(e) => { setF({ ...f, title: e.target.value }); setMsg(null); }} placeholder="π.χ. Η παραγγελία σου ετοιμάζεται" className={field} />
            </label>
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Κείμενο
              <textarea value={f.message} rows={5} maxLength={4000} onChange={(e) => { setF({ ...f, message: e.target.value }); setMsg(null); }} placeholder="Γεια σου {όνομα}, …" className={`${field} py-2 leading-relaxed`} />
              <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">Κάθε γραμμή γίνεται παράγραφος. Μεταβλητές: {"{όνομα}"}, {"{παραγγελία}"}, {"{παραστατικό}"}, {"{ημερομηνία}"}.</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending || !dirty} onClick={() => persist(f)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Check className="size-4" aria-hidden /> Αποθήκευση</button>
              {!f.message.trim() && <button type="button" onClick={() => setF({ ...f, ...suggest(r.name) })} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-13)] hover:border-eu-navy"><Sparkles className="size-4" aria-hidden /> Πρόταση κειμένου</button>}
              {dirty && !msg && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">Μη αποθηκευμένες αλλαγές</span>}
              {msg && <span role="status" className={`font-bold text-[length:var(--fs-13)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
            </div>
          </div>
          <div className="rounded-xl bg-eu-surface p-3 grid gap-1.5 content-start min-w-0" aria-label="Προεπισκόπηση">
            <span className="inline-flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-12)] font-bold"><Mail className="size-3.5" aria-hidden /> Προεπισκόπηση με δείγμα</span>
            <div className="text-eu-muted text-[length:var(--fs-12)] break-words">Θέμα: {preview.title} · {SAMPLE["παραγγελία"]}</div>
            <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)] break-words">{preview.title}</div>
            {preview.body.trim() ? preview.body.split(/\n+/).filter((x) => x.trim()).map((x, i) => <p key={i} className="m-0 text-eu-ink text-[length:var(--fs-14)] break-words">{x}</p>) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Χωρίς κείμενο δεν στέλνεται email.</p>}
          </div>
        </div>
      )}
    </li>
  );
}

export function StageSettings({ rows, save }: { rows: StageRow[]; save: Save }) {
  if (!rows.length) return <p data-help="orders.stages.list" className="m-0 rounded-2xl border border-eu-line bg-white p-6 text-eu-ink-3">Δεν υπάρχουν τύποι παραστατικών. Πάτησε «Συγχρονισμός» στο SoftOne → Τύποι παραστατικών.</p>;
  return <ul data-help="orders.stages.list" className="m-0 p-0 list-none grid gap-2">{rows.map((r) => <Row key={r.id} r={r} save={save} />)}</ul>;
}
