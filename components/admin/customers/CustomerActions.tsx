"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, MapPin, Download, Upload, ExternalLink, Copy, X, Loader2, AlertTriangle } from "lucide-react";
import { customerFormAction, erpPull, erpPush, geocodeCustomerAction, saveCustomer, type CustomerInput } from "@/app/admin/(shell)/customers/actions";
import { invalidatePeek } from "./CustomerList";

export type ActionCtx = { id: string; name: string; email: string | null; phone: string | null; erpLinked: boolean; canWrite: boolean; erpOn: boolean };
export type Toast = { ok: boolean; text: string } | null;

/** Μήνυμα αποτελέσματος κάτω στην οθόνη (κλείνει μόνο του σε 7″). */
export function ToastBar({ t, onClose }: { t: Toast; onClose: () => void }) {
  useEffect(() => { if (!t) return; const h = setTimeout(onClose, 7000); return () => clearTimeout(h); }, [t, onClose]);
  return (
    <div aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[75] w-[min(36rem,calc(100vw-2rem))]">
      {t && <p className={`m-0 flex items-start gap-2 rounded-xl px-4 py-3 shadow-[var(--shadow-raised)] font-semibold text-[length:var(--fs-14)] ${t.ok ? "bg-eu-navy text-white" : "bg-eu-red text-white"}`}><span className="flex-1">{t.text}</span><button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-6 grid place-items-center rounded-full hover:bg-white/15"><X className="size-4" aria-hidden /></button></p>}
    </div>
  );
}
const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white outline-none focus:border-eu-blue";
const lbl = "grid gap-1 content-start font-bold text-eu-ink-2 text-[length:var(--fs-13)]";

/**
 * Μενού ενεργειών μιας γραμμής πελάτη (⋯): διόρθωση στοιχείων (παράθυρο), γεωδεδομένα από τις διευθύνσεις, ενημέρωση
 * του e-shop από το SoftOne (ανάγνωση) και ενημέρωση του SoftOne από το e-shop (εγγραφή — με ρητή επιβεβαίωση),
 * αντιγραφή email/τηλεφώνου και πλήρης καρτέλα. Το μενού ανοίγει πάνω από τον πίνακα (δεν κόβεται από τη γραμμή).
 */
export function CustomerActions({ c, onToast, onChanged }: { c: ActionCtx; onToast: (t: Toast) => void; onChanged?: () => void }) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const [dialog, setDialog] = useState<"edit" | "push" | null>(null);
  const [busy, start] = useTransition();
  const close = () => setPos(null);
  const open = () => { const r = btn.current!.getBoundingClientRect(); const up = r.bottom + 330 > window.innerHeight; setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up }); };
  useEffect(() => {
    if (!pos) return;
    const out = (e: Event) => { if (e instanceof KeyboardEvent) { if (e.key === "Escape") { close(); btn.current?.focus(); } return; } if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const gone = () => close();
    document.addEventListener("mousedown", out); document.addEventListener("keydown", out); window.addEventListener("scroll", gone, true); window.addEventListener("resize", gone);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", out); window.removeEventListener("scroll", gone, true); window.removeEventListener("resize", gone); };
  }, [pos]);
  const done = (t: Toast) => { invalidatePeek(c.id); onToast(t); onChanged?.(); router.refresh(); };
  const geo = () => start(async () => { const r = await geocodeCustomerAction(c.id); done(r.ok ? { ok: !r.failed.length, text: `${c.name}: γεωδεδομένα για ${r.done}/${r.total} διευθύνσεις${r.failed.length ? ` · ${r.failed.join(" · ")}` : " · ενημερώθηκε και το κοντινότερο κατάστημα"}.` } : { ok: false, text: r.error }); });
  const pull = () => start(async () => { const r = await erpPull(c.id); done(r.ok ? { ok: true, text: `${c.name}: ενημερώθηκε από το SoftOne (${r.code} · ${r.name}).` } : { ok: false, text: `SoftOne: ${"error" in r ? r.error : "αποτυχία"}` }); });
  const copy = (v: string, what: string) => { void navigator.clipboard?.writeText(v); onToast({ ok: true, text: `Αντιγράφηκε ${what}: ${v}` }); };
  const item = "w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[length:var(--fs-14)] hover:bg-eu-surface focus-visible:bg-eu-surface outline-none disabled:opacity-40 disabled:hover:bg-transparent";
  const keyNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Ενέργειες: ${c.name}`} onClick={() => (pos ? close() : open())} className={`size-8 grid place-items-center rounded-full ${pos ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" aria-label={`Ενέργειες: ${c.name}`} onKeyDown={keyNav} className="fixed z-[70] w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-eu-line bg-white p-1.5 shadow-[var(--shadow-raised)] grid gap-0.5" style={{ right: Math.max(8, pos.right), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
          <span className="px-2.5 pt-1 pb-1.5 font-bold text-eu-ink text-[length:var(--fs-13)] truncate border-b border-eu-line-2 mb-0.5">{c.name}</span>
          <button type="button" role="menuitem" disabled={!c.canWrite} onClick={() => { close(); setDialog("edit"); }} className={item}><Pencil className="size-4 mt-0.5 text-eu-blue shrink-0" aria-hidden /><span className="grid"><b>Διόρθωση στοιχείων</b><span className="text-eu-muted text-[length:var(--fs-12)]">όνομα, email, τηλέφωνα, ΑΦΜ/ΔΟΥ, κατάσταση</span></span></button>
          <button type="button" role="menuitem" disabled={!c.canWrite || busy} onClick={() => { close(); geo(); }} className={item}><MapPin className="size-4 mt-0.5 text-eu-blue shrink-0" aria-hidden /><span className="grid"><b>Γεωδεδομένα από τη διεύθυνση</b><span className="text-eu-muted text-[length:var(--fs-12)]">συντεταγμένες, νομός, κοντινότερο κατάστημα</span></span></button>
          {c.erpOn && <>
            <button type="button" role="menuitem" disabled={!c.canWrite || !c.erpLinked || busy} onClick={() => { close(); pull(); }} className={item}><Download className="size-4 mt-0.5 text-eu-green shrink-0" aria-hidden /><span className="grid"><b>Ενημέρωση e-shop από SoftOne</b><span className="text-eu-muted text-[length:var(--fs-12)]">{c.erpLinked ? "διαβάζει την καρτέλα CUSTOMER (ΑΦΜ, ΔΟΥ, τηλέφωνα, επωνυμία)" : "χρειάζεται πρώτα σύνδεση με καρτέλα SoftOne"}</span></span></button>
            <button type="button" role="menuitem" disabled={!c.canWrite || busy} onClick={() => { close(); setDialog("push"); }} className={item}><Upload className="size-4 mt-0.5 text-eu-amber shrink-0" aria-hidden /><span className="grid"><b>{c.erpLinked ? "Ενημέρωση SoftOne από e-shop" : "Δημιουργία καρτέλας στο SoftOne"}</b><span className="text-eu-muted text-[length:var(--fs-12)]">γράφει στο SoftOne — ζητά επιβεβαίωση</span></span></button>
          </>}
          <div className="border-t border-eu-line-2 my-0.5" />
          {c.email && <button type="button" role="menuitem" onClick={() => { close(); copy(c.email!, "το email"); }} className={item}><Copy className="size-4 mt-0.5 text-eu-muted shrink-0" aria-hidden />Αντιγραφή email</button>}
          {c.phone && <button type="button" role="menuitem" onClick={() => { close(); copy(c.phone!, "το τηλέφωνο"); }} className={item}><Copy className="size-4 mt-0.5 text-eu-muted shrink-0" aria-hidden />Αντιγραφή τηλεφώνου</button>}
          <Link role="menuitem" href={`/admin/customers/${c.id}`} onClick={close} className={item}><ExternalLink className="size-4 mt-0.5 text-eu-muted shrink-0" aria-hidden />Πλήρης καρτέλα</Link>
        </div>,
        document.body,
      )}
      {dialog === "edit" && <EditDialog c={c} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); done(t); }} />}
      {dialog === "push" && <PushDialog c={c} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); done(t); }} />}
    </>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} onClose={onClose} aria-label={title} className={`m-auto ${wide ? "w-[min(44rem,calc(100vw-1.5rem))]" : "w-[min(30rem,calc(100vw-1.5rem))]"} max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/40 @container`}>
      <div className="bg-white p-4 @md:p-5 grid gap-3">
        <div className="flex items-start justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{title}</h3><button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-10 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

