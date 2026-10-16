"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Mail, MoreHorizontal, Pin, PinOff, Printer, Send, Trash2, X } from "lucide-react";
import { NOTIFY_ON, ORDER_STATUS, RETURN_ACTION, RETURN_NEXT, type OrderStatus } from "@/lib/orders/model";
import { addNoteAction, changeStatusAction, deleteNoteAction, pinNoteAction, refundAction, resendConfirmationAction, returnStatusAction } from "../actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 disabled:opacity-45";
const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue";
type Msg = { ok: boolean; text: string } | null;
const useMsg = () => { const [m, set] = useState<Msg>(null); useEffect(() => { if (!m?.ok) return; const t = setTimeout(() => set(null), 5000); return () => clearTimeout(t); }, [m]); return [m, set] as const; };
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`m-0 font-bold text-[length:var(--fs-12)] ${m.ok ? "text-eu-green" : "text-eu-red"}`}>{m.text}</p> : null);

/** Επιβεβαίωση αλλαγής κατάστασης: ειδοποίηση πελάτη (όπου υπάρχει email) και λόγος στην ακύρωση. */
function StatusDialog({ to, onClose, orderId, number }: { to: OrderStatus; onClose: () => void; orderId: string; number: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const mail = NOTIFY_ON[to];
  const cancel = to === "cancelled";
  const go = () => start(async () => {
    const r = await changeStatusAction(orderId, number, to, { notify: !!mail && notify, reason });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    router.refresh(); onClose();
  });
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-eu-ink/40">
      <div className="grid gap-3 p-4">
        <div className="flex items-start gap-2">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] grow">{cancel ? "Ακύρωση παραγγελίας" : `«${ORDER_STATUS[to].label}»`}</h3>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 md:size-9 grid place-items-center rounded-full hover:bg-eu-surface -mt-1 -mr-1"><X className="size-4" aria-hidden /></button>
        </div>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{ORDER_STATUS[to].help}{cancel ? " Αν έχει πληρωθεί, κατέγραψε μετά την επιστροφή χρημάτων." : ""}</p>
        {cancel && <label className="grid gap-1"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-12)]">Λόγος (τον βλέπει ο πελάτης στο email)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="π.χ. Μετά από αίτημά σου / Εξαντλήθηκε το απόθεμα" className={field} /></label>}
        {mail ? (
          <label className="flex items-start gap-2 rounded-lg bg-eu-surface px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 mt-0.5 accent-eu-navy" />
            <span className="grid text-[length:var(--fs-13)]"><b className="text-eu-ink">Ειδοποίηση πελάτη με email</b><span className="text-eu-ink-3">{to === "ready-for-pickup" ? "Κατάστημα, ωράριο, «κρατάμε έως» 7 ημέρες και κωδικός παραλαβής." : to === "delivered" ? "Επιβεβαίωση παράδοσης και πρόσκληση για αξιολόγηση." : "Ακύρωση με τον λόγο και τα στοιχεία επιστροφής χρημάτων."}</span></span>
          </label>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Χωρίς email στον πελάτη για αυτή την αλλαγή.</p>}
        <Note m={msg} />
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={onClose} className={`${btn} border border-eu-line bg-white hover:border-eu-navy`}>Πίσω</button>
          <button type="button" onClick={go} disabled={pending} className={`${btn} px-4 text-white ${cancel ? "bg-eu-red hover:bg-eu-red/90" : "bg-eu-navy hover:bg-eu-blue"}`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{cancel ? "Ακύρωση παραγγελίας" : "Επιβεβαίωση"}</button>
        </div>
      </div>
    </dialog>
  );
}

