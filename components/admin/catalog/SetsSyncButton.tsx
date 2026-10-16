"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { syncSetsAction } from "@/app/admin/(shell)/catalog/sets/actions";

/** Ανάγνωση των σετ από το SoftOne τώρα (αλλιώς γίνεται με τον προγραμματισμένο συγχρονισμό καταλόγου). */
export function SetsSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await syncSetsAction(); setMsg(r.ok ? `Διαβάστηκαν ${r.created + r.updated} σετ · ${r.stockUpdated} προϊόντα-σετ ενημερώθηκαν.` : r.error ?? "Η ανάγνωση απέτυχε."); if (r.ok) router.refresh(); })}
        className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-3 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-chip disabled:opacity-60 cursor-pointer">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {pending ? "Ανάγνωση σετ από SoftOne…" : "Ανάγνωση σετ από SoftOne"}
      </button>
      {msg && <span role="status" className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
    </div>
  );
}
