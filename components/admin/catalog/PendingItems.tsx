"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleAlert, EyeOff, Globe, Images, Loader2, Lock, Pencil, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { approveItems, applyPendingCategories, discardItems, editItem, resolveSpecGaps, specGaps, suggestPendingCategories } from "@/app/admin/(shell)/catalog/templates/nea-eidi/actions";
import { CategoryProposals } from "@/components/admin/catalog/CategoryProposals";
import { SpecGapsPanel, type GapChoice } from "@/components/admin/catalog/SpecGapsPanel";
import type { SpecGap } from "@/lib/catalog/foreign-import/pending";
import type { CatGuess } from "@/lib/catalog/category-ai-core";
import { CardPeek } from "@/components/admin/catalog/CardPeek";
import type { Settings } from "@/lib/cms/settings";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";

export type PendingView = {
  id: string; status: string; code: string; name: string; rowNo: number; file: string | null;
  brandId: string | null; brandName: string | null; groupId: number | null; groupName: string | null; category: string | null;
  cost: number | null; rrp: number | null; price: number | null; photos: number; missing: string[];
  /** οι διευθύνσεις των φωτογραφιών του (για την κάρτα του eshop) */
  images?: string[];
  mtrl: number | null; error: string | null; updatedAt: string;
  /** μονάδα μέτρησης που θα μπει στο SoftOne: δική του (αρχείο ή φόρμα) ή του αδελφού είδους της ομάδας */
  unit: { id: string | null; label: string | null; from: "own" | "sibling" | null };
  /** πεδία ERP που θα μπουν στο SoftOne: δική του επιλογή (id) ή του αδελφού είδους */
  erp: { supplier: ErpRef; busUnit: ErpRef; acn: ErpRef; fee: ErpRef };
};
/** `id` = δική του επιλογή (αριθμός SoftOne ή ποσό)· null = όπως το παρόμοιο είδος, με `label` την τιμή εκείνου αν διαβάστηκε */
export type ErpRef = { id: string | null; label: string | null; from: "own" | "sibling" | null };
export type ErpOpts = { suppliers: PickOpt[]; busUnits: PickOpt[]; acns: PickOpt[] };
const ERP_ROWS = [["supplier", "Προμηθευτής"], ["busUnit", "Business unit"], ["acn", "Λογ. κατηγορία"], ["fee", "Φόρος ανακύκλωσης"]] as const;

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const danger = `${btn} border-2 border-eu-red/60 text-eu-red hover:bg-eu-red/10`;
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)]";
const eur = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(n));
const OPEN = new Set(["pending", "error"]);
const APPROVE_BATCH = 5;

type Result = { ok: boolean; text: string; code: string };

