"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2, PackagePlus, PlugZap, RefreshCw, Truck, XCircle } from "lucide-react";
import { cancelVoucherAction, closeDayAction, createVoucherAction, pingGenikiAction, trackNowAction } from "./actions";

const btn = "inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50";
const field = "w-full rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] tabular-nums";

/** Έκδοση voucher για μια παραγγελία: βάρος (προσυμπληρωμένο από τα προϊόντα), τεμάχια, σχόλιο για τον διανομέα. */
export function CreateVoucher({ orderId, weightKg, weightKnown, pieces, disabled }: { orderId: string; weightKg: number; weightKnown: boolean; pieces: number; disabled: boolean }) {
  const router = useRouter();
  const [w, setW] = useState(String(weightKg));
  const [p, setP] = useState(String(pieces));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 @xl:grid-cols-[7rem_6rem_minmax(0,1fr)_auto] gap-2 items-end">
        <label className="grid gap-1"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Βάρος (κιλά){weightKnown ? "" : " · εκτίμηση"}</span><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(",", "."))} className={field} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Τεμάχια</span><input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))} className={field} /></label>
        <label className="grid gap-1 col-span-2 @xl:col-span-1"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Σχόλιο διανομέα (έως 40)</span><input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} placeholder="π.χ. κουδούνι Παπαδοπούλου" className={field} /></label>
        <button type="button" disabled={disabled || pending} onClick={() => start(async () => {
          const r = await createVoucherAction(orderId, { weightKg: Number(w), pieces: Number(p), comments: note });
          setMsg(r.ok ? { ok: true, text: `Voucher ${r.voucher}` } : { ok: false, text: r.error });
          router.refresh();
        })} className={`${btn} col-span-2 @xl:col-span-1 justify-center bg-eu-navy text-white hover:bg-eu-blue`}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackagePlus className="size-4" aria-hidden />} Έκδοση voucher
        </button>
      </div>
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}

export function CancelVoucher({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-grid gap-1">
      <button type="button" disabled={pending} onClick={() => { if (!window.confirm("Ακύρωση του voucher στη Γενική Ταχυδρομική;")) return; start(async () => { const r = await cancelVoucherAction(id); setErr(r.ok ? null : r.error); router.refresh(); }); }} className={`${btn} border border-eu-line text-eu-red hover:bg-eu-red/5`}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />} Ακύρωση
      </button>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{err}</span>}
    </span>
  );
}

/** Ενέργειες ημέρας: δοκιμή σύνδεσης, εκτύπωση ανοιχτών, κλείσιμο ημέρας, ενημέρωση παρακολούθησης. */
export function DayActions({ openIds, canWrite }: { openIds: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (f: () => Promise<{ ok: boolean; text: string }>) => start(async () => { setMsg(await f()); router.refresh(); });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(async () => { const r = await pingGenikiAction(); return r.ok ? { ok: true, text: `Σύνδεση OK (${r.env === "live" ? "παραγωγή" : "δοκιμαστικό"}).` } : { ok: false, text: r.error }; })} className={`${btn} border border-eu-line text-eu-ink-2 hover:bg-eu-surface`}><PlugZap className="size-4" aria-hidden /> Δοκιμή σύνδεσης</button>
        {openIds.length > 0 && <a href={`/api/admin/shipments/label?ids=${openIds.join(",")}`} target="_blank" rel="noreferrer" className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-surface`}><FileDown className="size-4" aria-hidden /> Ετικέτες ανοιχτών ({openIds.length})</a>}
        {canWrite && <button type="button" disabled={pending || !openIds.length} onClick={() => { if (!window.confirm(`Κλείσιμο ημέρας: η Γενική θα ενημερωθεί για ${openIds.length} vouchers. Μετά δεν ακυρώνονται από εδώ. Έχουν τυπωθεί οι ετικέτες;`)) return; run(async () => { const r = await closeDayAction(); return r.ok ? { ok: true, text: `Έκλεισαν ${r.closed} vouchers.` } : { ok: false, text: r.error }; }); }} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}><Truck className="size-4" aria-hidden /> Κλείσιμο ημέρας</button>}
        {canWrite && <button type="button" disabled={pending} onClick={() => run(async () => { const r = await trackNowAction(); return { ok: true, text: `Ελέγχθηκαν ${r.checked} αποστολές, ${r.updated} άλλαξαν.` }; })} className={`${btn} border border-eu-line text-eu-ink-2 hover:bg-eu-surface`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Ενημέρωση παρακολούθησης</button>}
      </div>
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}
