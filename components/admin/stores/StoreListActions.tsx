"use client";

import { useState, useTransition } from "react";
import { RefreshCw, MapPinned } from "lucide-react";
import { syncFromSite, geocodeBatch } from "@/app/admin/(shell)/stores/actions";

export function StoreListActions({ pendingGeo, total }: { pendingGeo: number; total: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const btn = "inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {total === 0 && <button type="button" disabled={pending} onClick={() => start(async () => { const r = await syncFromSite(false); setMsg(r.ok ? `euronics.gr: ${r.total} καταστήματα, ${r.created} νέα, ${r.updated} ενημερώθηκαν.` : r.error); })} className={btn}><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> Αρχική εισαγωγή από euronics.gr</button>}
      <button type="button" disabled={pending || !pendingGeo} onClick={() => start(async () => { const r = await geocodeBatch(); setMsg(`Γεωκωδικοποιήθηκαν ${r.done}, απομένουν ${r.left}.`); })} className={btn}><MapPinned className="size-4" aria-hidden /> Γεωκωδικοποίηση {pendingGeo ? `(${pendingGeo})` : "✓"}</button>
      {msg && <span role="status" className="text-eu-ink-3 text-[length:var(--fs-14)]">{msg}</span>}
    </div>
  );
}
