"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { syncSetsAction } from "@/app/admin/(shell)/catalog/sets/actions";

/** Ανάγνωση των sets από το SoftOne τώρα (αλλιώς γίνεται με τον προγραμματισμένο συγχρονισμό καταλόγου). */
export function SetsSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await syncSetsAction(); setMsg(r.ok ? `Διαβάστηκαν ${r.created + r.updated} sets · ${r.stockUpdated} προϊόντα άλλαξαν απόθεμα.` : r.error ?? "Η ανάγνωση απέτυχε."); })}
        className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-60 cursor-pointer">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {pending ? "Ανάγνωση από SoftOne…" : "Ανάγνωση από SoftOne"}
      </button>
      {msg && <span role="status" className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
    </div>
  );
}
