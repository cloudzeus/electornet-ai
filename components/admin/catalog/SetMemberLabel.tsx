"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setMemberLabelAction } from "@/app/admin/(shell)/catalog/sets/actions";

/** Πώς βλέπει ο πελάτης ένα μέλος στο «Περιλαμβάνει» (κενό = το όνομα του ERP). Αποθήκευση με Enter ή όταν φεύγεις από το πεδίο. */
export function SetMemberLabel({ spcs, lineNum, initial, placeholder, canWrite }: { spcs: number; lineNum: number; initial: string | null; placeholder: string; canWrite: boolean }) {
  const [v, setV] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const save = () => { if (v.trim() === saved.trim()) return; start(async () => { const r = await setMemberLabelAction(spcs, lineNum, v); if (r.ok) { setSaved(r.label ?? ""); setOk(true); setTimeout(() => setOk(false), 1500); } }); };
  return (
    <span className="relative block min-w-0">
      <input value={v} disabled={!canWrite || pending} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder={placeholder} aria-label={`Όνομα στο site για: ${placeholder}`}
        className="w-full rounded-lg border border-eu-line bg-white px-3 pr-9 min-h-11 text-[length:var(--fs-14)] text-eu-ink placeholder:text-eu-muted disabled:bg-eu-surface" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2">{pending ? <Loader2 className="size-4 animate-spin text-eu-muted" aria-hidden /> : ok ? <Check className="size-4 text-eu-green" aria-label="Αποθηκεύτηκε" /> : null}</span>
    </span>
  );
}
