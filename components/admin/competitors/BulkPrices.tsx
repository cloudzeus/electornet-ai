"use client";
// Μαζική αλλαγή τιμής web: φίλτρα + κανόνας + δικλείδες → προεπισκόπηση (planRow στον server) → εφαρμογή/αναίρεση.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, RotateCcw, TrendingDown, X } from "lucide-react";
import { applyAction, previewAction, undoAction } from "@/app/admin/(shell)/catalog/competitors/prices/actions";
import { DEFAULT_RULE, SKIP, type Rule, type Skip } from "@/lib/competitors/bulk-core";
import type { BatchView, Filter, PreviewRow } from "@/lib/competitors/bulk";
import { eur, pct } from "@/lib/competitors/badge";

type Opt = { id: string; name: string };
type Props = {
  initialRows: PreviewRow[]; initialFilter: Filter; product: { id: string; title: string } | null;
  options: { categories: Opt[]; brands: Opt[] }; batches: BatchView[]; blockedReason: string | null; canRun: boolean; maxBatch: number;
};

const SOURCE: Record<string, string> = { "supplier-last": "τελ. τιμή προμηθευτή", purl: "τελ. τιμή αγοράς είδους" };
const ORDER: Skip[] = ["max-drop", "below-cost", "no-cost", "promo", "stale", "gone", "cheaper", "same"];
const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur(Math.abs(v))}`;
const parse = (s: string) => { const t = s.trim().replace(",", "."); return t === "" ? NaN : Number(t); };
const show = (n: number) => String(n).replace(".", ",");

const shell = "rounded-2xl border border-eu-line bg-white min-w-0";
const card = `${shell} p-4 md:p-5`;
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]";
const lbl = "font-bold text-eu-ink-2 text-[length:var(--fs-13)]";
const field = "min-h-11 w-full rounded-lg border border-eu-line-2 bg-white px-3 text-eu-ink text-[length:var(--fs-16)]";
const num = "min-h-11 rounded-lg border border-eu-line-2 bg-white px-3 text-center font-bold tabular-nums text-eu-ink text-[length:var(--fs-16)]";
const chk = "flex flex-wrap items-center gap-x-2.5 gap-y-1 min-h-11 text-eu-ink text-[length:var(--fs-14)]";
const box = "size-5 shrink-0 accent-eu-navy";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-bold text-[length:var(--fs-14)] disabled:cursor-not-allowed disabled:opacity-50";

export function BulkPrices({ initialRows, initialFilter, product, options, batches: initialBatches, blockedReason, canRun, maxBatch }: Props) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [amount, setAmount] = useState(show(DEFAULT_RULE.amount));
  const [mode, setMode] = useState<Rule["mode"]>(DEFAULT_RULE.mode);
  const [dropOn, setDropOn] = useState(true), [drop, setDrop] = useState(show(DEFAULT_RULE.maxDropPct!));
  const [marginOn, setMarginOn] = useState(true), [margin, setMargin] = useState(show(DEFAULT_RULE.minMarginPct!));
  const [skipPromo, setSkipPromo] = useState(DEFAULT_RULE.skipPromo), [raiseCheaper, setRaiseCheaper] = useState(DEFAULT_RULE.raiseCheaper);
  const [rows, setRows] = useState(initialRows);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState(initialBatches);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [loading, startPreview] = useTransition();
  const [busy, startWrite] = useTransition();

  const rule = useMemo((): Rule | null => {
    const a = parse(amount), d = parse(drop), m = parse(margin);
    if (!(a >= 0) || (mode === "pct" && a > 50) || (dropOn && !(d >= 0 && d <= 90)) || (marginOn && !(m >= 0 && m <= 500))) return null;
    return { mode, amount: a, maxDropPct: dropOn ? d : null, minMarginPct: marginOn ? m : null, skipPromo, maxAgeH: DEFAULT_RULE.maxAgeH, raiseCheaper };
  }, [amount, mode, drop, dropOn, margin, marginOn, skipPromo, raiseCheaper]);

  // ξαναϋπολογισμός σε κάθε αλλαγή (με μικρή αναμονή όσο γράφει)· όχι στην πρώτη φόρτωση
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!rule) return;
    const t = setTimeout(() => startPreview(async () => {
      const r = await previewAction(filter, rule);
      if (r.ok) { setRows(r.rows); setError(null); } else setError(r.error);
    }), 350);
    return () => clearTimeout(t);
  }, [filter, rule]);

  const changing = rows.filter((r) => "newPrice" in r.plan);
  const picked = changing.filter((r) => !off.has(r.productId));
  const total = Math.round(picked.reduce((s, r) => s + ("changeEur" in r.plan ? r.plan.changeEur : 0), 0) * 100) / 100;
  const avg = picked.length ? Math.round((picked.reduce((s, r) => s + ("changePct" in r.plan ? r.plan.changePct : 0), 0) / picked.length) * 10) / 10 : 0;
  const skipped = ORDER.map((k) => ({ k, n: rows.filter((r) => "skip" in r.plan && r.plan.skip === k).length })).filter((x) => x.n > 0);
  const out = rows.length - changing.length;
  const tooMany = picked.length > maxBatch;
  const why = blockedReason ?? (tooMany ? `Έως ${maxBatch} προϊόντα τη φορά — ξετσέκαρε μερικά ή στένεψε τα φίλτρα.` : !picked.length ? "Δεν υπάρχει επιλεγμένο προϊόν να αλλάξει." : !rule ? "Διόρθωσε τον κανόνα πρώτα." : null);

  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = picked.length === changing.length && changing.length > 0;
  const toggleAll = () => setOff(allOn ? new Set(changing.map((r) => r.productId)) : new Set());

  function apply() {
    if (why || !rule) return;
    if (!window.confirm(`Να γραφτούν ${picked.length} νέες τιμές web στο SoftOne; Συνολική αλλαγή ${signedEur(total)}. Αναιρούνται από το ιστορικό.`)) return;
    startWrite(async () => {
      const r = await applyAction(picked.map((p) => p.productId), rule);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      setBatches(r.batches);
      setDone({ tone: r.failed ? "warn" : "ok", text: `Άλλαξαν ${r.changed}${r.failed ? `, δεν άλλαξαν ${r.failed} (δες το ιστορικό)` : ""}. Θα φανεί στο eshop στον επόμενο συγχρονισμό (έως 30′).` });
      const p = await previewAction(filter, rule);
      if (p.ok) setRows(p.rows);
    });
  }
  function undo(id: string) {
    if (!window.confirm("Να γυρίσουν οι τιμές αυτής της παρτίδας στις προηγούμενες; Όσες άλλαξε στο μεταξύ κάποιος άλλος μένουν όπως είναι.")) return;
    startWrite(async () => {
      const r = await undoAction(id);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      setBatches(r.batches);
      setDone({ tone: r.failed ? "warn" : "ok", text: `Αναιρέθηκαν ${r.undone}${r.failed ? `, έμειναν ${r.failed} (άλλαξαν από άλλον ή απέτυχαν)` : ""}. Θα φανεί στο eshop στον επόμενο συγχρονισμό (έως 30′).` });
    });
  }

  const note = (r: PreviewRow) => "skip" in r.plan
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-amber/10 px-2.5 py-1 font-bold text-eu-ink text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5 shrink-0 text-eu-amber" aria-hidden />{SKIP[r.plan.skip].label}</span>
    : r.cost != null ? <span className="text-eu-muted text-[length:var(--fs-12)]">κόστος {eur(r.cost)} · {SOURCE[r.costSource ?? ""] ?? "κόστος"}</span> : null;
  const change = (r: PreviewRow) => "changeEur" in r.plan ? `${signedEur(r.plan.changeEur)} · ${pct(r.plan.changePct)}` : "—";
  const changeTone = (r: PreviewRow) => !("changeEur" in r.plan) ? "text-eu-muted" : r.plan.changeEur < 0 ? "font-bold text-eu-green" : "font-bold text-eu-blue";

  return (
    <div className="grid gap-5 min-w-0">
      {/* Φίλτρα */}
      <section data-help="bulk-filters" aria-label="Φίλτρα" className={`${card} grid gap-4`}>
        {product && filter.productId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-eu-ink text-[length:var(--fs-14)]">Μόνο το προϊόν: <b>{product.title}</b></span>
            <button type="button" onClick={() => setFilter({ onlyExpensive: true })} className={`${btn} border border-eu-line-2 bg-white text-eu-navy`}><X className="size-4" aria-hidden />Όλα τα προϊόντα</button>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
            <label className="grid gap-1.5"><span className={lbl}>Κατηγορία</span>
              <select className={field} value={filter.categoryId ?? ""} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value || undefined })}>
                <option value="">Όλες</option>{options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="grid gap-1.5"><span className={lbl}>Μάρκα</span>
              <select className={field} value={filter.brandId ?? ""} onChange={(e) => setFilter({ ...filter, brandId: e.target.value || undefined })}>
                <option value="">Όλες</option>{options.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="grid gap-1.5"><span className={lbl}>Ποια προϊόντα</span>
              <select className={field} value={filter.onlyExpensive ? "exp" : "all"} onChange={(e) => setFilter({ ...filter, onlyExpensive: e.target.value === "exp" })}>
                <option value="exp">Όπου είμαστε ακριβότεροι</option><option value="all">Όλα με ζευγάρι</option>
              </select></label>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-5">
        {/* Κανόνας */}
        <section data-help="bulk-rule" aria-label="Κανόνας" className={`${card} grid content-start gap-3.5 flex-[999_1_30rem]`}>
          <h3 className={h3}>Κανόνας</h3>
          <div className="flex flex-wrap items-center gap-2.5 font-bold text-eu-ink text-[length:var(--fs-16)]">
            <span>Νέα τιμή =</span>
            <span className="rounded-lg bg-eu-yellow/25 px-3.5 py-2.5 text-eu-navy">τιμή Κωτσόβολου</span>
            <span aria-hidden>−</span>
            <input className={`${num} w-28`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Ποσό κάτω από τον Κωτσόβολο" aria-invalid={!rule} />
            <select className={`${num} w-20`} value={mode} onChange={(e) => setMode(e.target.value as Rule["mode"])} aria-label="Ευρώ ή ποσοστό">
              <option value="eur">€</option><option value="pct">%</option>
            </select>
          </div>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Η τιμή προσφοράς του Κωτσόβολου, αν έχει. Στρογγυλοποίηση στο λεπτό. Γράφεται ως τιμή web στο SoftOne.</p>
          {!rule && <p role="alert" className="m-0 flex items-center gap-2 font-bold text-eu-red text-[length:var(--fs-13)]"><AlertTriangle className="size-4" aria-hidden />Έλεγξε τα ποσά: αριθμοί από 0 και πάνω (ποσοστό έως 50%, μείωση έως 90%).</p>}
        </section>

        {/* Δικλείδες */}
        <section data-help="bulk-guards" aria-label="Δικλείδες" className={`${card} grid content-start gap-1.5 flex-[1_1_22rem]`}>
          <h3 className={h3}>Δικλείδες</h3>
          <div className={chk}>
            <input id="g-drop" type="checkbox" className={box} checked={dropOn} onChange={(e) => setDropOn(e.target.checked)} />
            <label htmlFor="g-drop">Όχι μείωση πάνω από</label>
            <input className={`${num} w-20`} inputMode="decimal" value={drop} onChange={(e) => setDrop(e.target.value)} disabled={!dropOn} aria-label="Μέγιστη μείωση %" />%
          </div>
          <div className={chk}>
            <input id="g-margin" type="checkbox" className={box} checked={marginOn} onChange={(e) => setMarginOn(e.target.checked)} />
            <label htmlFor="g-margin">Ποτέ κάτω από το κόστος +</label>
            <input className={`${num} w-20`} inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} disabled={!marginOn} aria-label="Ελάχιστο περιθώριο πάνω από το κόστος %" />%
          </div>
          <p className="m-0 pl-7.5 text-eu-muted text-[length:var(--fs-12)]">Κόστος αγοράς από τον νυχτερινό έλεγχο (τελ. τιμή προμηθευτή ή τελ. τιμή αγοράς είδους), με ΦΠΑ. Χωρίς κόστος 36 ωρών, το προϊόν δεν αλλάζει.</p>
          <label className={chk}><input type="checkbox" className={box} checked={skipPromo} onChange={(e) => setSkipPromo(e.target.checked)} />Παράλειψε όσα έχουν ενεργή προσφορά</label>
          <label className={chk}><input type="checkbox" className={box} checked={raiseCheaper} onChange={(e) => setRaiseCheaper(e.target.checked)} />Ανέβασε και όσα είμαστε φθηνότεροι</label>
          <p className="m-0 pl-7.5 text-eu-muted text-[length:var(--fs-12)]">Τιμή Κωτσόβολου παλαιότερη από 36 ώρες δεν χρησιμοποιείται.</p>
        </section>
      </div>

      {/* Σύνοψη */}
      <section data-help="bulk-summary" aria-label="Σύνοψη" aria-busy={loading} className="grid gap-4 rounded-2xl bg-eu-navy p-4 md:p-5 text-white min-w-0">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="grid gap-0.5">
            <span className="text-eu-on-dark-2 text-[length:var(--fs-13)]">Θα αλλάξουν</span>
            <span className="font-heading font-bold tabular-nums text-[length:var(--fs-26)]">{picked.length} από {rows.length}</span>
            <span className="text-eu-on-dark-2 text-[length:var(--fs-12)]">{picked.length ? "επιλεγμένα στον πίνακα" : "τίποτα με αυτόν τον κανόνα"}</span>
          </div>
          <div className="grid gap-0.5">
            <span className="text-eu-on-dark-2 text-[length:var(--fs-13)]">Συνολική αλλαγή τιμών</span>
            <span className="font-heading font-bold tabular-nums text-[length:var(--fs-26)]">{signedEur(total)}</span>
            <span className="text-eu-on-dark-2 text-[length:var(--fs-12)]">{total < 0 ? "πιο ανταγωνιστικοί, λιγότερο έσοδο ανά τεμάχιο" : total > 0 ? "ανεβαίνουν — περισσότερο έσοδο ανά τεμάχιο" : "καμία αλλαγή"}</span>
          </div>
          <div className="grid gap-0.5">
            <span className="text-eu-on-dark-2 text-[length:var(--fs-13)]">Μέση αλλαγή</span>
            <span className="font-heading font-bold tabular-nums text-[length:var(--fs-26)]">{pct(avg)}</span>
            <span className="text-eu-on-dark-2 text-[length:var(--fs-12)]">ανά προϊόν, σε σχέση με την τιμή μας τώρα</span>
          </div>
          {loading && <span className="inline-flex items-center gap-2 text-eu-on-dark-2 text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden />Υπολογισμός…</span>}
        </div>

        {rows.length > 0 && (
          <div className="grid gap-2">
            {/* Μία μπάρα: αλλάζουν / ξετσεκαρισμένα / έξω */}
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${picked.length} αλλάζουν, ${changing.length - picked.length} χωρίς επιλογή, ${out} έμειναν έξω`}>
              {picked.length > 0 && <span className="h-full rounded-sm bg-eu-yellow" style={{ flexGrow: picked.length }} />}
              {changing.length - picked.length > 0 && <span className="h-full rounded-sm bg-white/45" style={{ flexGrow: changing.length - picked.length }} />}
              {out > 0 && <span className="h-full rounded-sm bg-white/15" style={{ flexGrow: out }} />}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-eu-on-dark-2 text-[length:var(--fs-12)]">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-eu-yellow" aria-hidden />Αλλάζουν {picked.length}</span>
              {changing.length - picked.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-white/45" aria-hidden />Χωρίς επιλογή {changing.length - picked.length}</span>}
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-white/15 ring-1 ring-white/30" aria-hidden />Έμειναν έξω {out}</span>
            </div>
          </div>
        )}

        {skipped.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0" aria-label="Γιατί έμειναν έξω">
            {skipped.map(({ k, n }) => (
              <li key={k} className="grid gap-1 [grid-template-columns:minmax(0,1fr)_auto] items-baseline">
                <span className="font-bold text-[length:var(--fs-14)]">{SKIP[k].label}</span>
                <span className="font-bold tabular-nums text-[length:var(--fs-14)]">{n}</span>
                <span className="col-span-2 h-1.5 rounded-full bg-white/10"><span className="block h-full rounded-full bg-white/60" style={{ width: `${Math.max(4, (n / rows.length) * 100)}%` }} /></span>
                <span className="col-span-2 text-eu-on-dark-2 text-[length:var(--fs-12)]">{SKIP[k].hint}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 justify-items-start sm:justify-items-end">
          <button type="button" onClick={apply} disabled={!!why || busy || loading} className={`${btn} bg-eu-yellow text-eu-navy`}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : blockedReason ? <Lock className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
            Εφάρμοσε σε {picked.length} {picked.length === 1 ? "προϊόν" : "προϊόντα"}
          </button>
          {why && <span className="flex items-start gap-1.5 text-eu-on-dark text-[length:var(--fs-13)]"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{why}</span>}
        </div>
        {done && (
          <p role="status" className="m-0 flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
            {done.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-eu-green" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-eu-amber" aria-hidden />}{done.text}
          </p>
        )}
        {error && <p role="alert" className="m-0 rounded-lg bg-white px-3 py-2 font-bold text-eu-red text-[length:var(--fs-14)]">{error}</p>}
      </section>

      {/* Πίνακας / κάρτες */}
      <section data-help="bulk-table" aria-label="Προϊόντα" className={shell}>
        {rows.length === 0 ? (
          <p className="m-0 p-5 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα προϊόν με ζευγάρι για αυτά τα φίλτρα{filter.onlyExpensive ? " όπου είμαστε ακριβότεροι — δοκίμασε «Όλα με ζευγάρι»" : ""}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eu-line px-4 py-2">
              <label className={chk}><input type="checkbox" className={box} checked={allOn} onChange={toggleAll} disabled={!changing.length} />Όλα όσα αλλάζουν ({changing.length})</label>
              <span className="text-eu-muted text-[length:var(--fs-12)]">Ξετσέκαρε ό,τι δεν θέλεις να αλλάξει</span>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-[length:var(--fs-14)]">
                <thead><tr className="bg-eu-surface text-left text-eu-ink-3 text-[length:var(--fs-12)]">
                  <th className="w-12 px-3 py-2.5"><span className="sr-only">Επιλογή</span></th>
                  <th className="px-3 py-2.5">Προϊόν</th><th className="px-3 py-2.5 text-right">Τώρα</th><th className="px-3 py-2.5 text-right">Κωτσόβολος</th>
                  <th className="px-3 py-2.5 text-right">Νέα τιμή</th><th className="px-3 py-2.5 text-right">Αλλαγή</th><th className="px-3 py-2.5">Σημείωση</th>
                </tr></thead>
                <tbody>{rows.map((r) => {
                  const can = "newPrice" in r.plan;
                  return (
                    <tr key={r.productId} className="border-t border-eu-line align-middle">
                      <td className="px-3 py-2">{can && <input type="checkbox" className={box} checked={!off.has(r.productId)} onChange={() => toggle(r.productId)} aria-label={`Επιλογή ${r.title}`} />}</td>
                      <td className="px-3 py-2 font-bold text-eu-ink">{r.title}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{eur(r.now)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{eur(r.theirs)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${can ? "font-bold text-eu-ink" : "text-eu-muted"}`}>{"newPrice" in r.plan ? eur(r.plan.newPrice) : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${changeTone(r)}`}>{change(r)}</td>
                      <td className="px-3 py-2">{note(r)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <ul className="m-0 grid list-none p-0 md:hidden">
              {rows.map((r) => {
                const can = "newPrice" in r.plan;
                return (
                  <li key={r.productId} className="grid gap-2 border-t border-eu-line px-4 py-3 first:border-t-0">
                    <div className="flex items-start gap-3">
                      {can ? <input type="checkbox" className={`${box} mt-0.5`} checked={!off.has(r.productId)} onChange={() => toggle(r.productId)} aria-label={`Επιλογή ${r.title}`} /> : <span className="size-5 shrink-0" aria-hidden />}
                      <span className="min-w-0 break-words font-bold text-eu-ink text-[length:var(--fs-14)]">{r.title}</span>
                    </div>
                    <dl className="m-0 grid grid-cols-3 gap-2 pl-8 text-[length:var(--fs-13)]">
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Τώρα</dt><dd className="m-0 tabular-nums">{eur(r.now)}</dd></div>
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Κωτσόβολος</dt><dd className="m-0 tabular-nums">{eur(r.theirs)}</dd></div>
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Νέα</dt><dd className={`m-0 tabular-nums ${can ? "font-bold text-eu-ink" : "text-eu-muted"}`}>{"newPrice" in r.plan ? eur(r.plan.newPrice) : "—"}</dd></div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
                      <span className={`tabular-nums text-[length:var(--fs-13)] ${changeTone(r)}`}>{change(r)}</span>{note(r)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Ιστορικό */}
      <section data-help="bulk-history" aria-label="Ιστορικό αλλαγών" className={`${card} grid gap-3`}>
        <h3 className={h3}>Ιστορικό αλλαγών</h3>
        {batches.length === 0 ? (
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν έχει γίνει ακόμη μαζική αλλαγή. Κάθε εφαρμογή καταγράφεται εδώ με την προηγούμενη τιμή, ώστε να αναιρείται με ένα κλικ.</p>
        ) : (
          <ul className="m-0 grid list-none gap-0 p-0">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-eu-line py-3 first:border-t-0">
                <div className="grid gap-0.5 min-w-0">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{when(b.createdAt)}{b.user ? ` · ${b.user}` : ""}</span>
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)]">
                    <span className="font-bold text-eu-green">Άλλαξαν {b.ok}</span>
                    {b.failed > 0 && <span className="font-bold text-eu-amber"> · δεν άλλαξαν {b.failed}</span>}
                    {` · ${signedEur(b.totalEur)}`}
                    {b.undoneAt && ` · αναιρέθηκε ${when(b.undoneAt)}${b.undoFailed ? ` (${b.undoFailed} έμειναν: άλλαξαν από άλλον ή απέτυχαν)` : ""}`}
                  </span>
                  {b.errors.length > 0 && <details className="text-eu-ink-3 text-[length:var(--fs-12)]"><summary className="cursor-pointer py-1">Γιατί δεν άλλαξαν κάποια</summary><ul className="m-0 grid gap-0.5 pl-4">{b.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul></details>}
                </div>
                {canRun && !b.undoneAt && b.ok > 0 && (
                  <button type="button" onClick={() => undo(b.id)} disabled={busy || !!blockedReason} title={blockedReason ?? undefined} className={`${btn} border border-eu-line-2 bg-white text-eu-navy`}>
                    <RotateCcw className="size-4" aria-hidden />Αναίρεση
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 flex items-start gap-2 rounded-lg border border-eu-amber/40 bg-eu-amber/10 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-eu-amber" aria-hidden />
          Η νέα τιμή γράφεται στο SoftOne ως τιμή web και φτάνει στο eshop με τον επόμενο συγχρονισμό (έως 30′). Η αναίρεση γυρίζει μόνο όσες τιμές δεν άλλαξε στο μεταξύ κάποιος άλλος.
        </p>
      </section>
    </div>
  );
}
