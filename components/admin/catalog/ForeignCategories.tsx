"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Layers, Loader2, RefreshCw, Sparkles, Tag } from "lucide-react";
import { labelKey } from "@/lib/catalog/foreign-import/core";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";
import type { CategorySpecs } from "@/lib/catalog/foreign-import/server";

/** Μία πρόταση AI για μια γραμμή του αρχείου (ολόκληρο το φύλλο, όχι μόνο οι πρώτες γραμμές). */
export type AiGuess = { rowNo: number; label: string; categoryId: string; sure: boolean };
export type AiState = { guesses: AiGuess[]; asked: number; left: number; total: number } | { error: string } | "loading" | null;
export type CatMode = "ai" | "one";
export type Col = { i: number; letter: string; title: string; ex: string[] };

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

/** Πρόταση στήλης για κάθε χαρακτηριστικό: ίδιο όνομα με τον τίτλο της στήλης ή με την ετικέτα που της δόθηκε στην καρτέλα «Στήλες». */
export function suggestCatSpecs(specs: string[], cols: Col[], specLabels: Record<number, string>): Record<number, string> {
  const out: Record<number, string> = {}, taken = new Set<number>();
  for (const sp of specs) {
    const k = labelKey(sp);
    const c = cols.find((c) => !taken.has(c.i) && (labelKey(c.title) === k || labelKey(specLabels[c.i] ?? "") === k));
    if (c) { out[c.i] = sp; taken.add(c.i); }
  }
  return out;
}

type Group = { id: string; rows: AiGuess[]; fromColumn: boolean };

/**
 * Καρτέλα «Κατηγορίες και χαρακτηριστικά» του βήματος 2. Κάθε κατηγορία έχει τη δική της ομάδα χαρακτηριστικών, άρα και τη δική
 * της αντιστοίχιση: χαρακτηριστικό της κατηγορίας ← στήλη του Excel. Οι γραμμές παίρνουν κατηγορία είτε όλες μαζί είτε ανά προϊόν
 * με πρόταση AI που ο χρήστης διορθώνει.
 */
