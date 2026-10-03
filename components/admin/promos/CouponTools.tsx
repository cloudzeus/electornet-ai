"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Send, Layers } from "lucide-react";
import { Hint } from "./Help";
import { couponBatchAction, expireCouponAction, issueCouponAction } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";

/** Παρτίδες μοναδικών κωδικών (με CSV) και προσωπικός κωδικός σε email. */
export function CouponTools({ promos }: { promos: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [b, setB] = useState({ promotionId: promos[0]?.id ?? "", count: 100, prefix: "EU", validDays: 30 });
  const [e, setE] = useState({ promotionCode: promos[0]?.code ?? "", email: "", send: true });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  if (!promos.length) return null;
  const batch = () => start(async () => {
    const r = await couponBatchAction({ ...b, validDays: b.validDays || null });
    if (!r.ok) return setMsg({ ok: false, t: r.error });
    const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `kouponia-${b.prefix}-${r.count}.csv`; a.click(); URL.revokeObjectURL(url);
    setMsg({ ok: true, t: `Δημιουργήθηκαν ${r.count} κωδικοί — το CSV κατέβηκε.` });
    router.refresh();
  });
  const issue = () => start(async () => {
    const r = await issueCouponAction(e);
    setMsg(r.ok ? { ok: true, t: r.created ? `Κωδικός ${r.code}${e.send ? " — στάλθηκε email." : "."}` : `Υπήρχε ήδη κωδικός για αυτό το email: ${r.code}.` } : { ok: false, t: r.error });
    router.refresh();
  });
  return (
    <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4">
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Layers className="size-4" aria-hidden /> Παρτίδα μοναδικών κωδικών <Hint k="batch" /></h3>
        <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={input} value={b.promotionId} onChange={(x) => setB({ ...b, promotionId: x.target.value })}>{promos.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</select></label>
        <div className="grid grid-cols-3 gap-3">
          <label className={lbl}><span>Πλήθος</span><input inputMode="numeric" className={input} value={b.count} onChange={(x) => setB({ ...b, count: Number(x.target.value.replace(/\D/g, "")) || 0 })} /></label>
          <label className={lbl}><span>Πρόθεμα</span><input className={`${input} font-mono uppercase`} value={b.prefix} maxLength={10} onChange={(x) => setB({ ...b, prefix: x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></label>
          <label className={lbl}><span>Ισχύς (ημέρες)</span><input inputMode="numeric" className={input} value={b.validDays} onChange={(x) => setB({ ...b, validDays: Number(x.target.value.replace(/\D/g, "")) || 0 })} /></label>
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Μία χρήση ανά κωδικό, έως 5.000 ανά παρτίδα. Η λήξη δεν ξεπερνά τη λήξη της προσφοράς.</p>
        <button type="button" disabled={busy || !b.count} onClick={batch} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Download className="size-4" aria-hidden /> Δημιουργία & CSV</button>
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Send className="size-4" aria-hidden /> Προσωπικός κωδικός σε πελάτη</h3>
        <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={input} value={e.promotionCode} onChange={(x) => setE({ ...e, promotionCode: x.target.value })}>{promos.map((p) => <option key={p.id} value={p.code}>{p.name} · {p.code}</option>)}</select></label>
        <label className={lbl}><span>Email πελάτη</span><input type="email" className={input} value={e.email} onChange={(x) => setE({ ...e, email: x.target.value })} /></label>
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-h-11"><input type="checkbox" checked={e.send} onChange={(x) => setE({ ...e, send: x.target.checked })} className="size-5 accent-eu-navy" /> Αποστολή email με τον κωδικό</label>
        <button type="button" disabled={busy || !/\S+@\S+\.\S+/.test(e.email)} onClick={issue} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Send className="size-4" aria-hidden /> Έκδοση</button>
      </section>
      {msg && <p role="status" className={`m-0 @4xl:col-span-2 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
    </div>
  );
}

export function ExpireCoupon({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return <button type="button" disabled={busy} onClick={() => confirm(`Λήξη του κωδικού ${code} τώρα;`) && start(async () => { await expireCouponAction(id); router.refresh(); })} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-13)] font-bold hover:border-eu-red hover:text-eu-red disabled:opacity-40">Λήξη</button>;
}
