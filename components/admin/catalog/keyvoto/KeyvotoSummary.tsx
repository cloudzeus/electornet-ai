"use client";

import { ArrowRight, Check, CircleAlert, EyeOff, HelpCircle, Layers, Loader2, PackageCheck, PackagePlus, SlidersHorizontal } from "lucide-react";
import type { KvStats } from "@/lib/catalog/xml-import/ui-core";
import type { MapStep } from "@/components/admin/catalog/xml/MappingSteps";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const n = (x: number) => x.toLocaleString("el-GR");

export interface SummaryQuestion { step: MapStep; text: string; action: string }

/**
 * Keyvoto, βήμα «Τι ήρθε»: η λήψη σε αριθμούς που λένε τι θα γίνει (πόσα προϊόντα, πόσα σετ, πόσα υπάρχουν ήδη, πόσα
 * είναι νέα), τι αναγνωρίστηκε χωρίς να ρωτηθεί ο χρήστης, και ΜΟΝΟ οι ερωτήσεις που θέλουν απάντηση. Η αναλυτική
 * αντιστοίχιση πεδίων μένει πίσω από το «Δες και άλλαξε όλα τα πεδία» — δεν είναι προαπαιτούμενο.
 */
export function KeyvotoSummary({ title, sourceNote, stats, understood, questions, blockers, busy, onOpen, onRun }: {
  title: string;
  sourceNote: string | null;
  stats: KvStats;
  /** τι αναγνωρίστηκε μόνο του, μία γραμμή το καθένα */
  understood: string[];
  questions: SummaryQuestion[];
  /** ό,τι εμποδίζει τη φόρτωση (π.χ. δύο στήλες στον ίδιο στόχο μετά από χειροκίνητη αλλαγή) */
  blockers: { step: MapStep; text: string }[];
  busy: boolean;
  onOpen: (step: MapStep) => void;
  onRun: () => void;
}) {
  const fresh = stats.products - stats.existing;
  const tiles: { label: string; value: number; hint: string; cls: string; Icon: typeof Layers }[] = [
    { label: "Προϊόντα", value: stats.products, hint: stats.sets ? `μαζί με ${n(stats.sets)} σετ` : "στη λήψη", cls: "bg-eu-surface/70 text-eu-ink", Icon: Layers },
    ...(stats.sets ? [{ label: "Σετ κλιματιστικών", value: stats.sets, hint: "εσωτερική + εξωτερική σε ένα", cls: "bg-eu-chip text-eu-navy", Icon: Layers }] : []),
    { label: "Υπάρχουν ήδη", value: stats.existing, hint: stats.excluded ? `${n(stats.existing - stats.excluded)} για το web · ${n(stats.excluded)} με «Εξαίρεση Web»` : "παίρνουν ό,τι τους λείπει", cls: "bg-eu-surface/70 text-eu-ink", Icon: PackageCheck },
    { label: "Νέα", value: fresh, hint: fresh ? "θα δημιουργηθούν, ανενεργά" : "κανένα νέο", cls: fresh ? "bg-eu-green/12 text-eu-ink" : "bg-eu-surface/70 text-eu-ink", Icon: PackagePlus },
  ];
  return (
    <section data-help="keyvoto.summary" className="rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-4 min-w-0" aria-labelledby="kv-sum">
      <div className="grid gap-1">
        <h3 id="kv-sum" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] [overflow-wrap:anywhere]">Τι ήρθε από {title}</h3>
        {sourceNote && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{sourceNote}</p>}
      </div>

      <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
        {tiles.map((t) => (
          <div key={t.label} className={`grid gap-0.5 rounded-lg px-3 py-2 ${t.cls}`}>
            <dt className="flex items-center gap-1.5 font-bold text-[length:var(--fs-13)]"><t.Icon className="size-4" aria-hidden />{t.label}</dt>
            <dd className="m-0 font-heading font-bold text-[length:var(--fs-24)] tabular-nums">{n(t.value)}</dd>
            <dd className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{t.hint}</dd>
          </div>
        ))}
      </dl>

      {stats.excluded > 0 && (
        <p data-help="keyvoto.web-excluded" className="m-0 flex gap-2 items-start rounded-lg bg-eu-surface px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
          <EyeOff className="size-4 text-eu-ink-2 shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0"><strong>{n(stats.excluded)} από τα υπάρχοντα έχουν «Εξαίρεση Web» στο SoftOne</strong> — δεν ανεβαίνουν στο site, γι&apos; αυτό μένουν εκτός εισαγωγής. Αν τα θέλεις κι αυτά, το ανοίγεις στη λίστα του επόμενου βήματος.</span>
        </p>
      )}

      <div className="grid gap-2 min-w-0">
        <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Τι κατάλαβα μόνος μου</h4>
        <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">
          {understood.map((u) => <li key={u} className="flex gap-2 items-start min-w-0"><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{u}</span></li>)}
        </ul>
      </div>

      <div className="grid gap-2 min-w-0">
        <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{questions.length || blockers.length ? "Θέλω την απάντησή σου" : "Δεν έχω καμία ερώτηση"}</h4>
        {!questions.length && !blockers.length && <p className="m-0 flex gap-2 items-start text-eu-ink text-[length:var(--fs-14)]"><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden />Όλα αντιστοιχίστηκαν. Μπορείς να προχωρήσεις στον έλεγχο.</p>}
        {blockers.map((b) => (
          <div key={b.text} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-eu-red/10 px-3 py-2 min-w-0">
            <span className="flex gap-2 items-start text-eu-ink text-[length:var(--fs-14)] min-w-0"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{b.text}</span></span>
            <button type="button" className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`} disabled={busy} onClick={() => onOpen(b.step)}>Διόρθωσέ το</button>
          </div>
        ))}
        {questions.map((q) => (
          <div key={q.text} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-eu-yellow/20 px-3 py-2 min-w-0">
            <span className="flex gap-2 items-start text-eu-ink text-[length:var(--fs-14)] min-w-0"><HelpCircle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{q.text}</span></span>
            <button type="button" className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`} disabled={busy} onClick={() => onOpen(q.step)}>{q.action}</button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy} onClick={() => onOpen("cols")}><SlidersHorizontal className="size-4" aria-hidden /> Δες και άλλαξε όλα τα πεδία</button>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-eu-muted text-[length:var(--fs-12)] max-w-[34ch]">Τίποτα δεν γράφεται ακόμη στο SoftOne ή στο eshop — πρώτα βλέπεις τη λίστα.</span>
          <button type="button" className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`} disabled={busy || blockers.length > 0} onClick={onRun}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Έλεγχος και εισαγωγή <ArrowRight className="size-4" aria-hidden />
          </button>
        </span>
      </div>
    </section>
  );
}
