"use client";
import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Trash2, Image as ImageIcon } from "lucide-react";
import { syncKind, syncAll, clearRuns, findBrandLogos } from "./actions";

export function SyncButton({ kind, label = "Συγχρονισμός", small }: { kind?: string; label?: string; small?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () => start(async () => {
    if (kind) { const r = await syncKind(kind); setMsg(r.ok ? `${r.fetched} από SoftOne · ${r.created} νέα · ${r.updated} ενημερώθηκαν${r.missing ? ` · ${r.missing} λείπουν πια` : ""}${r.skipped ? ` · ${r.skipped} αγνοήθηκαν` : ""} · ${(r.ms / 1000).toFixed(1)} s` : `Σφάλμα: ${r.error}`); }
    else { const r = await syncAll(); const bad = r.filter((x) => !x.ok); setMsg(bad.length ? `Απέτυχαν: ${bad.map((x) => x.kind).join(", ")}` : `Όλοι οι πίνακες συγχρονίστηκαν (${r.length}).`); }
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={pending} className={`inline-flex items-center gap-1.5 rounded-full font-extrabold ${small ? "text-[length:var(--fs-13)] px-3 min-h-9 border-2 border-eu-navy text-eu-navy hover:bg-eu-chip" : "text-[length:var(--fs-14)] px-4 min-h-11 bg-eu-navy text-white hover:bg-eu-blue"} disabled:opacity-60`}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {pending ? "Συγχρονισμός…" : label}
      </button>
      {msg && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
    </span>
  );
}

/** Καθαρισμός ιστορικού συγχρονισμών (μόνο αποτυχημένα, ή παλαιότερα των 30 ημερών). */
export function ClearRunsButtons() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (mode: "failed" | "old") => start(async () => { const r = await clearRuns(mode); setMsg(`Διαγράφηκαν ${r.deleted} εγγραφές.`); });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => run("failed")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-13)] px-3 min-h-9 hover:border-eu-red hover:text-eu-red disabled:opacity-60">
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />} Καθαρισμός αποτυχημένων
      </button>
      <button type="button" onClick={() => run("old")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-13)] px-3 min-h-9 hover:border-eu-navy hover:text-eu-navy disabled:opacity-60">
        Παλαιότερα των 30 ημερών
      </button>
      {msg && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
    </span>
  );
}

/**
 * Αναζήτηση λογοτύπων μαρκών στο Brandfetch. Τρέχει σε παρτίδες επειδή η
 * υπηρεσία επιτρέπει 200 αναζητήσεις ανά 5 λεπτά· το κουμπί λέει πόσες
 * μάρκες απομένουν ώστε ο διαχειριστής να ξαναπατήσει.
 */
export function FindLogosButton({ pending: left }: { pending: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () => start(async () => {
    const r = await findBrandLogos();
    setMsg(r.ok
      ? `${r.matched} βρέθηκαν, ${r.unmatched} χωρίς σίγουρη αντιστοίχιση${r.remaining ? ` · απομένουν ${r.remaining}` : " · ολοκληρώθηκε"}.`
      : `${r.error}${r.matched ? ` (πρόλαβε ${r.matched})` : ""}`);
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={busy || left === 0} title="Αναζήτηση domain και λογοτύπου ανά μάρκα" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 min-h-9 hover:bg-eu-chip disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />} {busy ? "Αναζήτηση λογοτύπων…" : left ? `Εύρεση λογοτύπων (${left})` : "Λογότυπα: ολοκληρώθηκε"}
      </button>
      {msg && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</span>}
    </span>
  );
}