/** Λίστα νέων ειδών σε αναμονή: επιλογή, επεξεργασία, έγκριση (κλειδωμένη με εξήγηση) και απόρριψη. */
/** `onChanged`: ο οδηγός εισαγωγής κρατά τη λίστα στον browser και την ξαναφορτώνει μόνος του (η σελίδα «Νέα είδη» αρκείται στο refresh). */
export function PendingItems({ items, status, writeOn, canWrite, canApprove, brands, groups, units = [], erpOpts, onChanged, flagOn = false, settings }: { items: PendingView[]; status: string; writeOn: boolean; canWrite: boolean; canApprove: boolean; brands: PickOpt[]; groups: PickOpt[]; /** μονάδες μέτρησης με σύνδεση στο SoftOne */ units?: PickOpt[]; /** προμηθευτές, business units, λογιστικές κατηγορίες */ erpOpts?: ErpOpts; onChanged?: () => void; /** η εγγραφή της «Εξαίρεσης Web» στο SoftOne είναι ενεργή */ flagOn?: boolean; /** με αυτό κάθε είδος δείχνει την κάρτα του όπως στο site */ settings?: Settings }) {
  const nav = useRouter();
  const router = { refresh: () => { nav.refresh(); onChanged?.(); } };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<{ done: number; total: number; what: "approve" | "discard" } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** πώς θα δημιουργηθούν τα είδη που εγκρίνονται τώρα: με «Εξαίρεση Web» και ενεργά (προεπιλογή) ή για το web, ανενεργά */
  const [excluded, setExcluded] = useState(true);
  /** χαρακτηριστικά των προς έγκριση ειδών που λείπουν από την ομάδα τους στο SoftOne — περιμένουν απόφαση */
  const [gaps, setGaps] = useState<{ list: PendingView[]; rows: SpecGap[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [gapBusy, setGapBusy] = useState(false);
  /** ποιανού είδους η κάρτα eshop είναι ανοιχτή (μία τη φορά) */
  const [peek, setPeek] = useState<string | null>(null);
  /** προτάσεις κατηγορίας του AI που περιμένουν αποδοχή */
  const [ai, setAi] = useState<{ guesses: CatGuess[]; asked: number; left: number; options: { id: string; name: string }[] } | null>(null);
  const [aiBusy, setAiBusy] = useState<"ask" | "apply" | null>(null);

  const open = (p: PendingView) => OPEN.has(p.status) && p.mtrl == null;
  const selectable = items.filter(open);
  const lock = !writeOn ? "Η έγκριση είναι κλειδωμένη: οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne). Μπορείς να διορθώνεις στοιχεία ή να απορρίπτεις." : !canApprove ? "Για έγκριση χρειάζονται τα δικαιώματα «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : null;
  const chosen = items.filter((p) => sel.has(p.id) && open(p));
  const ready = chosen.filter((p) => !p.missing.length);

  // Πρόταση κατηγορίας: για τα επιλεγμένα, αλλιώς για όσα ανοιχτά δεν έχουν ομάδα χαρακτηριστικών (αυτό τα κρατά πίσω)
  const aiTargets = (chosen.length ? chosen : selectable.filter((p) => p.groupId == null)).map((p) => p.id);
  const askAi = async () => {
    if (!aiTargets.length) return;
    setErr(null); setAi(null); setAiBusy("ask");
    let r;
    try { r = await suggestPendingCategories(aiTargets); } catch { r = { error: "Η σύνδεση διακόπηκε." }; }
    setAiBusy(null);
    if ("error" in r) { setErr(r.error); return; }
    setAi(r);
  };
  const applyAi = async (picks: { key: string; categoryId: string }[]) => {
    if (!ai) return;
    setAiBusy("apply"); setErr(null);
    let r;
    try { r = await applyPendingCategories(picks.map((p) => ({ id: p.key, categoryId: p.categoryId }))); } catch { r = { error: "Η σύνδεση διακόπηκε." }; }
    setAiBusy(null);
    if ("error" in r) { setErr(r.error); return; }
    if (r.errors.length) setErr(r.errors.join(" · "));
    setAi(null); setSel(new Set()); router.refresh();
  };

  const toggle = (id: string) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const codeOf = (id: string) => items.find((p) => p.id === id)?.code || "—";

  /** Πρώτα ο έλεγχος χαρακτηριστικών: ό,τι λείπει από την ομάδα του SoftOne το αποφασίζει ο χρήστης πριν δημιουργηθεί οτιδήποτε. */
  const approve = async (list: PendingView[]) => {
    if (lock || !list.length) return;
    setErr(null); setChecking(true);
    let g; try { g = await specGaps(list.map((p) => p.id)); } catch (e) { g = { error: (e as Error).message || "Η σύνδεση διακόπηκε." }; }
    setChecking(false);
    if ("error" in g) { setErr(g.error); return; }
    if (g.length) { setGaps({ list, rows: g }); return; }
    await run(list);
  };
  const confirmGaps = async (choices: GapChoice[]) => {
    if (!gaps) return;
    const { list } = gaps;
    setGapBusy(true);
    let r; try { r = await resolveSpecGaps(list.map((p) => p.id), choices); } catch (e) { r = { error: (e as Error).message || "Η σύνδεση διακόπηκε." }; }
    setGapBusy(false);
    if ("error" in r) { setErr(r.error); return; }
    if (r.errors.length) { setErr(`Κάποια χαρακτηριστικά δεν δημιουργήθηκαν στο SoftOne: ${r.errors.join(" · ")} Η έγκριση δεν ξεκίνησε.`); return; }
    setGaps(null);
    await run(list);
  };
  const run = async (list: PendingView[]) => {
    if (lock || !list.length) return;
    if (!confirm(`Δημιουργία ${list.length} ${list.length === 1 ? "είδους" : "ειδών"} στο SoftOne, με τιμή web και φωτογραφίες — ${excluded ? "ενεργά, με «Εξαίρεση Web»: ΔΕΝ θα ανεβαίνουν στο site" : "ανενεργά, για το web: θα φαίνονται στο site όταν τα ενεργοποιήσεις"}. Συνέχεια;`)) return;
    setErr(null); setBusy({ done: 0, total: list.length, what: "approve" });
    for (let i = 0; i < list.length; i += APPROVE_BATCH) {
      const part = list.slice(i, i + APPROVE_BATCH).map((p) => p.id);
      let res;
      try { res = await approveItems(part, excluded); } catch (e) { res = { error: (e as Error).message || "Η σύνδεση διακόπηκε." }; }
      if ("error" in res) { setErr(`${res.error}${i ? " — όσα εγκρίθηκαν μέχρι εδώ έμειναν." : ""}`); break; }
      setResults((prev) => ({ ...prev, ...Object.fromEntries(res.map((r) => [r.id, { ok: r.ok, code: codeOf(r.id), text: r.ok ? `Δημιουργήθηκε στο SoftOne (MTRL ${r.mtrl}).${r.error ? ` Σημείωση: ${r.error}` : ""}` : r.error ?? "Απέτυχε." }])) }));
      setBusy({ done: Math.min(i + APPROVE_BATCH, list.length), total: list.length, what: "approve" });
    }
    setBusy(null); setSel(new Set()); router.refresh();
  };
  const discard = async (list: PendingView[]) => {
    if (!list.length) return;
    if (!confirm(`Απόρριψη ${list.length} ${list.length === 1 ? "είδους" : "ειδών"}; Δεν δημιουργούνται και φεύγουν από τη λίστα αναμονής (μένουν στις «Απορρίφθηκαν»).`)) return;
    setErr(null); setBusy({ done: 0, total: list.length, what: "discard" });
    try {
      const r = await discardItems(list.map((p) => p.id));
      setResults((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.id, { ok: true, code: p.code || "—", text: "Απορρίφθηκε." }])) }));
      if (r.count < list.length) setErr(`Απορρίφθηκαν ${r.count} από ${list.length} — τα υπόλοιπα άλλαξαν κατάσταση στο μεταξύ.`);
    } catch (e) { setErr((e as Error).message || "Η απόρριψη απέτυχε."); }
    setBusy(null); setSel(new Set()); router.refresh();
  };

  const done = Object.values(results);
  const failed = done.filter((r) => !r.ok);

  return (
    <div className="grid gap-3 min-w-0">
      {lock && OPEN.has(status) && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><Lock className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{lock}</p>}
      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {done.length > 0 && !busy && (
        <div role="status" className="grid gap-1 rounded-xl border border-eu-line bg-white p-3 text-[length:var(--fs-13)]">
          <span className="font-bold text-eu-ink">{done.length - failed.length} ολοκληρώθηκαν{failed.length ? ` · ${failed.length} απέτυχαν` : ""}</span>
          {failed.slice(0, 20).map((r, i) => <span key={i} className="flex gap-1.5 items-start text-eu-red [overflow-wrap:anywhere]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden /><strong>{r.code}:</strong> {r.text}</span>)}
        </div>
      )}

      {OPEN.has(status) && canWrite && (
        <div data-help="pending.approve" className="flex flex-wrap items-center gap-2 rounded-xl bg-eu-surface p-2 min-w-0">
          <label className="inline-flex items-center gap-2 px-2 min-h-11 md:min-h-9 cursor-pointer text-eu-ink-2 font-bold text-[length:var(--fs-14)]">
            <input type="checkbox" checked={!!selectable.length && selectable.every((p) => sel.has(p.id))} disabled={!selectable.length || !!busy}
              onChange={(e) => setSel(e.target.checked ? new Set(selectable.map((p) => p.id)) : new Set())} className="size-5 accent-eu-navy" />
            Όλα ({chosen.length}/{selectable.length})
          </label>
          <button type="button" className={primary} disabled={!!lock || !ready.length || !!busy || checking || !!gaps} onClick={() => approve(ready)} title={lock ?? undefined}>
            {busy?.what === "approve" || checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />} Έγκριση {ready.length || ""}
          </button>
          <button type="button" className={danger} disabled={!chosen.length || !!busy} onClick={() => discard(chosen)}>
            {busy?.what === "discard" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Απόρριψη {chosen.length || ""}
          </button>
          <fieldset data-help="pending.web" className="m-0 p-0 border-0 basis-full flex flex-wrap items-center gap-x-4 gap-y-1 px-2 min-w-0 text-[length:var(--fs-14)]">
            <legend className="float-left mr-3 font-bold text-eu-ink-2">Τα είδη που εγκρίνεις:</legend>
            <label className="inline-flex items-center gap-2 min-h-11 md:min-h-9 cursor-pointer"><input type="radio" name="pending-web" checked={!excluded} disabled={!!busy} onChange={() => setExcluded(false)} className="size-5 accent-eu-navy" /><Globe className="size-4 text-eu-blue" aria-hidden />Για το web (ανενεργά μέχρι να τα ενεργοποιήσεις)</label>
            <label className="inline-flex items-center gap-2 min-h-11 md:min-h-9 cursor-pointer"><input type="radio" name="pending-web" checked={excluded} disabled={!!busy} onChange={() => setExcluded(true)} className="size-5 accent-eu-navy" /><EyeOff className="size-4 text-eu-ink-3" aria-hidden />Ενεργά με «Εξαίρεση Web» (δεν ανεβαίνουν στο site)</label>
            {excluded && !flagOn && <span className="basis-full flex gap-1.5 items-start text-eu-ink text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-eu-navy" aria-hidden />Η εγγραφή της «Εξαίρεσης Web» στο SoftOne δεν έχει ενεργοποιηθεί ακόμη: τα είδη θα δημιουργηθούν και θα πρέπει να την τσεκάρεις εσύ στο SoftOne. Θα το γράφει η σημείωση κάθε είδους.</span>}
          </fieldset>
          <button type="button" data-help="pending.category-ai" className={secondary} disabled={!aiTargets.length || !!busy || !!aiBusy} onClick={askAi}
            title={chosen.length ? "Προτάσεις για τα επιλεγμένα είδη" : "Προτάσεις για όσα είδη δεν έχουν ομάδα χαρακτηριστικών"}>
            {aiBusy === "ask" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {aiBusy === "ask" ? "Ρωτάω το AI…" : `Πρότεινε κατηγορία ${aiTargets.length || ""}`}
          </button>
          {chosen.length > ready.length && <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{chosen.length - ready.length} επιλεγμένα δεν εγκρίνονται ακόμη — τους λείπουν στοιχεία.</span>}
          {busy && <progress value={busy.done} max={busy.total || 1} aria-label="Πρόοδος" className="basis-full w-full h-2 appearance-none rounded-full overflow-hidden bg-eu-line [&::-webkit-progress-bar]:bg-eu-line [&::-webkit-progress-value]:bg-eu-navy [&::-moz-progress-bar]:bg-eu-navy" />}
        </div>
      )}

      {gaps && <SpecGapsPanel key={gaps.rows.map((r) => `${r.groupS1Id}:${r.label}`).join()} rows={gaps.rows} count={gaps.list.length} busy={gapBusy} onCancel={() => setGaps(null)} onConfirm={confirmGaps} />}
      {ai && (
        <CategoryProposals key={ai.guesses.map((g) => g.key).join()} asked={ai.asked} left={ai.left} busy={aiBusy === "apply"} onClose={() => setAi(null)} onApply={applyAi} options={ai.options}
          rows={ai.guesses.map((g) => { const p = items.find((x) => x.id === g.key); return { key: g.key, label: p?.name || p?.code || "—", sub: [p?.code, p?.brandName].filter(Boolean).join(" · "), categoryId: g.categoryId, sure: g.sure }; })} />
      )}

      <ul data-help="pending.list" className="m-0 p-0 list-none grid gap-2">
        {items.map((p) => {
          const res = results[p.id];
          const can = open(p);
          return (
            <li key={p.id} className={`rounded-xl border bg-white p-3 grid gap-2 min-w-0 ${res ? (res.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
              <div className="flex items-start gap-2 min-w-0">
                {OPEN.has(status) && canWrite && <input type="checkbox" checked={sel.has(p.id)} disabled={!can || !!busy} onChange={() => toggle(p.id)} aria-label={`Επιλογή ${p.code || p.name}`} className="size-5 mt-0.5 accent-eu-navy shrink-0" />}
                <div className="grid gap-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-15)] min-w-0 [overflow-wrap:anywhere]">{p.name || <span className="text-eu-muted font-normal">(χωρίς όνομα)</span>}</span>
                    {p.code && <span className={`${chip} bg-eu-surface text-eu-ink-2 min-w-0 break-all`}>{p.code}</span>}
                    {p.mtrl != null && <span className={`${chip} bg-eu-green/12 text-eu-ink`}>MTRL {p.mtrl}</span>}
                  </div>
                  <dl className="m-0 grid gap-x-4 gap-y-0.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr))] text-[length:var(--fs-13)]">
                    <div className="min-w-0"><dt className="inline text-eu-muted">Μάρκα: </dt><dd className="inline m-0 text-eu-ink [overflow-wrap:anywhere]">{p.brandName ?? "—"}</dd></div>
                    <div className="min-w-0"><dt className="inline text-eu-muted">Ομάδα: </dt><dd className="inline m-0 text-eu-ink [overflow-wrap:anywhere]">{p.groupName ?? "—"}</dd></div>
                    <div data-help="pending.unit" className="min-w-0"><dt className="inline text-eu-muted">Μονάδα: </dt><dd className="inline m-0 text-eu-ink [overflow-wrap:anywhere]">{p.unit.label ? <><b>{p.unit.label}</b> <span className="text-eu-muted">{p.unit.from === "own" ? "· επιλογή" : "· όπως παρόμοιο είδος"}</span></> : <span className="text-eu-amber font-semibold">ορίζεται μόλις μπει ομάδα</span>}</dd></div>
                    <div data-help="pending.erp" className="min-w-0 col-span-full flex flex-wrap gap-x-3 gap-y-0.5">{ERP_ROWS.map(([k, l]) => { const r = p.erp[k]; return (
                      <span key={k} className="min-w-0 [overflow-wrap:anywhere]"><span className="text-eu-muted">{l}: </span>{r.label ? <><b className="text-eu-ink">{r.label}</b>{r.from === "own" && <span className="text-eu-muted"> · επιλογή</span>}</> : r.from === "sibling" ? <span className="text-eu-ink-2">όπως παρόμοιο είδος</span> : <span className="text-eu-amber font-semibold">ορίζεται μόλις μπει ομάδα</span>}</span>); })}
                      {(["supplier", "busUnit", "acn", "fee"] as const).some((k) => p.erp[k].from === "sibling" && p.erp[k].label) && <span className="text-eu-muted">(χωρίς «επιλογή» = από το πιο πρόσφατο είδος της ίδιας ομάδας)</span>}</div>
                    <div className="min-w-0"><dt className="inline text-eu-muted">Τιμή web: </dt><dd className="inline m-0 text-eu-ink tabular-nums">{eur(p.price)}</dd>{p.cost != null && <span className="text-eu-muted tabular-nums"> · κόστος {eur(p.cost)}</span>}{p.rrp != null && <span className="text-eu-muted tabular-nums"> · ΤΛΤ {eur(p.rrp)}</span>}</div>
                    <div className="min-w-0 inline-flex items-center gap-1 text-eu-ink-2"><Images className="size-3.5" aria-hidden /> {p.photos} πολυμέσα</div>
                    {p.category && <div className="min-w-0"><dt className="inline text-eu-muted">Κατηγορία αρχείου: </dt><dd className="inline m-0 text-eu-ink [overflow-wrap:anywhere]">{p.category}</dd></div>}
                    {p.file && <div className="min-w-0 text-eu-muted [overflow-wrap:anywhere]">{p.file} · γραμμή {p.rowNo}</div>}
                  </dl>
                  {can && (p.missing.length ? (
                    <p data-help="pending.missing" className="m-0 flex flex-wrap gap-1 items-center text-[length:var(--fs-13)]"><span className="text-eu-ink-3">Τι λείπει:</span>{p.missing.map((m) => <span key={m} className={`${chip} bg-eu-red/10 text-eu-red`}>{m}</span>)}</p>
                  ) : <p className="m-0 inline-flex gap-1 items-center text-eu-ink-2 text-[length:var(--fs-13)]"><Check className="size-3.5 text-eu-green" aria-hidden /> Έτοιμο για έγκριση</p>)}
                  {p.error && <p className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] [overflow-wrap:anywhere] ${p.status === "created" ? "text-eu-ink-3" : "text-eu-red"}`}>{p.status === "created" ? <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}{p.status === "created" ? `Σημείωση: ${p.error}` : p.error}</p>}
                  {res && <p className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] [overflow-wrap:anywhere] ${res.ok ? "text-eu-ink" : "text-eu-red"}`}>{res.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}{res.text}</p>}
                </div>
              </div>
              {can && canWrite && (
                <div className="flex flex-wrap gap-2 border-t border-eu-line pt-2">
                  <button type="button" className={secondary} disabled={!!busy} onClick={() => setEditing(editing === p.id ? null : p.id)} aria-expanded={editing === p.id}><Pencil className="size-4" aria-hidden /> Επεξεργασία</button>
                  <button type="button" className={primary} disabled={!!lock || !!p.missing.length || !!busy} onClick={() => approve([p])} title={lock ?? (p.missing.length ? `Λείπουν: ${p.missing.join(", ")}` : undefined)}><ShieldCheck className="size-4" aria-hidden /> Έγκριση</button>
                  <button type="button" data-help="pending.discard" className={danger} disabled={!!busy} onClick={() => discard([p])}><Trash2 className="size-4" aria-hidden /> Απόρριψη</button>
                </div>
              )}
              {settings && <CardPeek open={peek === p.id} onToggle={() => setPeek(peek === p.id ? null : p.id)} settings={settings}
                data={{ key: p.id, title: p.name || p.code, sku: p.code, brand: p.brandName ?? "", images: p.images ?? [], price: p.price }} notes={["Οι φωτογραφίες ανεβαίνουν μόλις δημιουργηθεί το είδος."]} />}
              {editing === p.id && <EditForm p={p} brands={brands} groups={groups} units={units} erpOpts={erpOpts} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />}
            </li>
          );
        })}
        {!items.length && <li className="rounded-xl border border-dashed border-eu-line-2 p-6 text-center text-eu-muted text-[length:var(--fs-14)]">{status === "pending" ? "Κανένα νέο είδος σε αναμονή. Τα νέα είδη έρχονται από την «Εισαγωγή από άλλο Excel»." : "Τίποτα σε αυτή την κατάσταση."}</li>}
      </ul>
    </div>
  );
}

function EditForm({ p, brands, groups, units, erpOpts, onDone, onCancel }: { p: PendingView; brands: PickOpt[]; groups: PickOpt[]; units: PickOpt[]; erpOpts?: ErpOpts; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(p.code);
  const [name, setName] = useState(p.name);
  const [brandId, setBrandId] = useState<string | null>(p.brandId);
  const [groupId, setGroupId] = useState<string | null>(p.groupId != null ? String(p.groupId) : null);
  const [price, setPrice] = useState(p.price != null ? String(p.price).replace(".", ",") : "");
  const [unitId, setUnitId] = useState<string | null>(p.unit.id);
  const [supplier, setSupplier] = useState<string | null>(p.erp.supplier.id);
  const [busUnit, setBusUnit] = useState<string | null>(p.erp.busUnit.id);
  const [acn, setAcn] = useState<string | null>(p.erp.acn.id);
  const [fee, setFee] = useState(p.erp.fee.id != null ? p.erp.fee.id.replace(".", ",") : "");
  const like = (r: ErpRef, what: string) => (r.from === "sibling" && r.label ? `Όπως παρόμοιο είδος (${r.label})` : `Όπως παρόμοιο είδος — ${what}`);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await editItem(p.id, { code, name, brandId, specGroupS1Id: groupId != null ? Number(groupId) : null, price, unitId, erp: erpOpts ? { supplier, busUnit, acn, fee } : undefined });
      if (r.ok) onDone(); else setErr(r.error ?? "Δεν αποθηκεύτηκε.");
    } catch (e) { setErr((e as Error).message || "Δεν αποθηκεύτηκε."); } finally { setSaving(false); }
  };
  return (
    <form data-help="pending.edit" onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-3 rounded-xl bg-eu-surface p-3 min-w-0">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Κωδικός είδους</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={25} className={input} /><span className="text-eu-muted text-[length:var(--fs-12)]">Έως 25 χαρακτήρες, μοναδικός στο SoftOne.</span></label>
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Τιμή web (με ΦΠΑ)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="π.χ. 199,90" className={input} /><span className="text-eu-muted text-[length:var(--fs-12)]">Γράφεται στο SoftOne μόνο αν το είδος δεν έχει ήδη τιμή. Κενή = χωρίς τιμή.</span></label>
        <label className="grid gap-1 content-start min-w-0 sm:col-span-2"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Όνομα</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} className={input} /></label>
        <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μάρκα</span>
          <OptionPicker label="Μάρκα" options={brands} value={brandId} onChange={setBrandId} empty="Χωρίς μάρκα" /><span className="text-eu-muted text-[length:var(--fs-12)]">Πρέπει να είναι συνδεδεμένη με κατασκευαστή του SoftOne.</span></div>
        <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Ομάδα χαρακτηριστικών</span>
          <OptionPicker label="Ομάδα χαρακτηριστικών" options={groups} value={groupId} onChange={setGroupId} empty="Χωρίς ομάδα" /><span className="text-eu-muted text-[length:var(--fs-12)]">Ορίζει την κατηγορία στο site και ποια χαρακτηριστικά κρατιούνται.</span></div>
        {units.length > 0 && <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μονάδα μέτρησης</span>
          <OptionPicker label="Μονάδα μέτρησης" options={units} value={unitId} onChange={setUnitId} empty={p.unit.from === "sibling" && p.unit.label ? `Όπως παρόμοιο είδος (${p.unit.label})` : "Όπως παρόμοιο είδος της ομάδας"} /><span className="text-eu-muted text-[length:var(--fs-12)]">Πώς πωλείται και μετριέται στο SoftOne (τεμάχιο, σετ, κιλά…). Μετά τη δημιουργία αλλάζει μόνο μέσα στο SoftOne.</span></div>}
      </div>
      {erpOpts && <fieldset data-help="pending.erp-edit" className="m-0 grid gap-3 sm:grid-cols-2 border-0 border-t border-eu-line p-0 pt-3 min-w-0">
        <legend className="p-0 text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Στοιχεία SoftOne · κενό = όπως το παρόμοιο είδος</legend>
        <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Συνήθης προμηθευτής</span>
          <OptionPicker label="Συνήθης προμηθευτής" options={erpOpts.suppliers} value={supplier} onChange={setSupplier} empty={like(p.erp.supplier, "μόνο αν είναι ίδιας μάρκας")} /><span className="text-eu-muted text-[length:var(--fs-12)]">Από ποιον αγοράζεται συνήθως (π.χ. Samsung → SAMSUNG ELECTRONICS ΕΛΛΑΣ).</span></div>
        <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Business unit</span>
          <OptionPicker label="Business unit" options={erpOpts.busUnits} value={busUnit} onChange={setBusUnit} empty={like(p.erp.busUnit, "Λευκά, Μαύρα, Μικροσυσκευές…")} /><span className="text-eu-muted text-[length:var(--fs-12)]">Η εμπορική μονάδα στις αναφορές πωλήσεων του ERP.</span></div>
        <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Λογιστική κατηγορία</span>
          <OptionPicker label="Λογιστική κατηγορία" options={erpOpts.acns} value={acn} onChange={setAcn} empty={like(p.erp.acn, "συνήθως Εμπορεύματα")} /><span className="text-eu-muted text-[length:var(--fs-12)]">Σε ποιους λογαριασμούς πάνε αγορές και πωλήσεις. Σχεδόν όλα τα είδη: Εμπορεύματα.</span></div>
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Φόρος ανακύκλωσης (€ ανά τεμάχιο)</span>
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder={p.erp.fee.from === "sibling" && p.erp.fee.label ? `όπως παρόμοιο: ${p.erp.fee.label}` : "π.χ. 0,50"} className={input} /><span className="text-eu-muted text-[length:var(--fs-12)]">Μπαίνει σε κάθε παραστατικό του είδους. Κενό = όπως το παρόμοιο είδος· 0 = χωρίς φόρο.</span></label>
      </fieldset>}
      {err && <p role="alert" className="m-0 flex gap-1.5 items-start text-eu-red text-[length:var(--fs-13)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
        <button type="button" className={secondary} onClick={onCancel} disabled={saving}><X className="size-4" aria-hidden /> Ακύρωση</button>
      </div>
    </form>
  );
}