export function CategorySpecsTab(p: {
  mode: CatMode; onMode: (m: CatMode) => void;
  sheetCategoryId: string | null; onSheetCategory: (id: string | null) => void; catOpts: PickOpt[];
  /** κατηγορίες από στήλη κατηγορίας του αρχείου (όσες φαίνονται στις πρώτες γραμμές) */
  columnCats: string[];
  ai: AiState; onAsk: () => void; aiDisabled: string | null;
  rowCats: Record<number, string>; onRowCat: (rowNos: number[], id: string | null) => void;
  specInfo: CategorySpecs; cols: Col[];
  catSpecs: Record<string, Record<number, string>>; onCatSpec: (catId: string, col: number | null, spec: string) => void;
  /** στήλες που ήδη περνούν κάπου από την καρτέλα «Στήλες» (πεδίο, μάρκα, τιμή, σύνθετο…) */
  usedCols: Set<number>;
}) {
  const nameOf = (id: string) => p.specInfo[id]?.name ?? p.catOpts.find((o) => o.id === id)?.name ?? "…";
  const groups: Group[] = (() => {
    if (p.mode === "one") return p.sheetCategoryId ? [{ id: p.sheetCategoryId, rows: [], fromColumn: false }] : [];
    const by = new Map<string, AiGuess[]>();
    if (p.ai && typeof p.ai === "object" && "guesses" in p.ai) for (const g of p.ai.guesses) {
      const id = p.rowCats[g.rowNo];
      if (id) by.set(id, [...(by.get(id) ?? []), { ...g, categoryId: id, sure: g.sure && id === g.categoryId }]);
    }
    const out: Group[] = [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, rows]) => ({ id, rows, fromColumn: false }));
    for (const id of p.columnCats) if (!by.has(id)) out.push({ id, rows: [], fromColumn: true });
    return out;
  })();
  const unplaced = p.ai && typeof p.ai === "object" && "guesses" in p.ai ? p.ai.guesses.filter((g) => !p.rowCats[g.rowNo]) : [];

  return (
    <section data-help="foreign.categories" className="rounded-xl border border-eu-line bg-white min-w-0" aria-labelledby="f-cats">
      <div className="grid gap-3 p-3 md:p-4 border-b border-eu-line">
        <div className="grid gap-1">
          <h3 id="f-cats" className="m-0 font-heading font-semibold text-eu-ink text-[length:var(--fs-16)]">Σε ποια κατηγορία μπαίνει κάθε προϊόν</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[70ch]">Κάθε κατηγορία έχει τα δικά της χαρακτηριστικά, γι’ αυτό η αντιστοίχιση στηλών γίνεται <strong className="font-semibold text-eu-ink-2">ανά κατηγορία</strong>. Στο eshop περνά μόνο ό,τι αντιστοιχίσεις για την κατηγορία του κάθε προϊόντος.</p>
        </div>
        <div role="radiogroup" aria-label="Πώς ορίζεται η κατηγορία" className="grid gap-2 sm:grid-cols-2">
          {([
            ["ai", "Κάθε προϊόν στη δική του κατηγορία", "Το AI μαντεύει από όνομα και μάρκα, εσύ διορθώνεις", Sparkles],
            ["one", "Όλα στην ίδια κατηγορία", "Διαλέγεις μία και βλέπεις τα χαρακτηριστικά της", Tag],
          ] as const).map(([m, title, sub, Icon]) => (
            <button key={m} type="button" role="radio" aria-checked={p.mode === m} onClick={() => p.onMode(m)}
              className={`text-left rounded-lg px-3 py-2.5 min-h-11 flex gap-2.5 items-start transition-colors ${p.mode === m ? "border-2 border-eu-blue bg-eu-blue/5" : "border border-eu-line-2 hover:border-eu-blue"}`}>
              <Icon className={`size-4 shrink-0 mt-0.5 ${p.mode === m ? "text-eu-blue" : "text-eu-ink-3"}`} aria-hidden />
              <span className="grid gap-0.5 min-w-0"><span className="font-semibold text-eu-ink text-[length:var(--fs-14)]">{title}</span><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{sub}</span></span>
            </button>
          ))}
        </div>

        {p.mode === "one" && (
          <div className="grid gap-1 max-w-xl min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Κατηγορία για όλο το φύλλο</span>
            <OptionPicker label="Κατηγορία για όλο το φύλλο" options={p.catOpts} value={p.sheetCategoryId} onChange={p.onSheetCategory} empty="Καμία" /></div>
        )}

        {p.mode === "ai" && (
          <div data-help="foreign.categories-ai" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--fs-13)]">
            {p.ai === "loading" ? <span className="inline-flex items-center gap-2 text-eu-ink-2"><Loader2 className="size-4 animate-spin" aria-hidden />Το AI διαβάζει όλο το φύλλο… (λίγα δευτερόλεπτα ανά 40 προϊόντα)</span>
              : p.ai && "guesses" in p.ai ? <span className="inline-flex items-center gap-2 text-eu-ink-2"><Sparkles className="size-4 text-eu-blue" aria-hidden />Το AI πρότεινε κατηγορία για <strong className="font-semibold text-eu-ink tabular-nums">{p.ai.guesses.length} από {p.ai.total}</strong> προϊόντα · {groups.filter((g) => !g.fromColumn).length} {groups.length === 1 ? "κατηγορία" : "κατηγορίες"}{p.ai.left > 0 ? ` · ${p.ai.left} έμειναν για επόμενο πάτημα` : ""}</span>
              : <span className="text-eu-ink-2">Το AI προτείνει κατηγορία για κάθε προϊόν του φύλλου που δεν έχει ήδη από στήλη. Κάθε πάτημα έχει μικρό κόστος AI.</span>}
            {p.ai !== "loading" && <button type="button" className={`${secondary} sm:ml-auto`} onClick={p.onAsk} disabled={!!p.aiDisabled} title={p.aiDisabled ?? undefined}>{p.ai && typeof p.ai === "object" && "guesses" in p.ai ? <><RefreshCw className="size-4" aria-hidden />Ξαναρώτα</> : <><Sparkles className="size-4" aria-hidden />Μάντεψε κατηγορίες με AI</>}</button>}
            {p.aiDisabled && <span className="basis-full text-eu-ink-3">{p.aiDisabled}</span>}
            {p.ai && typeof p.ai === "object" && "error" in p.ai && <p role="alert" className="m-0 basis-full flex gap-2 items-start text-eu-red"><AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />{p.ai.error}</p>}
          </div>
        )}
      </div>

      {groups.length === 0 && (
        <p className="m-0 p-3 md:p-4 text-eu-ink-3 text-[length:var(--fs-13)]">{p.mode === "one" ? "Διάλεξε κατηγορία για να δεις τα χαρακτηριστικά της." : "Μόλις υπάρξουν προτάσεις, εδώ βγαίνει μία ομάδα ανά κατηγορία με τα χαρακτηριστικά της."}</p>
      )}
      <div className="grid gap-3 p-3 md:p-4 empty:hidden">
        {groups.map((g, gi) => <CategoryBlock key={g.id} g={g} open={gi === 0} name={nameOf(g.id)} info={p.specInfo[g.id]} cols={p.cols} map={p.catSpecs[g.id] ?? {}} onSpec={(col, sp) => p.onCatSpec(g.id, col, sp)} usedCols={p.usedCols} catOpts={p.catOpts} onRowCat={p.onRowCat} />)}
        {unplaced.length > 0 && <CategoryBlock g={{ id: "", rows: unplaced.map((r) => ({ ...r, categoryId: "" })), fromColumn: false }} open={false} name="Χωρίς κατηγορία" info={undefined} cols={p.cols} map={{}} onSpec={() => {}} usedCols={p.usedCols} catOpts={p.catOpts} onRowCat={p.onRowCat} />}
      </div>
    </section>
  );
}

