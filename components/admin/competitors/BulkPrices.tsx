"use client";
// Μαζική αλλαγή τιμής web: φίλτρα + κανόνας + δικλείδες → προεπισκόπηση (planRow στον server) → εφαρμογή/αναίρεση.
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Info, Loader2, Lock, ExternalLink, RotateCcw, Scale, TrendingDown, X } from "lucide-react";
import { Dialog } from "@/components/admin/catalog/QuickActions";
import { KotCheckPanel } from "@/components/admin/catalog/KotDialogs";
import { applyAction, batchesAction, previewAction, undoAction } from "@/app/admin/(shell)/catalog/competitors/prices/actions";
import { DEFAULT_RULE, SKIP, type Rule, type Skip } from "@/lib/competitors/bulk-core";
import type { BatchView, Filter, PreviewRow } from "@/lib/competitors/bulk";
import { eur, pct } from "@/lib/competitors/badge";

type Opt = { id: string; name: string };
type Props = {
  initialRows: PreviewRow[]; initialFilter: Filter; product: { id: string; title: string } | null;
  options: { categories: Opt[]; brands: Opt[] }; batches: BatchView[]; blockedReason: string | null; canRun: boolean; maxBatch: number;
};

const SOURCE: Record<string, string> = { "supplier-last": "τελ. τιμή προμηθευτή", purl: "τελ. τιμή αγοράς είδους" };
const ORDER: Skip[] = ["max-drop", "max-rise", "below-cost", "no-cost", "promo", "stale", "gone", "cheaper", "same"];
const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur(Math.abs(v))}`;
const parse = (s: string) => { const t = s.trim().replace(",", "."); return t === "" ? NaN : Number(t); };
const show = (n: number) => String(n).replace(".", ",");

const shell = "rounded-2xl border border-eu-line bg-white min-w-0";
const card = `${shell} p-4 md:p-5`;
/** Χρώμα με ένα νόημα: κόκκινο = ζημιά/ακριβότεροι, κεχριμπαρί = θέλει ματιά, μπλε = κλειδωμένο από προσφορά, γκρι = λείπουν στοιχεία, πράσινο = εντάξει. */
const TONE = {
  red: "text-[color-mix(in_oklab,var(--eu-red)_80%,black)]",
  amber: "text-[color-mix(in_oklab,var(--eu-amber)_70%,black)]",
  blue: "text-eu-blue",
  grey: "text-eu-muted",
  green: "text-eu-green",
} as const;
const SKIP_TONE: Record<Skip, keyof typeof TONE> = { "below-cost": "red", "max-drop": "amber", "max-rise": "amber", promo: "blue", "no-cost": "grey", stale: "grey", gone: "grey", cheaper: "green", same: "green" };
const SKIP_SHORT: Record<Skip, string> = { "max-drop": "Μεγάλη μείωση", "max-rise": "Μεγάλη αύξηση", "below-cost": "Κάτω από κόστος", "no-cost": "Χωρίς κόστος", promo: "Σε προσφορά", stale: "Παλιά τιμή", gone: "Δεν διατίθεται", cheaper: "Ήδη φθηνότεροι", same: "Ίδια τιμή" };
const SKIP_INK: Record<keyof typeof TONE, string> = { red: "text-eu-red", amber: "text-eu-amber", blue: "text-eu-blue", grey: "text-eu-muted", green: "text-eu-green" };
const SKIP_ICON: Record<keyof typeof TONE, typeof AlertTriangle> = { red: AlertTriangle, amber: AlertTriangle, blue: Lock, grey: Info, green: CheckCircle2 };
const pill = "inline-flex items-center gap-0.5 tabular-nums font-semibold text-[length:var(--fs-11)] leading-[1.4] whitespace-nowrap";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]";
const lbl = "font-semibold text-eu-ink-3 text-[length:var(--fs-12)]";
const field = "min-h-11 md:min-h-9 w-full rounded-lg border border-eu-line-2 bg-white px-2.5 text-eu-ink text-[length:var(--fs-14)]";
const num = "min-h-11 md:min-h-9 rounded-lg border border-eu-line-2 bg-white px-2 text-center font-semibold tabular-nums text-eu-ink text-[length:var(--fs-14)] disabled:opacity-50";
const chk = "flex items-center gap-2 min-h-11 md:min-h-9 text-eu-ink text-[length:var(--fs-13)]";
const box = "size-4 shrink-0 accent-eu-navy";
/** checkbox γραμμής μέσα σε στόχο αφής 44px */
const hit = "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-bold text-[length:var(--fs-14)] disabled:cursor-not-allowed disabled:opacity-50";

export function BulkPrices({ initialRows, initialFilter, product, options, batches: initialBatches, blockedReason, canRun, maxBatch }: Props) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [amount, setAmount] = useState(show(DEFAULT_RULE.amount));
  const [mode, setMode] = useState<Rule["mode"]>(DEFAULT_RULE.mode);
  const [dropOn, setDropOn] = useState(true), [drop, setDrop] = useState(show(DEFAULT_RULE.maxDropPct!));
  const [marginOn, setMarginOn] = useState(true), [margin, setMargin] = useState(show(DEFAULT_RULE.minMarginPct!));
  const [raiseCheaper, setRaiseCheaper] = useState(DEFAULT_RULE.raiseCheaper);
  const [riseOn, setRiseOn] = useState(true), [rise, setRise] = useState(show(DEFAULT_RULE.maxRisePct!));
  const [rows, setRows] = useState(initialRows);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState(initialBatches);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [check, setCheck] = useState<{ id: string; title: string } | null>(null);
  const [loading, startPreview] = useTransition();
  const [busy, startWrite] = useTransition();

  const rule = useMemo((): Rule | null => {
    const a = parse(amount), d = parse(drop), m = parse(margin), u = parse(rise);
    if (!(a >= 0) || (mode === "pct" && a > 50) || (dropOn && !(d >= 0 && d <= 90)) || (marginOn && !(m >= 0 && m <= 500)) || (riseOn && !(u >= 0 && u <= 100))) return null;
    return { mode, amount: a, maxDropPct: dropOn ? d : null, minMarginPct: marginOn ? m : null, maxAgeH: DEFAULT_RULE.maxAgeH, raiseCheaper, maxRisePct: riseOn ? u : null };
  }, [amount, mode, drop, dropOn, margin, marginOn, raiseCheaper, rise, riseOn]);

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

  const running = batches.some((b) => b.phase !== "idle");
  // όσο τρέχει μια εφαρμογή/αναίρεση: πρόοδος κάθε 2″· όταν τελειώσει, μήνυμα και νέα προεπισκόπηση
  const watch = useRef<{ id: string; kind: "apply" | "undo" } | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const next = await batchesAction().catch(() => null);
      if (!next) return;
      setBatches(next);
      const w = watch.current, b = w && next.find((x) => x.id === w.id);
      if (!w || !b || b.phase !== "idle") return;
      watch.current = null;
      setDone(w.kind === "apply"
        ? { tone: b.failed ? "warn" : "ok", text: `Άλλαξαν ${b.ok}${b.failed ? `, δεν άλλαξαν ${b.failed} (δες γιατί στο ιστορικό)` : ""}. Το eshop παίρνει τη νέα τιμή αμέσως· αν ο συγχρονισμός του είδους αποτύχει, στον επόμενο (έως 30′).` }
        : { tone: b.undoFailed ? "warn" : "ok", text: `Αναιρέθηκαν ${b.undone} από ${b.ok}${b.undoFailed ? ` — ${b.undoFailed} έμειναν (άλλαξαν από άλλον ή απέτυχαν· «Ξαναδοκίμασε αναίρεση»)` : ""}.` });
      if (rule) { const p = await previewAction(filter, rule); if (p.ok) setRows(p.rows); }
    }, 2000);
    return () => clearInterval(t);
  }, [running, filter, rule]);

  function apply() {
    if (why || !rule || running) return;
    if (!window.confirm(`Να γραφτούν ${picked.length} νέες τιμές web στο SoftOne; Συνολική αλλαγή ${signedEur(total)}. Αναιρούνται από το ιστορικό.`)) return;
    startWrite(async () => {
      const r = await applyAction(picked.map((p) => p.productId), rule);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      watch.current = { id: r.batchId, kind: "apply" };
      setBatches(r.batches);
      setDone(null);
    });
  }
  function undo(id: string, retry: boolean) {
    if (!window.confirm(retry ? "Να ξαναδοκιμαστεί η αναίρεση όσων δεν γύρισαν; Όσα άλλαξε στο μεταξύ κάποιος άλλος μένουν όπως είναι." : "Να γυρίσουν οι τιμές αυτής της παρτίδας στις προηγούμενες; Όσες άλλαξε στο μεταξύ κάποιος άλλος μένουν όπως είναι.")) return;
    startWrite(async () => {
      const r = await undoAction(id);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      watch.current = { id, kind: "undo" };
      setBatches(r.batches);
      setDone(null);
    });
  }
  const live = batches.find((b) => b.phase !== "idle");

  /** Πρώτα όσα αλλάζουν, μετά όσα μένουν έξω (σταθερή σειρά μέσα σε κάθε ομάδα). */
  const ordered = [...rows.filter((r) => "newPrice" in r.plan), ...rows.filter((r) => !("newPrice" in r.plan))];
  const sepAt = ordered.findIndex((r) => !("newPrice" in r.plan));
  const note = (r: PreviewRow) => "skip" in r.plan
    ? (() => { const k = r.plan.skip, t = SKIP_TONE[k], I = SKIP_ICON[t]; return <span title={`${SKIP[k].label} — ${SKIP[k].hint}`} className="inline-flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-12)] whitespace-nowrap"><I className={`size-3.5 shrink-0 ${SKIP_INK[t]}`} aria-hidden />{SKIP_SHORT[k]}</span>; })()
    : r.cost != null ? <span title={`Κόστος με ΦΠΑ · ${SOURCE[r.costSource ?? ""] ?? "κόστος"}`} className="text-eu-muted text-[length:var(--fs-12)] whitespace-nowrap">κόστος <span className="tabular-nums text-eu-ink-3">{eur(r.cost)}</span></span> : null;
  /** Πόσο ακριβότεροι (▲ κόκκινο) ή φθηνότεροι (▼ πράσινο) είμαστε σήμερα από τον Κωτσόβολο. */
  const gap = (r: PreviewRow) => {
    if (r.theirs == null || r.now == null || r.theirs <= 0) return null;
    const g = ((r.now - r.theirs) / r.theirs) * 100;
    if (Math.abs(g) < 0.5) return <span className={`${pill} ${TONE.grey}`}>= ίδια</span>;
    return <span className={`${pill} ${g > 0 ? TONE.red : TONE.green}`} title={g > 0 ? "Τώρα είμαστε ακριβότεροι" : "Τώρα είμαστε φθηνότεροι"}>{g > 0 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}{pct(g).replace(/^[+-]/, "")}</span>;
  };
  /** Τιμή Κωτσόβολου ως σύνδεσμος στη σελίδα του (νέα καρτέλα). */
  const theirsLink = (r: PreviewRow) => r.url
    ? <a href={r.url} target="_blank" rel="noopener noreferrer" title="Άνοιγμα στον Κωτσόβολο (νέα καρτέλα)" className="inline-flex items-center gap-1 tabular-nums text-eu-ink hover:text-eu-blue hover:underline">{eur(r.theirs)}<ExternalLink className="size-3 shrink-0 text-eu-muted" aria-hidden /></a>
    : <span className="tabular-nums">{eur(r.theirs)}</span>;
  const checkBtn = (r: PreviewRow, mobile?: boolean) => <button type="button" onClick={() => setCheck({ id: r.productId, title: r.title })} aria-label={`Ίδιο προϊόν; Έλεγχος ζευγαριού: ${r.title}`} title="Ίδιο προϊόν; Δες τα δύο δίπλα-δίπλα και επιβεβαίωσε ή απόρριψε" className={`inline-grid place-items-center rounded-lg text-eu-muted hover:bg-eu-surface hover:text-eu-ink ${mobile ? "size-11" : "size-8"}`}><Scale className="size-4" aria-hidden /></button>;
  const change = (r: PreviewRow) => "changeEur" in r.plan ? `${signedEur(r.plan.changeEur)} · ${pct(r.plan.changePct)}` : "—";
  const changeTone = (r: PreviewRow) => !("changeEur" in r.plan) ? "text-eu-muted" : r.plan.changeEur < 0 ? "font-bold text-eu-green" : "font-bold text-eu-blue";

  return (
    <div className="grid gap-5 min-w-0">
      {/* Φίλτρα */}
      <section data-help="bulk-filters" aria-label="Φίλτρα" className={`${card} grid gap-3`}>
        {product && filter.productId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-eu-ink text-[length:var(--fs-14)]">Μόνο το προϊόν: <b>{product.title}</b></span>
            <button type="button" onClick={() => setFilter({ onlyExpensive: true })} className={`${btn} border border-eu-line-2 bg-white text-eu-navy`}><X className="size-4" aria-hidden />Όλα τα προϊόντα</button>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
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

      {/* Κανόνας + δικλείδες: μία κάρτα, χωρίς κενό ύψος */}
      <section aria-label="Κανόνας και δικλείδες" className={`${card} grid gap-3 lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-6`}>
        <div data-help="bulk-rule" className="grid content-start gap-2">
          <h3 className={h3}>Κανόνας</h3>
          <div className="flex flex-wrap items-center gap-2 font-semibold text-eu-ink text-[length:var(--fs-14)]">
            <span>Νέα τιμή =</span>
            <span className="rounded-md bg-eu-yellow/25 px-2.5 py-1.5 text-eu-navy">τιμή Κωτσόβολου</span>
            <span aria-hidden>−</span>
            <span className="inline-flex gap-1.5">
              <input className={`${num} w-20`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Ποσό κάτω από τον Κωτσόβολο" aria-invalid={!rule} />
              <select className={`${num} w-16`} value={mode} onChange={(e) => setMode(e.target.value as Rule["mode"])} aria-label="Ευρώ ή ποσοστό">
                <option value="eur">€</option><option value="pct">%</option>
              </select>
            </span>
          </div>
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Με την τιμή προσφοράς τους αν έχουν· γράφεται ως τιμή web στο SoftOne</p>
          {!rule && <p role="alert" className="m-0 flex items-center gap-2 font-semibold text-eu-red text-[length:var(--fs-12)]"><AlertTriangle className="size-4 shrink-0" aria-hidden />Έλεγξε τα ποσά: ποσοστό έως 50%, μείωση έως 90%, αύξηση έως 100%</p>}
        </div>

        <div data-help="bulk-guards" className="grid content-start gap-1 lg:border-l lg:border-eu-line lg:pl-6">
          <h3 className={h3}>Δικλείδες</h3>
          <div className="grid gap-x-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
            <div className={chk}>
              <input id="g-drop" type="checkbox" className={box} checked={dropOn} onChange={(e) => setDropOn(e.target.checked)} />
              <label htmlFor="g-drop">Όχι μείωση πάνω από</label>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><input className={`${num} w-14`} inputMode="decimal" value={drop} onChange={(e) => setDrop(e.target.value)} disabled={!dropOn} aria-label="Μέγιστη μείωση %" />%</span>
            </div>
            <div className={chk} title="Κόστος αγοράς από τον νυχτερινό έλεγχο (τελ. τιμή προμηθευτή ή αγοράς), με ΦΠΑ. Χωρίς κόστος 36 ωρών το προϊόν δεν αλλάζει.">
              <input id="g-margin" type="checkbox" className={box} checked={marginOn} onChange={(e) => setMarginOn(e.target.checked)} />
              <label htmlFor="g-margin">Ποτέ κάτω από κόστος +</label>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><input className={`${num} w-14`} inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} disabled={!marginOn} aria-label="Ελάχιστο περιθώριο πάνω από το κόστος %" />%</span>
            </div>
            <label className={chk}><input type="checkbox" className={box} checked={raiseCheaper} onChange={(e) => setRaiseCheaper(e.target.checked)} />Ανέβασε και όσα είμαστε φθηνότεροι</label>
            {raiseCheaper && (
              <div className={chk}>
                <input id="g-rise" type="checkbox" className={box} checked={riseOn} onChange={(e) => setRiseOn(e.target.checked)} />
                <label htmlFor="g-rise">Όχι αύξηση πάνω από</label>
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><input className={`${num} w-14`} inputMode="decimal" value={rise} onChange={(e) => setRise(e.target.value)} disabled={!riseOn} aria-label="Μέγιστη αύξηση %" />%</span>
              </div>
            )}
          </div>
          <p className="m-0 flex items-start gap-1.5 text-eu-muted text-[length:var(--fs-12)]"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Πάντα: όσα είναι σε προσφορά δεν αλλάζουν από εδώ· τιμή Κωτσόβολου πάνω από 36 ωρών και προϊόντα χωρίς κόστος μένουν έξω</p>
        </div>
      </section>

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
          <button type="button" onClick={apply} disabled={!!why || busy || loading || running} className={`${btn} bg-eu-yellow text-eu-navy`}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : blockedReason ? <Lock className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
            Εφάρμοσε σε {picked.length} {picked.length === 1 ? "προϊόν" : "προϊόντα"}
          </button>
          {why && <span className="flex items-start gap-1.5 text-eu-on-dark text-[length:var(--fs-13)]"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{why}</span>}
        </div>
        {live && (
          <div role="status" className="grid gap-1.5 rounded-lg bg-white px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
            <span className="flex items-center gap-2 font-bold"><Loader2 className="size-4 shrink-0 animate-spin text-eu-navy" aria-hidden />{live.phase === "applying" ? "Γράφτηκαν" : "Αναιρέθηκαν"} {live.done} από {live.total} — μπορείς να μείνεις ή να φύγεις από τη σελίδα</span>
            <span className="h-1.5 rounded-full bg-eu-line"><span className="block h-full rounded-full bg-eu-navy" style={{ width: `${live.total ? Math.round((live.done / live.total) * 100) : 0}%` }} /></span>
          </div>
        )}
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
              <table className="w-full border-collapse text-[length:var(--fs-13)]">
                <thead><tr className="bg-eu-surface text-left text-eu-ink-3 text-[length:var(--fs-12)] font-semibold">
                  <th className="w-12 px-3 py-2"><span className="sr-only">Επιλογή</span></th>
                  <th className="px-2 py-2">Προϊόν</th><th className="px-2 py-2 text-right">Τώρα</th><th className="px-2 py-2 text-right">Κωτσόβολος</th>
                  <th className="px-2 py-2 text-right">Νέα τιμή</th><th className="px-2 py-2 text-right">Αλλαγή</th><th className="px-3 py-2">Σημείωση</th><th className="w-10 px-1 py-2"><span className="sr-only">Έλεγχος ζευγαριού</span></th>
                </tr></thead>
                <tbody>{ordered.map((r, i) => {
                  const can = "newPrice" in r.plan;
                  return (<Fragment key={r.productId}>
                    {i === sepAt && <tr className="border-t border-eu-line bg-eu-surface"><td colSpan={8} className="px-3 py-1.5 font-semibold text-eu-ink-3 text-[length:var(--fs-12)]">Μένουν έξω · {ordered.length - sepAt} <span className="font-normal text-eu-muted">— δεν αλλάζουν· η αιτία σε κάθε γραμμή</span></td></tr>}
                    <tr className="border-t border-eu-line align-middle">
                      <td className="px-1 py-0">{can && <label className={hit}><input type="checkbox" className={box} checked={!off.has(r.productId)} onChange={() => toggle(r.productId)} aria-label={`Επιλογή ${r.title}`} /></label>}</td>
                      <td className={`px-2 py-1.5 leading-snug ${can ? "font-semibold text-eu-ink" : "text-eu-ink-2"}`}>{r.title}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{eur(r.now)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap"><span className="grid justify-items-end gap-0.5">{theirsLink(r)}{gap(r)}</span></td>
                      {"newPrice" in r.plan && "changeEur" in r.plan ? <>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-bold text-eu-ink">{eur(r.plan.newPrice)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap"><span className="grid justify-items-end gap-0.5"><span className={`tabular-nums ${changeTone(r)}`}>{signedEur(r.plan.changeEur)}</span><span className={`${pill} ${r.plan.changeEur < 0 ? TONE.green : TONE.blue}`}>{pct(r.plan.changePct)}</span></span></td>
                        <td className="px-3 py-1.5 max-w-[13rem]">{note(r)}</td>
                      </> : <td colSpan={3} className="px-3 py-1.5 text-right">{note(r)}</td>}
                      <td className="px-1 py-1 text-right">{checkBtn(r)}</td>
                    </tr>
                  </Fragment>);
                })}</tbody>
              </table>
            </div>
            <ul className="m-0 grid list-none p-0 md:hidden">
              {ordered.map((r, i) => {
                const can = "newPrice" in r.plan;
                return (<Fragment key={r.productId}>
                  {i === sepAt && <li className="border-t border-eu-line bg-eu-surface px-4 py-2 font-semibold text-eu-ink-3 text-[length:var(--fs-12)]">Μένουν έξω · {ordered.length - sepAt} — δεν αλλάζουν</li>}
                  <li className="grid gap-2 border-t border-eu-line px-4 py-3 first:border-t-0">
                    <div className="-ml-3 flex items-center gap-1">
                      {can ? <label className={hit}><input type="checkbox" className={box} checked={!off.has(r.productId)} onChange={() => toggle(r.productId)} aria-label={`Επιλογή ${r.title}`} /></label> : <span className="size-11 shrink-0" aria-hidden />}
                      <span className="min-w-0 break-words font-bold text-eu-ink text-[length:var(--fs-14)]">{r.title}</span>
                    </div>
                    <dl className="m-0 grid grid-cols-3 gap-2 pl-9 text-[length:var(--fs-13)]">
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Τώρα</dt><dd className="m-0 tabular-nums">{eur(r.now)}</dd></div>
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Κωτσόβολος</dt><dd className="m-0">{theirsLink(r)}</dd></div>
                      <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Νέα</dt><dd className={`m-0 tabular-nums ${can ? "font-bold text-eu-ink" : "text-eu-muted"}`}>{"newPrice" in r.plan ? eur(r.plan.newPrice) : "—"}</dd></div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9">
                      <span className={`tabular-nums text-[length:var(--fs-13)] ${changeTone(r)}`}>{change(r)}</span>{note(r)}{checkBtn(r, true)}
                    </div>
                  </li>
                </Fragment>);
              })}
            </ul>
          </>
        )}
      </section>

      <Dialog open={!!check} onClose={() => setCheck(null)} title="Έλεγχος Κωτσόβολου" sub={check?.title} icon={<Scale className="size-4 text-eu-amber" aria-hidden />} wide>
        {check && <KotCheckPanel productId={check.id} onDone={(t) => { setCheck(null); if (t) setDone({ tone: t.ok ? "ok" : "warn", text: t.text }); }} />}
      </Dialog>
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
                    {b.phase === "idle" && b.undone > 0 && ` · αναιρέθηκαν ${b.undone}${b.undoneAt ? ` (${when(b.undoneAt)})` : ""}`}
                    {b.phase === "idle" && b.undoFailed > 0 && <span className="font-bold text-eu-amber"> · {b.undoFailed} δεν γύρισαν (άλλαξαν από άλλον ή απέτυχαν)</span>}
                  </span>
                  {b.phase !== "idle" && <span className="inline-flex items-center gap-1.5 font-bold text-eu-navy text-[length:var(--fs-13)]"><Loader2 className="size-3.5 animate-spin" aria-hidden />{b.phase === "applying" ? "Γράφτηκαν" : "Αναιρέθηκαν"} {b.done} από {b.total}</span>}
                  {b.errors.length > 0 && <details className="text-eu-ink-3 text-[length:var(--fs-12)]"><summary className="cursor-pointer py-1">Γιατί δεν άλλαξαν κάποια</summary><ul className="m-0 grid gap-0.5 pl-4">{b.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul></details>}
                </div>
                {canRun && b.undoable > 0 && (
                  <button type="button" onClick={() => undo(b.id, b.undoFailed > 0)} disabled={busy || running || !!blockedReason} title={blockedReason ?? undefined} className={`${btn} border border-eu-line-2 bg-white text-eu-navy`}>
                    <RotateCcw className="size-4" aria-hidden />{b.undoFailed > 0 ? `Ξαναδοκίμασε αναίρεση (${b.undoable})` : "Αναίρεση"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 flex items-start gap-2 rounded-lg border border-eu-amber/40 bg-eu-amber/10 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-eu-amber" aria-hidden />
          Η νέα τιμή γράφεται στο SoftOne ως τιμή web και το είδος συγχρονίζεται αμέσως με το eshop· αν ο συγχρονισμός αποτύχει, η τιμή φτάνει με τον επόμενο (έως 30′). Η αναίρεση γυρίζει μόνο όσες τιμές δεν άλλαξε στο μεταξύ κάποιος άλλος.
        </p>
      </section>
    </div>
  );
}
