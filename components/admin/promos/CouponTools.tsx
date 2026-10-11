"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Send, Layers, X } from "lucide-react";
import { Hint } from "./Help";
import { couponBatchAction, expireCouponAction, issueCouponAction } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";

/**
 * Δύο ενέργειες ως κουμπιά: «Παρτίδα κωδικών» (μοναδικοί κωδικοί + CSV) και «Κωδικός σε πελάτη» (σε email). Η φόρμα
 * ανοίγει σε παράθυρο, με προεπιλεγμένη την προσφορά-κουπόνι που βλέπεις.
 */
export function CouponTools({ promos, current }: { promos: { id: string; code: string; name: string }[]; current?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const first = promos.find((p) => p.id === current) ?? promos[0];
  const [open, setOpen] = useState<"batch" | "issue" | null>(null);
  const [b, setB] = useState({ promotionId: first?.id ?? "", count: 100, prefix: "EU", validDays: 30 });
  const [e, setE] = useState({ promotionCode: first?.code ?? "", email: "", send: true });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dlg.current; if (open && d && !d.open) d.showModal(); if (!open && d?.open) d.close(); }, [open]);
  if (!promos.length) return null;
  const show = (k: "batch" | "issue") => { setMsg(null); if (first) { setB((x) => ({ ...x, promotionId: first.id })); setE((x) => ({ ...x, promotionCode: first.code })); } setOpen(k); };
  const batch = () => start(async () => {
    const r = await couponBatchAction({ ...b, validDays: b.validDays || null });
    if (!r.ok) return setMsg({ ok: false, t: r.error });
    const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `kouponia-${b.prefix}-${r.count}.csv`; a.click(); URL.revokeObjectURL(url);
    setMsg({ ok: true, t: `Δημιουργήθηκαν ${r.count} κωδικοί — το CSV κατέβηκε.` });
    setOpen(null); router.refresh();
  });
  const issue = () => start(async () => {
    const r = await issueCouponAction(e);
    setMsg(r.ok ? { ok: true, t: r.created ? `Κωδικός ${r.code}${e.send ? " — στάλθηκε email." : "."}` : `Υπήρχε ήδη κωδικός για αυτό το email: ${r.code}.` } : { ok: false, t: r.error });
    if (r.ok) setOpen(null);
    router.refresh();
  });
  return (
    <>
      <button type="button" onClick={() => show("batch")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip"><Layers className="size-4" aria-hidden /> Παρτίδα κωδικών</button>
      <button type="button" onClick={() => show("issue")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip"><Send className="size-4" aria-hidden /> Κωδικός σε πελάτη</button>
      {msg && !open && <p role="status" className={`m-0 basis-full rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      <dialog ref={dlg} onClose={() => setOpen(null)} aria-label={open === "batch" ? "Παρτίδα μοναδικών κωδικών" : "Προσωπικός κωδικός σε πελάτη"} className="m-auto w-[min(36rem,calc(100vw-1.5rem))] rounded-2xl p-0 backdrop:bg-black/40">
        {open && (
          <div className="bg-white p-4 @md:p-5 grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-1.5">{open === "batch" ? <><Layers className="size-5 text-eu-blue" aria-hidden /> Παρτίδα μοναδικών κωδικών <Hint k="batch" /></> : <><Send className="size-5 text-eu-blue" aria-hidden /> Προσωπικός κωδικός σε πελάτη</>}</h3>
              <button type="button" aria-label="Κλείσιμο" onClick={() => setOpen(null)} className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
            </div>
            {open === "batch" ? (
              <>
                <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={input} value={b.promotionId} onChange={(x) => setB({ ...b, promotionId: x.target.value })}>{promos.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</select></label>
                <div className="grid grid-cols-3 gap-3">
                  <label className={lbl}><span>Πλήθος</span><input inputMode="numeric" className={input} value={b.count} onChange={(x) => setB({ ...b, count: Number(x.target.value.replace(/\D/g, "")) || 0 })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Έως 5.000.</span></label>
                  <label className={lbl}><span>Πρόθεμα</span><input className={`${input} font-mono uppercase`} value={b.prefix} maxLength={10} onChange={(x) => setB({ ...b, prefix: x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">FLYER → FLYER-7KQ4MZ.</span></label>
                  <label className={lbl}><span>Ισχύς (ημέρες)</span><input inputMode="numeric" className={input} value={b.validDays} onChange={(x) => setB({ ...b, validDays: Number(x.target.value.replace(/\D/g, "")) || 0 })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Από σήμερα.</span></label>
                </div>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Μία χρήση ανά κωδικό. Η λήξη δεν ξεπερνά τη λήξη της προσφοράς. Το CSV κατεβαίνει αμέσως.</p>
              </>
            ) : (
              <>
                <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={input} value={e.promotionCode} onChange={(x) => setE({ ...e, promotionCode: x.target.value })}>{promos.map((p) => <option key={p.id} value={p.code}>{p.name} · {p.code}</option>)}</select></label>
                <label className={lbl}><span>Email πελάτη</span><input type="email" autoComplete="off" className={input} value={e.email} onChange={(x) => setE({ ...e, email: x.target.value })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Ο κωδικός δουλεύει μόνο με αυτό το email / λογαριασμό.</span></label>
                <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-h-11"><input type="checkbox" checked={e.send} onChange={(x) => setE({ ...e, send: x.target.checked })} className="size-5 accent-eu-navy" /> Αποστολή email με τον κωδικό</label>
              </>
            )}
            {msg && !msg.ok && <p role="alert" className="m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] bg-eu-red/10 text-eu-red">{msg.t}</p>}
            <div className="flex flex-wrap gap-2">
              {open === "batch"
                ? <button type="button" disabled={busy || !b.count} onClick={batch} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Download className="size-4" aria-hidden /> {busy ? "Δημιουργία…" : "Δημιουργία & CSV"}</button>
                : <button type="button" disabled={busy || !/\S+@\S+\.\S+/.test(e.email)} onClick={issue} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Send className="size-4" aria-hidden /> {busy ? "Έκδοση…" : "Έκδοση"}</button>}
              <button type="button" onClick={() => setOpen(null)} className="rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)]">Ακύρωση</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function ExpireCoupon({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return <button type="button" disabled={busy} onClick={() => confirm(`Λήξη του κωδικού ${code} τώρα;`) && start(async () => { await expireCouponAction(id); router.refresh(); })} className="rounded-full border border-eu-line px-3 min-h-10 text-[length:var(--fs-13)] font-bold hover:border-eu-red hover:text-eu-red disabled:opacity-40">Λήξη</button>;
}
