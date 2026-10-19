"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, PlugZap, RefreshCw, Truck, XCircle } from "lucide-react";
import { cancelVoucherAction, closeDayAction, createVoucherAction, pingCourierAction, trackNowAction } from "./actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 disabled:opacity-45";
const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] tabular-nums outline-none focus:border-eu-blue";

/** Έκδοση voucher για μια παραγγελία: βάρος (προσυμπληρωμένο από τα προϊόντα), τεμάχια, σχόλιο για τον διανομέα. */
export function CreateVoucher({ orderId, weightKg, weightKnown, pieces, disabled }: { orderId: string; weightKg: number; weightKnown: boolean; pieces: number; disabled: boolean }) {
  const router = useRouter();
  const [w, setW] = useState(String(weightKg));
  const [p, setP] = useState(String(pieces));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-2 @2xl:grid-cols-[5.5rem_4.5rem_minmax(0,1fr)_auto] gap-1.5 items-end">
        <label className="grid gap-0.5"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-12)]" title={weightKnown ? "Από τα χαρακτηριστικά των προϊόντων" : "Κάποιο προϊόν δεν έχει βάρος — υπολογίστηκαν 2 κιλά"}>Κιλά{weightKnown ? "" : " · εκτίμηση"}</span><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(",", "."))} className={`${field} ${weightKnown ? "" : "border-eu-amber"}`} /></label>
        <label className="grid gap-0.5"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-12)]">Τεμάχια</span><input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))} className={field} /></label>
        <label className="grid gap-0.5 col-span-2 @2xl:col-span-1"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-12)]">Σχόλιο διανομέα</span><input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} placeholder="π.χ. κουδούνι Παπαδοπούλου" className={field} /></label>
        <button type="button" disabled={disabled || pending} onClick={() => start(async () => {
          const r = await createVoucherAction(orderId, { weightKg: Number(w), pieces: Number(p), comments: note });
          setMsg(r.ok ? { ok: true, text: `Voucher ${r.voucher}` } : { ok: false, text: r.error });
          router.refresh();
        })} className={`${btn} col-span-2 @2xl:col-span-1 bg-eu-navy text-white hover:bg-eu-blue px-4`}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackagePlus className="size-4" aria-hidden />} Έκδοση voucher
        </button>
      </div>
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-13)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}

export function CancelVoucher({ id, courier, compact = false }: { id: string; courier: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = () => { if (!window.confirm(`Ακύρωση του voucher στην ${courier};`)) return; start(async () => { const r = await cancelVoucherAction(id); setErr(r.ok ? null : r.error); if (!r.ok) window.alert(r.error); router.refresh(); }); };
  if (compact) return <button type="button" disabled={pending} onClick={run} aria-label="Ακύρωση voucher" title="Ακύρωση voucher" className="size-11 md:size-8 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-red/10 hover:text-eu-red disabled:opacity-45">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}</button>;
  return (
    <span className="inline-grid gap-1">
      <button type="button" disabled={pending} onClick={run} className={`${btn} border border-eu-line bg-white text-eu-red hover:bg-eu-red/5`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />} Ακύρωση</button>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-12)]">{err}</span>}
    </span>
  );
}

/** Ενέργειες: δοκιμή σύνδεσης, ενημέρωση παρακολούθησης, κλείσιμο ημέρας (μόνο Γενική). */
export function DayActions({ carrier, openIds, canWrite }: { carrier: "geniki" | "elta" | "asap"; openIds: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (f: () => Promise<{ ok: boolean; text: string }>) => start(async () => { setMsg(await f()); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {msg && <span role="status" className={`font-bold text-[length:var(--fs-12)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
      <button type="button" disabled={pending} title="Δοκιμή σύνδεσης με τον courier" onClick={() => run(async () => { const r = await pingCourierAction(carrier); return r.ok ? { ok: true, text: `Σύνδεση OK (${r.env === "live" ? "παραγωγή" : "δοκιμαστικό"})` } : { ok: false, text: r.error }; })} className={`${btn} border border-eu-line bg-white text-eu-ink-2 hover:border-eu-navy`}><PlugZap className="size-4" aria-hidden /><span className="hidden @md:inline">Σύνδεση</span></button>
      {canWrite && <button type="button" disabled={pending} title="Ζωντανή ενημέρωση καταστάσεων από τον courier (γίνεται και αυτόματα κάθε 2 ώρες)" onClick={() => run(async () => { const r = await trackNowAction(); return { ok: true, text: `${r.checked} ελέγχθηκαν, ${r.updated} άλλαξαν` }; })} className={`${btn} border border-eu-line bg-white text-eu-ink-2 hover:border-eu-navy`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}<span className="hidden @md:inline">Ενημέρωση</span></button>}
      {canWrite && carrier === "geniki" && <button data-help="vouchers.close" type="button" disabled={pending || !openIds.length} onClick={() => { if (!window.confirm(`Κλείσιμο ημέρας: η Γενική θα ενημερωθεί για ${openIds.length} vouchers. Μετά δεν ακυρώνονται από εδώ. Έχουν τυπωθεί οι ετικέτες;`)) return; run(async () => { const r = await closeDayAction(); return r.ok ? { ok: true, text: `Έκλεισαν ${r.closed} vouchers` } : { ok: false, text: r.error }; }); }} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue px-4`}><Truck className="size-4" aria-hidden /> Κλείσιμο ημέρας{openIds.length ? ` (${openIds.length})` : ""}</button>}
    </div>
  );
}