/** Κύρια ενέργεια + «Αλλαγή κατάστασης» + μενού (email, εκτύπωση, ακύρωση). */
export function OrderHeaderActions({ orderId, number, primary, next, canWrite }: { orderId: string; number: string; primary: { to?: OrderStatus; label: string; voucher?: boolean; hint: string } | null; next: OrderStatus[]; canWrite: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<OrderStatus | null>(null);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useMsg();
  const others = next.filter((s) => s !== primary?.to && s !== "cancelled");
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Note m={msg} />
      <button type="button" onClick={() => window.print()} className={`${btn} border border-eu-line bg-white hover:border-eu-navy print:hidden`} title="Εκτύπωση της παραγγελίας"><Printer className="size-4" aria-hidden /><span className="hidden @md:inline">Εκτύπωση</span></button>
      {canWrite && (
        <div className="relative print:hidden">
          <button type="button" onClick={() => setMenu((x) => !x)} aria-expanded={menu} aria-haspopup="menu" className={`${btn} border border-eu-line bg-white hover:border-eu-navy`}><MoreHorizontal className="size-4" aria-hidden /><span className="hidden @md:inline">Περισσότερα</span><ChevronDown className="size-3.5" aria-hidden /></button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-eu-line bg-white shadow-lg p-1 grid">
              {others.map((s) => <button key={s} role="menuitem" type="button" onClick={() => { setMenu(false); setDialog(s); }} className="text-left rounded-lg px-3 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-surface">→ {ORDER_STATUS[s].label}</button>)}
              <button role="menuitem" type="button" disabled={pending} onClick={() => { setMenu(false); start(async () => { const r = await resendConfirmationAction(orderId, number); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); router.refresh(); }); }} className="text-left rounded-lg px-3 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-surface inline-flex items-center gap-2"><Mail className="size-4 text-eu-blue" aria-hidden /> Ξανά email επιβεβαίωσης</button>
              {next.includes("cancelled") && <><hr className="my-1 border-eu-line-2" /><button role="menuitem" type="button" onClick={() => { setMenu(false); setDialog("cancelled"); }} className="text-left rounded-lg px-3 min-h-11 md:min-h-9 text-[length:var(--fs-13)] text-eu-red hover:bg-eu-red/5 inline-flex items-center gap-2"><X className="size-4" aria-hidden /> Ακύρωση παραγγελίας</button></>}
            </div>
          )}
        </div>
      )}
      {canWrite && primary && (primary.to || primary.voucher) && (
        primary.voucher
          ? <a href="#voucher" className={`${btn} px-4 bg-eu-navy text-white hover:bg-eu-blue print:hidden`} title={primary.hint}><Send className="size-4" aria-hidden /> {primary.label}</a>
          : <button type="button" onClick={() => setDialog(primary.to!)} className={`${btn} px-4 bg-eu-navy text-white hover:bg-eu-blue print:hidden`} title={primary.hint}><Check className="size-4" aria-hidden /> {primary.label}</button>
      )}
      {dialog && <StatusDialog to={dialog} orderId={orderId} number={number} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function NotesPanel({ orderId, number, notes, canWrite }: { orderId: string; number: string; notes: { id: string; text: string; staffName: string | null; pinned: boolean; createdAt: string }[]; canWrite: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useMsg();
  const run = (f: () => Promise<{ ok: boolean; message?: string; error?: string }>, clear = false) => start(async () => { const r = await f(); setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error ?? "Σφάλμα" }); if (r.ok && clear) setText(""); router.refresh(); });
  return (
    <div className="grid gap-2">
      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => addNoteAction(orderId, number, text), true); }} className="grid gap-1.5 print:hidden">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Εσωτερική σημείωση — δεν τη βλέπει ο πελάτης" aria-label="Νέα σημείωση" className={`${field} py-1.5 resize-y`} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) { e.preventDefault(); run(() => addNoteAction(orderId, number, text), true); } }} />
          <div className="flex items-center gap-2"><Note m={msg} /><button type="submit" disabled={pending || !text.trim()} className={`${btn} ml-auto bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}Προσθήκη</button></div>
        </form>
      )}
      {!notes.length ? <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Καμία σημείωση.</p> : (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {notes.map((n) => (
            <li key={n.id} className={`rounded-lg px-2.5 py-2 text-[length:var(--fs-13)] ${n.pinned ? "bg-eu-yellow/25 border border-eu-yellow/60" : "bg-eu-surface"}`}>
              <p className="m-0 text-eu-ink whitespace-pre-wrap break-words">{n.text}</p>
              <div className="mt-1 flex items-center gap-1 text-eu-muted text-[length:var(--fs-12)]">
                <span className="grow">{n.staffName ?? "Προσωπικό"} · {new Date(n.createdAt).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {canWrite && <>
                  <button type="button" onClick={() => run(() => pinNoteAction(n.id, number, !n.pinned))} aria-label={n.pinned ? "Ξεκαρφίτσωμα" : "Καρφίτσωμα"} title={n.pinned ? "Ξεκαρφίτσωμα" : "Καρφίτσωμα πάνω"} className="size-11 md:size-7 grid place-items-center rounded-full hover:bg-white print:hidden">{n.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}</button>
                  <button type="button" onClick={() => { if (window.confirm("Διαγραφή της σημείωσης;")) run(() => deleteNoteAction(n.id, number)); }} aria-label="Διαγραφή σημείωσης" className="size-11 md:size-7 grid place-items-center rounded-full hover:bg-white hover:text-eu-red print:hidden"><Trash2 className="size-3.5" aria-hidden /></button>
                </>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ενέργειες ενός αιτήματος επιστροφής: επόμενες καταστάσεις, ειδοποίηση πελάτη και ποσό στην παραλαβή. */
export function ReturnControls({ id, number, status, maxRefund }: { id: string; number: string; status: string; maxRefund: number }) {
  const router = useRouter();
  const [notify, setNotify] = useState(true);
  const [refund, setRefund] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useMsg();
  const next = RETURN_NEXT[status] ?? [];
  if (!next.length) return null;
  const mailable = next.some((s) => s === "received" || s === "refunded");
  return (
    <div className="grid gap-1.5 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        {next.map((s) => (
          <button key={s} type="button" disabled={pending} onClick={() => { if (s === "rejected" && !window.confirm("Απόρριψη του αιτήματος επιστροφής;")) return; if (s === "refunded" && !window.confirm("Σήμανση ότι επιστράφηκαν τα χρήματα; Η επιστροφή γίνεται στο σύστημα πληρωμών· εδώ καταγράφεται.")) return; start(async () => { const r = await returnStatusAction(id, number, s, { notify, refund: refund ? Number(refund.replace(",", ".")) : null }); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); router.refresh(); }); }} className={`${btn} ${s === "rejected" ? "border border-eu-line bg-white text-eu-red hover:bg-eu-red/5" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>{RETURN_ACTION[s] ?? s}</button>
        ))}
        {mailable && <>
          <label className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-eu-ink-3">Ποσό <input inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder={maxRefund.toFixed(2).replace(".", ",")} aria-label="Ποσό επιστροφής χρημάτων" className="w-24 rounded-lg border border-eu-line bg-white px-2 min-h-11 md:min-h-8 text-[length:var(--fs-13)] tabular-nums" /> €</label>
          <label className="inline-flex items-center gap-1.5 text-[length:var(--fs-12)] cursor-pointer"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-eu-navy" />Email στον πελάτη</label>
        </>}
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      </div>
      <Note m={msg} />
    </div>
  );
}

