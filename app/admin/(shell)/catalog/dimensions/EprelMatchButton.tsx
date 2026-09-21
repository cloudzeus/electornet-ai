"use client";
import { useState, useTransition } from "react";
import { Loader2, Link2 } from "lucide-react";
import { runEprelMatch } from "../actions";

/** Τρέχει μία παρτίδα αντιστοίχισης με το EPREL και δείχνει τι βρέθηκε. */
export function EprelMatchButton({ disabled, pendingCount }: { disabled: boolean; pendingCount: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <div className="grid gap-2">
      <button type="button" disabled={disabled || busy || pendingCount === 0} onClick={() => start(async () => { const r = await runEprelMatch(60); setMsg({ ok: r.ok, text: r.ok ? `Ελέγχθηκαν ${r.checked}: ${r.matched} δέθηκαν, ${r.ambiguous} αμφίβολα, ${r.none} δεν βρέθηκαν · απομένουν ${r.remaining.toLocaleString("el-GR")}.` : `Σταμάτησε: ${r.error}` }); })}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-fit">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />} Αντιστοίχιση επόμενων 60
      </button>
      <p role="status" aria-live="polite" className={`m-0 text-[length:var(--fs-14)] ${msg ? (msg.ok ? "text-eu-ink" : "text-eu-red font-bold") : "sr-only"}`}>{msg?.text ?? ""}</p>
    </div>
  );
}