/** Γρήγορη διόρθωση στοιχείων: τα συχνά πεδία· τα υπόλοιπα (γενέθλια, ετικέτες, κάρτα πιστότητας…) μένουν ως έχουν. */
function EditDialog({ c, onClose, onDone }: { c: ActionCtx; onClose: () => void; onDone: (t: Toast) => void }) {
  const [f, setF] = useState<(CustomerInput & { id: string; erpLinked: boolean }) | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { let live = true; void customerFormAction(c.id).then((x) => { if (live) setF(x); }); return () => { live = false; }; }, [c.id]);
  const set = (p: Partial<CustomerInput>) => setF((x) => (x ? { ...x, ...p } : x));
  const save = () => f && start(async () => { const { id: _id, erpLinked: _linked, ...input } = f; void _id; void _linked; const r = await saveCustomer(c.id, input); if (!r.ok) return setErr(r.error); onDone({ ok: true, text: `${c.name}: τα στοιχεία αποθηκεύτηκαν.${f.erpLinked ? " Στο SoftOne σημειώθηκε «σε αναμονή» — δεν στάλθηκε τίποτα." : ""}` }); });
  return (
    <Modal title={`Διόρθωση στοιχείων · ${c.name}`} onClose={onClose} wide>
      {f === undefined ? <span className="inline-flex items-center gap-2 text-eu-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span> : !f ? <p className="m-0 text-eu-muted">Ο πελάτης δεν βρέθηκε.</p> : (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-3">
          <div role="radiogroup" aria-label="Τύπος" className="grid grid-cols-2 gap-1 rounded-xl bg-eu-surface p-1 @md:max-w-xs">{([["individual", "Ιδιώτης"], ["business", "Εταιρεία"]] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={f.type === v} onClick={() => set({ type: v })} className={`rounded-lg min-h-10 font-bold text-[length:var(--fs-13)] ${f.type === v ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3"}`}>{t}</button>)}</div>
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
            {f.type === "business" && <label className={`${lbl} @md:col-span-2`}>Επωνυμία *<input className={input} value={f.company} onChange={(e) => set({ company: e.target.value })} /></label>}
            <label className={lbl}>Όνομα *<input className={input} autoComplete="off" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
            <label className={lbl}>Επώνυμο *<input className={input} autoComplete="off" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
            <label className={`${lbl} @md:col-span-2`}>Email *<input type="email" inputMode="email" autoComplete="off" className={input} value={f.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label className={lbl}>Κινητό<input type="tel" inputMode="tel" className={input} value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} /></label>
            <label className={lbl}>Σταθερό<input type="tel" inputMode="tel" className={input} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
            <label className={lbl}>ΑΦΜ<input inputMode="numeric" maxLength={9} className={input} value={f.vatNumber} onChange={(e) => set({ vatNumber: e.target.value.replace(/\D/g, "") })} /><span className="font-normal text-eu-muted text-[length:var(--fs-12)]">9 ψηφία</span></label>
            <label className={lbl}>ΔΟΥ<input className={input} value={f.doy} onChange={(e) => set({ doy: e.target.value })} /></label>
            <label className={lbl}>Επάγγελμα<input className={input} value={f.profession} onChange={(e) => set({ profession: e.target.value })} /></label>
            <label className={lbl}>Κατάσταση<select className={input} value={f.status} onChange={(e) => set({ status: e.target.value as CustomerInput["status"] })}><option value="active">Ενεργός</option><option value="blocked">Μπλοκαρισμένος</option></select></label>
          </div>
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" checked={f.newsletter} onChange={(e) => set({ newsletter: e.target.checked })} className="size-5 accent-eu-navy" /> Newsletter (η αλλαγή καταγράφεται ως συναίνεση από το προσωπικό)</label>
          {f.erpLinked && <p className="m-0 rounded-xl bg-eu-chip px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]">Συνδεδεμένος με SoftOne: η αποθήκευση αλλάζει μόνο το e-shop και σημειώνει τον πελάτη «σε αναμονή» για συγχρονισμό — στο SoftOne δεν γράφεται τίποτα.</p>}
          {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red px-3 py-2 font-semibold text-[length:var(--fs-14)]">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-14)] disabled:opacity-50">{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
            <button type="button" onClick={onClose} className="rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)]">Ακύρωση</button>
            <Link href={`/admin/customers/${c.id}`} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-surface">Όλα τα πεδία <ExternalLink className="size-3.5" aria-hidden /></Link>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Εγγραφή στο SoftOne: μόνο με ρητή επιβεβαίωση, γιατί αλλάζει (ή δημιουργεί) καρτέλα CUSTOMER στο ERP. */
function PushDialog({ c, onClose, onDone }: { c: ActionCtx; onClose: () => void; onDone: (t: Toast) => void }) {
  const [ok, setOk] = useState(false);
  const [busy, start] = useTransition();
  const run = () => start(async () => { const r = await erpPush(c.id); onDone(r.ok ? { ok: true, text: `${c.name}: ${c.erpLinked ? "ενημερώθηκε" : "δημιουργήθηκε"} στο SoftOne.` } : { ok: false, text: `SoftOne: ${"error" in r ? r.error : "αποτυχία"}` }); });
  return (
    <Modal title={c.erpLinked ? "Ενημέρωση SoftOne από e-shop" : "Δημιουργία καρτέλας στο SoftOne"} onClose={onClose}>
      <p className="m-0 flex gap-2 rounded-xl bg-eu-amber/15 px-3 py-2.5 text-eu-ink text-[length:var(--fs-14)]"><AlertTriangle className="size-5 shrink-0 text-eu-amber" aria-hidden /><span>{c.erpLinked ? <>Τα στοιχεία του <b>{c.name}</b> στο e-shop θα <b>αντικαταστήσουν</b> αυτά της καρτέλας CUSTOMER στο SoftOne.</> : <>Θα δημιουργηθεί <b>νέα καρτέλα CUSTOMER</b> στο SoftOne για τον <b>{c.name}</b>. Έλεγξε πρώτα ότι δεν υπάρχει ήδη (αναζήτηση με ΑΦΜ στην πλήρη καρτέλα).</>}</span></p>
      <label className="inline-flex items-start gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="size-5 mt-0.5 accent-eu-navy" /> Το έλεγξα — να γραφτεί στο SoftOne</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!ok || busy} onClick={run} className="rounded-full bg-eu-amber text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] disabled:opacity-40">{busy ? "Αποστολή…" : c.erpLinked ? "Ενημέρωση SoftOne" : "Δημιουργία στο SoftOne"}</button>
        <button type="button" onClick={onClose} className="rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)]">Ακύρωση</button>
      </div>
    </Modal>
  );
}