/** Καταγραφή επιστροφής χρημάτων που έγινε εκτός συστήματος (δεν κινεί χρήματα). */
export function RefundForm({ orderId, number, total }: { orderId: string; number: string; total: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(total.toFixed(2).replace(".", ","));
  const [method, setMethod] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useMsg();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btn} justify-self-start border border-eu-line bg-white hover:border-eu-navy print:hidden`}>Καταγραφή επιστροφής χρημάτων</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!window.confirm(`Καταγραφή επιστροφής ${amount} €; (δεν γίνεται κίνηση χρημάτων από εδώ)`)) return; start(async () => { const r = await refundAction(orderId, number, Number(amount.replace(/\./g, "").replace(",", ".")), method); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); if (r.ok) setOpen(false); router.refresh(); }); }} className="grid gap-1.5 rounded-lg bg-eu-surface p-2.5 print:hidden">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Η επιστροφή γίνεται στο σύστημα πληρωμών (Viva, τράπεζα, ταμείο)· εδώ καταγράφεται για το ιστορικό και την κατάσταση πληρωμής.</p>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-1.5">
        <label className="grid gap-0.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-12)]">Ποσό €</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tabular-nums`} /></label>
        <label className="grid gap-0.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-12)]">Τρόπος / αναφορά</span><input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="π.χ. Viva refund #…, IBAN …" className={field} /></label>
      </div>
      <div className="flex items-center gap-1.5"><Note m={msg} /><button type="button" onClick={() => setOpen(false)} className={`${btn} ml-auto border border-eu-line bg-white`}>Άκυρο</button><button type="submit" disabled={pending} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}Καταγραφή</button></div>
    </form>
  );
}
