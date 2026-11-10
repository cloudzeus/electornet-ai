"use client";

import { useState } from "react";
import { Check, HelpCircle, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export interface Proposal { key: string; label: string; sub?: string; categoryId: string; sure: boolean }

/**
 * Οι προτάσεις κατηγορίας του AI, για αποδοχή: ίδια οθόνη σε κάθε δρόμο εισαγωγής. Τίποτα δεν εφαρμόζεται μόνο του — οι
 * «σίγουρες» είναι προεπιλεγμένες, οι «αβέβαιες» όχι (θέλουν το μάτι του χρήστη), και ό,τι δεν πήρε πρόταση μένει όπως ήταν.
 * Κάθε γραμμή έχει δική της επιλογή κατηγορίας: αν η πρόταση είναι λάθος, ο χρήστης διαλέγει τη σωστή επιτόπου — και η
 * γραμμή τσεκάρεται μόνη της, γιατί πια είναι δική του απόφαση.
 */
export function CategoryProposals({ rows, options = [], asked, left, busy, onApply, onClose }: { rows: Proposal[]; /** οι κατηγορίες από τις οποίες διαλέγει ο χρήστης όταν διορθώνει */ options: PickOpt[]; /** πόσα προϊόντα ρωτήθηκαν */ asked: number; /** πόσα έμειναν για επόμενο πάτημα */ left: number; busy: boolean; onApply: (picks: { key: string; categoryId: string }[]) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(rows.filter((r) => r.sure).map((r) => r.key)));
  /** η κατηγορία κάθε γραμμής τώρα: η πρόταση, ή αυτή που διάλεξε ο χρήστης στη θέση της */
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, r.categoryId])));
  const mine = (r: Proposal) => pick[r.key] !== r.categoryId;
  const choose = (r: Proposal, id: string | null) => {
    setPick((p) => ({ ...p, [r.key]: id ?? r.categoryId }));
    if (id) setSel((x) => new Set(x).add(r.key)); // διάλεξε ο ίδιος → μπαίνει στην εφαρμογή
  };
  const sure = rows.filter((r) => r.sure).length;
  const toggle = (k: string) => setSel((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  return (
    <div data-help="category.ai" role="region" aria-label="Προτάσεις κατηγορίας" className="grid gap-3 rounded-xl border-2 border-eu-blue/40 bg-white p-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]"><Sparkles className="size-4 text-eu-blue" aria-hidden />Προτάσεις κατηγορίας</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Ρώτησα για {asked} {asked === 1 ? "προϊόν" : "προϊόντα"}: {sure} σίγουρες, {rows.length - sure} αβέβαιες{asked - rows.length > 0 ? `, ${asked - rows.length} χωρίς πρόταση (δεν φάνηκε τι είναι — διάλεξε με το χέρι)` : ""}.{left > 0 ? ` Έμειναν ${left} — πάτα ξανά μετά την εφαρμογή.` : ""} Τίποτα δεν αλλάζει πριν πατήσεις «Εφαρμογή».</span>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Κλείσιμο προτάσεων" className={`${btn} px-3 text-eu-ink-3 hover:bg-eu-surface`}><X className="size-4" aria-hidden /></button>
      </div>
      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
            <span className="text-eu-ink-3">Επιλεγμένες: <strong className="text-eu-ink tabular-nums">{sel.size}</strong></span>
            <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set(rows.map((r) => r.key)))}>Όλες</button>
            <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set(rows.filter((r) => r.sure).map((r) => r.key)))}>Μόνο οι σίγουρες</button>
            <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set())}>Καμία</button>
          </div>
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {rows.map((r) => (
              <li key={r.key} className={`rounded-lg border p-2 grid gap-2 min-w-0 ${r.sure || mine(r) ? "border-eu-line" : "border-eu-yellow bg-eu-yellow/10"}`}>
                <label className="flex items-start gap-2 min-w-0 cursor-pointer min-h-11 md:min-h-9">
                  <input type="checkbox" checked={sel.has(r.key)} disabled={busy} onChange={() => toggle(r.key)} className="size-5 mt-0.5 accent-eu-navy shrink-0" />
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{r.label}{r.sub ? <span className="font-normal text-eu-muted text-[length:var(--fs-12)]"> · {r.sub}</span> : null}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${mine(r) ? "bg-eu-chip text-eu-navy" : r.sure ? "bg-eu-green/12 text-eu-ink" : "bg-eu-yellow/40 text-eu-ink"}`}>{mine(r) ? <Pencil className="size-3" aria-hidden /> : r.sure ? <Check className="size-3" aria-hidden /> : <HelpCircle className="size-3" aria-hidden />}{mine(r) ? "δική σου επιλογή" : r.sure ? "σίγουρη πρόταση" : "αβέβαιη πρόταση — έλεγξέ τη ή διάλεξε άλλη"}</span>
                  </span>
                </label>
                <div className="grid gap-1 min-w-0 pl-7">
                  <span className="text-eu-ink-2 font-bold text-[length:var(--fs-12)]">Κατηγορία</span>
                  <OptionPicker label={`Κατηγορία για ${r.label}`} options={options} value={pick[r.key] ?? null} onChange={(id) => choose(r, id)} empty="Η πρόταση του AI" />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`} disabled={busy || !sel.size} onClick={() => onApply([...sel].map((key) => ({ key, categoryId: pick[key] })).filter((x) => x.categoryId))}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Εφαρμογή {sel.size || ""}</button>
          </div>
        </>
      )}
    </div>
  );
}
