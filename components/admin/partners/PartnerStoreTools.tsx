"use client";

import { useState, useTransition } from "react";
import { MapPinned, Plus } from "lucide-react";
import { createAllMissingStores, createBranchStore, geocodePartnerStores, setPartnerStoreVisible } from "@/app/admin/(shell)/synergates/actions";

const btn = "inline-flex items-center gap-2 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50 border-2 border-eu-navy text-eu-navy hover:bg-eu-navy hover:text-white";

/** Διακόπτης «Εμφανίζεται στο eshop» για το κατάστημα ενός υποκαταστήματος. */
export function StoreVisibility({ storeId, active, hasPoint }: { storeId: string; active: boolean; hasPoint: boolean }) {
  const [on, setOn] = useState(active);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1">
      <label className="inline-flex items-center gap-3 min-h-11 cursor-pointer select-none">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setErr(null);
            start(async () => { const r = await setPartnerStoreVisible(storeId, next); if (r.ok) setOn(next); else setErr(r.error); });
          }}
          className="size-5 accent-eu-navy"
        />
        <span className="text-[length:var(--fs-14)] font-bold">{on ? "Εμφανίζεται στο eshop" : "Κρυφό στο eshop"}</span>
      </label>
      {!hasPoint && <span className="text-amber-900 text-[length:var(--fs-12)]">Χωρίς σημείο στον χάρτη ακόμη.</span>}
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </div>
  );
}

/** «Νέο κατάστημα» για υποκατάστημα χωρίς κατάστημα: φτιάχνεται κρυφό, με γεωκωδικοποίηση. */
export function CreateBranchStore({ branchId }: { branchId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1 justify-items-start">
      <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
        const r = await createBranchStore(branchId);
        setMsg(r.ok ? (r.geocoded ? "Φτιάχτηκε κρυφό, με σημείο στον χάρτη." : "Φτιάχτηκε κρυφό· η διεύθυνση δεν βρέθηκε στον χάρτη — όρισέ τη από τη σελίδα του καταστήματος.") : r.error);
      })}>
        <Plus className="size-4" aria-hidden /> Νέο κατάστημα από το υποκατάστημα
      </button>
      {msg && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</p>}
    </div>
  );
}

/** Μαζικές ενέργειες της λίστας: κρυφά καταστήματα για όσα υποκαταστήματα λείπουν, γεωκωδικοποίηση ανά 20. */
export function MissingStoresTools({ creatable, ungeocoded }: { creatable: number; ungeocoded: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!creatable && !ungeocoded) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {creatable > 0 && (
        <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
          if (!confirm(`Θα φτιαχτούν ${creatable} καταστήματα από τα υποκαταστήματα του SoftOne, όλα κρυφά στο eshop. Συνέχεια;`)) return;
          const r = await createAllMissingStores();
          setMsg(`Φτιάχτηκαν ${r.created} κρυφά καταστήματα. Τρέξε τη γεωκωδικοποίηση για το σημείο τους στον χάρτη.`);
        })}>
          <Plus className="size-4" aria-hidden /> Καταστήματα για {creatable} υποκαταστήματα (κρυφά)
        </button>
      )}
      {ungeocoded > 0 && (
        <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
          const r = await geocodePartnerStores();
          setMsg(`Βρέθηκαν ${r.done}${r.failed ? `, δεν βρέθηκαν ${r.failed}` : ""} · απομένουν ${r.left}.`);
        })}>
          <MapPinned className={`size-4 ${pending ? "animate-pulse" : ""}`} aria-hidden /> Γεωκωδικοποίηση ({ungeocoded}, ανά 20)
        </button>
      )}
      {msg && <p role="status" className="m-0 basis-full text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</p>}
    </div>
  );
}