function CategoryBlock({ g, open, name, info, cols, map, onSpec, usedCols, catOpts, onRowCat }: {
  g: Group; open: boolean; name: string; info: CategorySpecs[string] | undefined; cols: Col[]; map: Record<number, string>;
  onSpec: (col: number | null, spec: string) => void; usedCols: Set<number>; catOpts: PickOpt[]; onRowCat: (rowNos: number[], id: string | null) => void;
}) {
  const [showRows, setShowRows] = useState(false);
  /** επιλεγμένα προϊόντα για μαζική αλλαγή κατηγορίας (όπως στις προτάσεις κατηγορίας της προεπισκόπησης) */
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const picked = g.rows.filter((r) => sel.has(r.rowNo)).map((r) => r.rowNo);
  const toggle = (n: number) => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const move = (id: string | null) => { onRowCat(picked, id); setSel(new Set()); setMoveTo(null); };
  const colOf = (sp: string) => Object.entries(map).find(([, l]) => labelKey(l) === labelKey(sp))?.[0];
  const specs = info?.specs ?? [];
  const done = specs.filter((sp) => colOf(sp) != null).length;
  const mine = new Set(Object.keys(map).map(Number));
  const spare = cols.filter((c) => c.ex.length && !usedCols.has(c.i) && !mine.has(c.i));
  const unsure = g.rows.filter((r) => !r.sure).length;
  const none = !g.id;
  const ok = !none && (specs.length > 0 && done === specs.length || (spare.length === 0 && unsure === 0));
  return (
    <details open={open} className={`group rounded-lg min-w-0 ${ok ? "border border-eu-line" : "border-2 border-eu-amber/60"}`}>
      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 min-h-11 cursor-pointer list-none">
        <ChevronDown className="size-4 text-eu-ink-3 transition-transform group-open:rotate-180" aria-hidden />
        <span className="font-semibold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{name}</span>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{g.fromColumn ? "από τη στήλη κατηγορίας" : g.rows.length ? `${g.rows.length} ${g.rows.length === 1 ? "προϊόν" : "προϊόντα"}` : "όλο το φύλλο"}</span>
        {none && <span className="sm:ml-auto rounded-md bg-eu-amber/20 px-2 py-0.5 text-[length:var(--fs-12)] font-semibold text-eu-ink">παίρνουν την κατηγορία του βήματος 3, αν οριστεί</span>}
        {info && (specs.length ? (
          <span className={`sm:ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[length:var(--fs-12)] font-semibold tabular-nums ${ok ? "bg-eu-green/15 text-eu-ink" : "bg-eu-amber/20 text-eu-ink"}`}>
            {ok ? <Check className="size-3.5 text-eu-green" aria-hidden /> : <AlertTriangle className="size-3.5 text-eu-navy" aria-hidden />}{done} από {specs.length} χαρακτηριστικά έχουν στήλη{spare.length ? ` · ${spare.length} ${spare.length === 1 ? "στήλη περισσεύει" : "στήλες περισσεύουν"}` : ""}{unsure ? ` · ${unsure} αβέβαιες προτάσεις` : ""}
          </span>
        ) : <span className="sm:ml-auto rounded-md bg-eu-amber/20 px-2 py-0.5 text-[length:var(--fs-12)] font-semibold text-eu-ink">χωρίς ομάδα χαρακτηριστικών</span>)}
        {!info && !none && <Loader2 className="sm:ml-auto size-4 animate-spin text-eu-ink-3" aria-label="Φορτώνουν τα χαρακτηριστικά" />}
      </summary>
      <div className="grid gap-2 border-t border-eu-line px-3 py-2.5 min-w-0">
        {info && !specs.length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αυτή η κατηγορία δεν έχει ομάδα χαρακτηριστικών στο SoftOne, άρα νέα είδη δεν δημιουργούνται σε αυτή. Διάλεξε πιο συγκεκριμένη κατηγορία.</p>}
        {specs.length > 0 && (
          <>
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-3 text-eu-muted text-[length:var(--fs-12)]"><span>Χαρακτηριστικό κατηγορίας</span><span>Στήλη του Excel</span><span>Π.χ. τιμή</span></div>
            <ul className="m-0 p-0 list-none divide-y divide-eu-line min-w-0">
              {specs.map((sp) => {
                const c = colOf(sp), col = c != null ? cols.find((x) => x.i === Number(c)) : undefined;
                return (
                  <li key={sp} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-x-3 gap-y-1 items-center py-1.5 min-w-0">
                    <span className={`text-[length:var(--fs-14)] [overflow-wrap:anywhere] ${col ? "text-eu-ink" : "text-eu-ink-3"}`}>{sp}</span>
                    <select aria-label={`Στήλη για το χαρακτηριστικό ${sp}`} value={c ?? ""} onChange={(e) => onSpec(e.target.value === "" ? null : Number(e.target.value), sp)} className={input}>
                      <option value="">— καμία στήλη —</option>
                      {cols.map((x) => <option key={x.i} value={x.i}>{x.letter} · {x.title}{map[x.i] && labelKey(map[x.i]) !== labelKey(sp) ? ` (πάει σε «${map[x.i]}»)` : ""}</option>)}
                    </select>
                    <span className="text-eu-ink-3 text-[length:var(--fs-13)] truncate">{col ? (col.ex[0] ?? "κενή στις πρώτες γραμμές") : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {spare.length > 0 && specs.length > 0 && (
          <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-amber/10 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><Layers className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Με τιμές αλλά χωρίς θέση εδώ: {spare.map((x) => `${x.letter} «${x.title}»${x.ex[0] ? ` (${x.ex[0]})` : ""}`).join(", ")}. Αν κάποια είναι από τα παραπάνω χαρακτηριστικά, διάλεξέ τη· αλλιώς δεν περνά σε αυτή την κατηγορία.</span></p>
        )}
        {g.rows.length > 0 && (
          <div className="grid gap-2">
            <button type="button" className="justify-self-start inline-flex items-center gap-1 min-h-11 md:min-h-9 text-eu-blue font-semibold text-[length:var(--fs-13)] hover:underline" aria-expanded={showRows} onClick={() => setShowRows((v) => !v)}>
              <ChevronDown className={`size-4 transition-transform ${showRows ? "rotate-180" : ""}`} aria-hidden />{showRows ? "Κρύψε τα προϊόντα" : `Δες τα ${g.rows.length} προϊόντα`}{unsure ? ` · ${unsure} θέλουν ματιά` : ""}
            </button>
            {showRows && (
              <div data-help="foreign.categories-rows" className="grid gap-2 border-t border-eu-line pt-2 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
                  <span className="text-eu-ink-3">Επιλεγμένα: <strong className="text-eu-ink tabular-nums">{picked.length}</strong> από {g.rows.length}</span>
                  <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set(g.rows.map((r) => r.rowNo)))}>Όλα</button>
                  {unsure > 0 && <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set(g.rows.filter((r) => !r.sure).map((r) => r.rowNo)))}>Μόνο τα αβέβαια</button>}
                  <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setSel(new Set())}>Κανένα</button>
                </div>
                {picked.length > 0 && (
                  <div key="move" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] items-end rounded-lg bg-eu-blue/5 p-2.5 min-w-0">
                    <div className="grid gap-1 min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-12)]">Μετακίνηση {picked.length === 1 ? "του επιλεγμένου" : `των ${picked.length} επιλεγμένων`} σε κατηγορία</span>
                      <OptionPicker label="Νέα κατηγορία για τα επιλεγμένα" options={catOpts} value={moveTo} onChange={setMoveTo} empty="Διάλεξε κατηγορία" /></div>
                    <button type="button" className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`} disabled={!moveTo} onClick={() => move(moveTo)}><Check className="size-4" aria-hidden />Μετακίνησε {picked.length}</button>
                    {!none && <button type="button" className={secondary} onClick={() => move(null)}>Χωρίς κατηγορία</button>}
                  </div>
                )}
                <ul className="m-0 p-0 list-none divide-y divide-eu-line min-w-0">
                  {[...g.rows].sort((a, b) => Number(a.sure) - Number(b.sure)).map((r) => (
                    <li key={r.rowNo} className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] gap-x-3 gap-y-1 items-center py-1.5 min-w-0 ${sel.has(r.rowNo) ? "bg-eu-blue/5" : ""}`}>
                      <label className="flex items-center gap-2 min-w-0 min-h-11 md:min-h-9 cursor-pointer text-[length:var(--fs-13)]">
                        <input type="checkbox" checked={sel.has(r.rowNo)} onChange={() => toggle(r.rowNo)} className="size-5 accent-eu-navy shrink-0" aria-label={`Επιλογή γραμμής ${r.rowNo}`} />
                        <span className="font-mono text-eu-muted text-[length:var(--fs-12)] tabular-nums">{r.rowNo}</span>
                        <span className="text-eu-ink truncate">{r.label || "(χωρίς όνομα)"}</span>
                        {!r.sure && <span className="shrink-0 rounded-md bg-eu-amber/20 px-1.5 text-[length:var(--fs-12)] font-semibold text-eu-ink">αβέβαιο</span>}
                      </label>
                      <OptionPicker label={`Κατηγορία για τη γραμμή ${r.rowNo}`} options={catOpts} value={r.categoryId || null} onChange={(id) => onRowCat([r.rowNo], id)} empty="Χωρίς κατηγορία" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
