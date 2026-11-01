"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateInterest } from "@/app/admin/(shell)/synergates/actions";
import { INTEREST_STATUS } from "@/lib/partner-portal/interest-options";

/** Κατάσταση χειρισμού + εσωτερική σημείωση για μία εκδήλωση ενδιαφέροντος. */
export function InterestStatus({ id, status, adminNote }: { id: string; status: string; adminNote: string | null }) {
  const [s, setS] = useState(status);
  const [note, setNote] = useState(adminNote ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = s !== status || note !== (adminNote ?? "");
  const save = () => start(async () => {
    const r = await updateInterest(id, s, note);
    setMsg(r.ok ? { ok: true, text: "Αποθηκεύτηκε" } : { ok: false, text: r.error });
  });
  return (
    <div className="grid gap-2 min-w-0">
      <label htmlFor={`st-${id}`} className="font-bold text-eu-ink text-[length:var(--fs-13)]">Κατάσταση</label>
      <select id={`st-${id}`} value={s} onChange={(e) => { setS(e.target.value); setMsg(null); }} className="min-h-11 rounded-lg border border-eu-line bg-white px-3 text-[length:var(--fs-14)]">
        {Object.entries(INTEREST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <label htmlFor={`nt-${id}`} className="font-bold text-eu-ink text-[length:var(--fs-13)]">Σημείωση προσωπικού <span className="font-normal text-eu-ink-3">(δεν τη βλέπει ο ενδιαφερόμενος)</span></label>
      <textarea id={`nt-${id}`} rows={2} maxLength={2000} value={note} onChange={(e) => { setNote(e.target.value); setMsg(null); }} className="rounded-lg border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-14)]" placeholder="π.χ. μιλήσαμε 3/11, στέλνει στοιχεία SoftOne" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || pending} className="inline-flex items-center gap-2 min-h-11 rounded-full bg-eu-navy text-white px-4 font-bold text-[length:var(--fs-13)] disabled:opacity-45">{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}Αποθήκευση</button>
        {msg && <span role="status" className={`text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-emerald-800" : "text-[#b3261e]"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
