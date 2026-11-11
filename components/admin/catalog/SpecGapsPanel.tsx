"use client";

import { useState } from "react";
import { ListPlus, Loader2, ShieldCheck, X } from "lucide-react";
import type { SpecGap } from "@/lib/catalog/foreign-import/pending";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const CREATE = "\u0000create", SKIP = "\u0000skip";

export type GapChoice = { groupS1Id: number; label: string; action: "create" | "use" | "skip"; use?: string };

/**
 * Πριν από την έγκριση νέων ειδών: τα χαρακτηριστικά του αρχείου που δεν υπάρχουν στην ομάδα του SoftOne. Για καθένα ο
 * χρήστης αποφασίζει — είναι κάποιο υπάρχον (προτείνεται το πιο κοντινό), νέο χαρακτηριστικό στην ομάδα, ή αγνοείται.
 * Τίποτα δεν γράφεται στο SoftOne πριν πατήσει το κουμπί, που λέει πόσα νέα θα δημιουργηθούν.
 */
export function SpecGapsPanel({ rows, count, busy, onConfirm, onCancel }: { rows: SpecGap[]; /** πόσα είδη εγκρίνονται */ count: number; busy: boolean; onConfirm: (choices: GapChoice[]) => void; onCancel: () => void }) {
  const keyOf = (r: SpecGap) => `${r.groupS1Id}:${r.label}`;
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [keyOf(r), r.similar ?? CREATE])));
  const groups = [...new Set(rows.map((r) => r.groupS1Id))];
  const creating = rows.filter((r) => pick[keyOf(r)] === CREATE).length;
  const using = rows.filter((r) => ![CREATE, SKIP].includes(pick[keyOf(r)])).length;
  const setAll = (v: string) => setPick((p) => Object.fromEntries(rows.map((r) => [keyOf(r), r.similar ? p[keyOf(r)] : v])));
  const confirm = () => onConfirm(rows.map((r) => { const v = pick[keyOf(r)]; return { groupS1Id: r.groupS1Id, label: r.label, action: v === CREATE ? "create" : v === SKIP ? "skip" : "use", ...(v !== CREATE && v !== SKIP ? { use: v } : {}) }; }));
  return (
    <div data-help="pending.spec-gaps" role="region" aria-label="Χαρακτηριστικά που λείπουν από την ομάδα" className="grid gap-3 rounded-xl border-2 border-eu-blue/40 bg-white p-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]"><ListPlus className="size-4 text-eu-blue" aria-hidden />{rows.length} {rows.length === 1 ? "χαρακτηριστικό δεν υπάρχει" : "χαρακτηριστικά δεν υπάρχουν"} στην ομάδα του SoftOne</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Το SoftOne κρατά μόνο τα χαρακτηριστικά που έχει ορίσει η ομάδα του είδους. Διάλεξε για καθένα: είναι κάποιο που υπάρχει ήδη, να δημιουργηθεί νέο στην ομάδα (χωρίς φίλτρο στο site), ή να αγνοηθεί. Τίποτα δεν γράφεται πριν επιβεβαιώσεις.</span>
        </div>
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Ακύρωση έγκρισης" className={`${btn} shrink-0 px-3 text-eu-ink-3 hover:bg-eu-surface`}><X className="size-4" aria-hidden /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
        <span className="text-eu-ink-3">Όλα όσα δεν μοιάζουν με υπάρχον:</span>
        <button type="button" disabled={busy} onClick={() => setAll(CREATE)} className={`${btn} border border-eu-line text-eu-ink hover:bg-eu-surface`}>Νέα στην ομάδα</button>
        <button type="button" disabled={busy} onClick={() => setAll(SKIP)} className={`${btn} border border-eu-line text-eu-ink hover:bg-eu-surface`}>Να αγνοηθούν</button>
      </div>
      {groups.map((g) => {
        const mine = rows.filter((r) => r.groupS1Id === g);
        return (
          <fieldset key={g} className="m-0 p-0 border-0 grid gap-1 min-w-0">
            <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Ομάδα «{mine[0].groupName}»</legend>
            <ul className="m-0 p-0 list-none grid gap-1">
              {mine.map((r) => {
                const k = keyOf(r), v = pick[k];
                return (
                  <li key={k} className="grid gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] items-center rounded-lg border border-eu-line px-3 py-2 min-w-0">
                    <label htmlFor={`gap-${k}`} className="grid gap-0.5 min-w-0">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{r.label}</span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-13)] break-words">π.χ. «{r.sample}»{r.items > 1 ? ` · σε ${r.items} είδη` : ""}{r.similar ? ` · μοιάζει με «${r.similar}»` : ""}</span>
                    </label>
                    <select id={`gap-${k}`} value={v} disabled={busy} onChange={(e) => setPick((p) => ({ ...p, [k]: e.target.value }))}
                      className={`w-full min-w-0 rounded-lg border bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue ${v === CREATE ? "border-eu-blue text-eu-navy font-bold" : v === SKIP ? "border-eu-line text-eu-ink-3" : "border-eu-line text-eu-ink"}`}>
                      <option value={CREATE}>Νέο χαρακτηριστικό στο SoftOne</option>
                      <optgroup label="Είναι το υπάρχον…">{r.existing.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                      <option value={SKIP}>Να αγνοηθεί</option>
                    </select>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={confirm} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
          {creating ? `Δημιουργία ${creating} ${creating === 1 ? "νέου χαρακτηριστικού" : "νέων χαρακτηριστικών"} στο SoftOne και έγκριση` : "Συνέχεια στην έγκριση"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>Άκυρο</button>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{count} {count === 1 ? "είδος" : "είδη"} · {creating} νέα · {using} σε υπάρχοντα · {rows.length - creating - using} αγνοούνται</span>
      </div>
    </div>
  );
}
