"use client";
import { useState, useTransition } from "react";
import { DatabaseBackup, Loader2 } from "lucide-react";
import { backupNow } from "./actions";

export function BackupNow() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await backupNow(); setMsg(r.ok ? `Έγινε: ${((r.bytes ?? 0) / 1024).toFixed(0)} KB σε ${(r.ms / 1000).toFixed(1)} s${r.encrypted ? ", κρυπτογραφημένο" : ", ΧΩΡΙΣ κρυπτογράφηση"}${r.pruned ? `, διαγράφηκαν ${r.pruned} παλιά` : ""}.` : `Απέτυχε: ${r.error}`); })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <DatabaseBackup className="size-4" aria-hidden />} Backup τώρα
      </button>
      {msg && <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{msg}</span>}
    </div>
  );
}
