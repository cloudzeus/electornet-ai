"use client";
// Τιμολόγηση: φίλτρα → ζωντανή ανάγνωση κόστους και πωλήσεων → markup ανά προϊόν (πρόταση από τη μέση τιμή πώλησης) → εγγραφή τιμής web / αναίρεση.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ExternalLink, Info, Lightbulb, Loader2, Lock, RotateCcw, Search } from "lucide-react";
import { applyAction, linesAction, loadAction } from "@/app/admin/(shell)/catalog/timologisi/actions";
import { batchesAction, undoAction } from "@/app/admin/(shell)/catalog/competitors/prices/actions";
import { DEFAULT_OPTS, PERIODS, SKIP, markupOf, planPrice, underCut, type Period, type Plan, type Skip } from "@/lib/catalog/pricing/tool-core";
import type { Rounding } from "@/lib/catalog/pricing/markup";
import type { BatchLine, PricingRow } from "@/lib/catalog/pricing/tool";
import type { BatchView } from "@/lib/competitors/bulk";
import { eur } from "@/lib/competitors/badge";

type Opt = { id: string; name: string };
type Props = { brands: Opt[]; categories: Opt[]; batches: BatchView[]; canRun: boolean; blockedReason: string | null };

const PERIOD_LABEL: Record<Period, string> = { 30: "30 ημερών", 90: "90 ημερών", 365: "12 μηνών" };
const ROUNDING: Record<Rounding, string> = { "90": "σε ,90", "99": "σε ,99", int: "σε ακέραιο", none: "χωρίς" };
const SOURCE: Record<string, string> = { "supplier-last": "τελευταία τιμή προμηθευτή", purl: "τελευταία τιμή αγοράς είδους" };
/** Χρώμα με ένα νόημα: κόκκινο = χάνουμε κέρδος, μπλε = κλειδωμένο από προσφορά, γκρι = λείπει κάτι, πράσινο = εντάξει. */
const SKIP_TONE: Record<Skip, { ink: string; Icon: typeof Info }> = {
  "low-margin": { ink: "text-eu-red", Icon: AlertTriangle }, "max-drop": { ink: "text-eu-amber", Icon: AlertTriangle }, "max-rise": { ink: "text-eu-amber", Icon: AlertTriangle }, promo: { ink: "text-eu-blue", Icon: Lock },
  "no-cost": { ink: "text-eu-muted", Icon: Info }, "no-markup": { ink: "text-eu-amber", Icon: Info }, same: { ink: "text-eu-green", Icon: CheckCircle2 },
};
const day = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "numeric" });
const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eur(Math.abs(v))}`;
const parse = (s: string) => { const t = s.trim().replace(",", "."); return t === "" ? NaN : Number(t); };
const show = (n: number) => String(n).replace(".", ",");

const card = "rounded-2xl border border-eu-line bg-white min-w-0 p-4 md:p-5";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]";
const lbl = "grid gap-1 font-semibold text-eu-ink-3 text-[length:var(--fs-12)] min-w-0";
const field = "min-h-11 md:min-h-9 w-full rounded-lg border border-eu-line-2 bg-white px-2.5 font-normal text-eu-ink text-[length:var(--fs-14)]";
const num = "min-h-11 md:min-h-9 w-20 rounded-lg border border-eu-line-2 bg-white px-2 text-center font-semibold tabular-nums text-eu-ink text-[length:var(--fs-14)]";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-bold text-[length:var(--fs-14)] disabled:cursor-not-allowed disabled:opacity-50";
const ghost = `${btn} border border-eu-line-2 bg-white text-eu-navy`;
const sub = "text-eu-ink-3 text-[length:var(--fs-12)]";
const cols = "lg:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_8.5rem_minmax(0,1.1fr)]";

export function PricingTool({ brands, categories, batches: initialBatches, canRun, blockedReason }: Props) {
  const [categoryId, setCategoryId] = useState(""), [brandId, setBrandId] = useState(""), [q, setQ] = useState("");
  const [rows, setRows] = useState<PricingRow[] | null>(null);
  const [period, setPeriod] = useState<Period>(90);
  const [rounding, setRounding] = useState<Rounding>(DEFAULT_OPTS.rounding);
  const [minMargin, setMinMargin] = useState(show(DEFAULT_OPTS.minMarginPct));
  const [maxDrop, setMaxDrop] = useState(show(DEFAULT_OPTS.maxDropPct!)), [maxRise, setMaxRise] = useState(show(DEFAULT_OPTS.maxRisePct!));
  const [common, setCommon] = useState("25");
  /** markup που έγραψε ο χρήστης· όπου λείπει ισχύει η πρόταση της περιόδου */
  const [edited, setEdited] = useState<Record<string, string>>({});
  /** ρητή τιμή ανά προϊόν (τιμή Κωτσόβολου − Χ)· υπερισχύει του markup μέχρι να γράψεις άλλο markup */
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [kotAmount, setKotAmount] = useState("0"), [kotMode, setKotMode] = useState<"eur" | "pct">("eur");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState(initialBatches);
  const [done, setDone] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  /** πορεία της παρτίδας που ξεκίνησε από εδώ, ανά προϊόν· μένει στην οθόνη και μετά το τέλος */
  const [live, setLive] = useState<{ kind: "apply" | "undo"; lines: BatchLine[] } | null>(null);
  const [loading, startLoad] = useTransition(), [busy, startWrite] = useTransition();

  const min = parse(minMargin), drop = parse(maxDrop), rise = parse(maxRise);
  // κενό «Μέγιστη μείωση» / «Μέγιστη αύξηση» = χωρίς όριο
  const opts = useMemo(() => ({ rounding, minMarginPct: Number.isFinite(min) && min >= 0 ? min : 0, maxDropPct: Number.isFinite(drop) && drop >= 0 && drop <= 100 ? drop : null, maxRisePct: Number.isFinite(rise) && rise >= 0 && rise <= 1000 ? rise : null }), [rounding, min, drop, rise]);
  const suggestion = (r: PricingRow) => markupOf(r.sales?.avg[period], r.cost, r.vat);
  const percentOf = (r: PricingRow) => { const e = edited[r.productId]; if (e === undefined) return suggestion(r); const n = parse(e); return Number.isFinite(n) ? n : null; };
  const plans = useMemo(() => new Map<string, Plan>((rows ?? []).map((r) => [r.productId, planPrice(r, percentOf(r), opts, targets[r.productId])])), [rows, edited, targets, period, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  const changing = (rows ?? []).filter((r) => "newPrice" in plans.get(r.productId)!);
  const picked = changing.filter((r) => !off.has(r.productId));
  const total = picked.reduce((s, r) => s + (plans.get(r.productId) as { changeEur: number }).changeEur, 0);
  const up = picked.filter((r) => (plans.get(r.productId) as { changeEur: number }).changeEur > 0).length, down = picked.length - up;
  const out = (rows?.length ?? 0) - picked.length;

  const filterOn = !!(categoryId || brandId || q.trim());
  function load() {
    if (!filterOn) return;
    startLoad(async () => {
      const r = await loadAction({ categoryId, brandId, q });
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      setRows(r.rows); setEdited({}); setTargets({}); setOff(new Set()); setDone(null);
    });
  }

  const running = batches.some((b) => b.phase !== "idle");
  const watch = useRef<{ id: string; kind: "apply" | "undo" } | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const next = await batchesAction().catch(() => null);
      if (!next) return;
      setBatches(next);
      const w = watch.current, b = w && next.find((x) => x.id === w.id);
      if (w) { const lines = await linesAction(w.id).catch(() => null); if (lines) setLive({ kind: w.kind, lines }); }
      if (!w || !b || b.phase !== "idle") return;
      watch.current = null;
      setDone(w.kind === "apply"
        ? { tone: b.failed ? "warn" : "ok", text: `Άλλαξαν ${b.ok}${b.failed ? `, δεν άλλαξαν ${b.failed} (δες γιατί στο ιστορικό)` : ""}. Το eshop παίρνει τη νέα τιμή αμέσως.` }
        : { tone: b.undoFailed ? "warn" : "ok", text: `Αναιρέθηκαν ${b.undone} από ${b.ok}${b.undoFailed ? `. ${b.undoFailed} έμειναν (άλλαξαν από άλλον ή απέτυχαν)` : ""}.` });
      const r = await loadAction({ categoryId, brandId, q });
      if (r.ok) { setRows(r.rows); setEdited({}); setTargets({}); }
    }, 2000);
    return () => clearInterval(t);
  }, [running, categoryId, brandId, q]);

  const why = blockedReason ?? (running ? "Τρέχει ήδη μια αλλαγή. Περίμενε να τελειώσει." : !picked.length ? "Δεν έχεις διαλέξει προϊόν που αλλάζει τιμή." : null);
  function apply() {
    if (why) return;
    if (!window.confirm(`${picked.length === 1 ? "Να γραφτεί 1 νέα τιμή web" : `Να γραφτούν ${picked.length} νέες τιμές web`} στο SoftOne και στο eshop; Συνολική αλλαγή ${signedEur(total)}. Αναιρούνται από το ιστορικό.`)) return;
    startWrite(async () => {
      const r = await applyAction(picked.map((p) => targets[p.productId] != null ? { productId: p.productId, price: targets[p.productId] } : { productId: p.productId, percent: percentOf(p)! }), opts);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      watch.current = { id: r.batchId, kind: "apply" };
      setBatches(r.batches); setDone(null); setLive({ kind: "apply", lines: await linesAction(r.batchId).catch(() => []) });
    });
  }
  function undo(id: string) {
    if (!window.confirm("Να γυρίσουν οι τιμές αυτής της αλλαγής στις προηγούμενες; Όσες άλλαξε στο μεταξύ κάποιος άλλος μένουν όπως είναι.")) return;
    startWrite(async () => {
      const r = await undoAction(id);
      if (!r.ok) { setDone({ tone: "warn", text: r.error }); return; }
      watch.current = { id, kind: "undo" };
      setBatches(r.batches); setDone(null); setLive({ kind: "undo", lines: await linesAction(id).catch(() => []) });
    });
  }
  const dropTarget = (id: string) => setTargets((t) => { if (!(id in t)) return t; const n = { ...t }; delete n[id]; return n; });
  const setAll = (value: (r: PricingRow) => string | undefined) => {
    setTargets((t) => Object.fromEntries(Object.entries(t).filter(([id]) => off.has(id))));
    setEdited((e) => {
      const n = { ...e };
      for (const r of rows ?? []) if (!off.has(r.productId)) { const v = value(r); if (v === undefined) delete n[r.productId]; else n[r.productId] = v; }
      return n;
    });
  };
  const withKot = (rows ?? []).filter((r) => r.kot && !off.has(r.productId));
  const setKot = () => setTargets((t) => {
    const n = { ...t };
    for (const r of withKot) { const p = underCut(r.kot!.price, parse(kotAmount), kotMode); if (p != null) n[r.productId] = p; }
    return n;
  });
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bar = (n: number, cls: string) => n > 0 && <span className={cls} style={{ flexGrow: n }} />;

  return (
    <div className="grid gap-4 min-w-0">
      <section data-help="pricing-filters" aria-label="Φίλτρα" className={`${card} grid gap-3`}>
        <h3 className={h3}>1. Ποια προϊόντα</h3>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <label className={lbl}>Κατηγορία<select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Όλες</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className={lbl}>Μάρκα<select className={field} value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Όλες</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className={lbl}>Όνομα ή κωδικός<input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="WGG14401GR" /></label>
          <button type="submit" disabled={!filterOn || loading} className={`${btn} bg-eu-navy text-white`}>{loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}Δείξε τιμές</button>
        </form>
        <p className={`m-0 ${sub}`}>Διάλεξε κατηγορία, μάρκα ή γράψε όνομα. Το κόστος και οι πωλήσεις διαβάζονται εκείνη τη στιγμή από το SoftOne (λίγα δευτερόλεπτα), έως 50 προϊόντα τη φορά.</p>
      </section>

      {done && <p role="status" className={`m-0 flex items-start gap-2 rounded-lg border px-3 py-2 text-eu-ink text-[length:var(--fs-14)] ${done.tone === "ok" ? "border-eu-green/40 bg-eu-green/10" : "border-eu-amber/40 bg-eu-amber/10"}`}>{done.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-eu-green" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-eu-amber" aria-hidden />}{done.text}</p>}

      {rows && rows.length === 0 && <p className={`${card} m-0 text-eu-ink-3 text-[length:var(--fs-14)]`}>Δεν βρέθηκαν ενεργά προϊόντα με τιμή για αυτά τα φίλτρα. Δοκίμασε άλλη κατηγορία ή μάρκα.</p>}

      {rows && rows.length > 0 && (<>
        <section data-help="pricing-markup" aria-label="Markup" className={`${card} grid gap-3`}>
          <h3 className={h3}>2. Πόσο κέρδος πάνω στο κόστος</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className={lbl}>Πρόταση από πωλήσεις<select className={field} value={period} onChange={(e) => setPeriod(Number(e.target.value) as Period)}>{PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</select></label>
            <label className={lbl}>Στρογγύλεμα τιμής<select className={field} value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)}>{(Object.keys(ROUNDING) as Rounding[]).map((k) => <option key={k} value={k}>{ROUNDING[k]}</option>)}</select></label>
            <label className={lbl}>Ελάχιστο κέρδος %<input className={field} inputMode="decimal" value={minMargin} onChange={(e) => setMinMargin(e.target.value)} /></label>
            <label className={lbl}>Μέγιστη μείωση %<input className={field} inputMode="decimal" value={maxDrop} onChange={(e) => setMaxDrop(e.target.value)} placeholder="χωρίς όριο" /></label>
            <label className={lbl}>Μέγιστη αύξηση %<input className={field} inputMode="decimal" value={maxRise} onChange={(e) => setMaxRise(e.target.value)} placeholder="χωρίς όριο" /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-eu-line pt-3">
            <label className={lbl}>Ίδιο markup % σε όλα<input className={num} inputMode="decimal" value={common} onChange={(e) => setCommon(e.target.value)} /></label>
            <button type="button" className={ghost} disabled={!Number.isFinite(parse(common))} onClick={() => setAll(() => common)}>Βάλε το στα επιλεγμένα</button>
            <button type="button" className={ghost} onClick={() => setAll(() => undefined)}><Lightbulb className="size-4 text-eu-amber" aria-hidden />Βάλε την πρόταση σε όλα</button>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-eu-line pt-3">
            <label className={lbl}>Τιμή Κωτσόβολου μείον<input className={num} inputMode="decimal" value={kotAmount} onChange={(e) => setKotAmount(e.target.value)} /></label>
            <label className={lbl}>σε<select className={`${field} w-24`} value={kotMode} onChange={(e) => setKotMode(e.target.value as "eur" | "pct")}><option value="eur">€</option><option value="pct">%</option></select></label>
            <button type="button" className={ghost} disabled={!withKot.length || !(parse(kotAmount) >= 0)} onClick={setKot}>Βάλε τη σε {withKot.length} με ζευγάρι</button>
            <span className={`${sub} basis-full`}>Με 0 μπαίνει ακριβώς η τιμή του Κωτσόβολου. Ισχύει μόνο για τα επιλεγμένα που έχουν ζευγάρι, χωρίς στρογγύλεμα· το ελάχιστο κέρδος ισχύει και εδώ.</span>
          </div>
          <p className={`m-0 ${sub}`}>Νέα τιμή = κόστος αγοράς × (1 + markup) × ΦΠΑ. Η πρόταση είναι το markup που φέρνει την τιμή στη μέση τιμή που πουλήθηκε το προϊόν στο eshop την περίοδο που διάλεξες. Προϊόν με markup κάτω από το ελάχιστο κέρδος δεν αλλάζει, ούτε προϊόν που η τιμή του θα έπεφτε περισσότερο από τη μέγιστη μείωση ή θα ανέβαινε περισσότερο από τη μέγιστη αύξηση (άδειο πεδίο = χωρίς όριο).</p>
        </section>

        <section data-help="pricing-table" aria-label="Προϊόντα" className={`${card} grid gap-0`}>
          <div className={`hidden lg:grid ${cols} items-center gap-3 pb-2 ${sub} font-semibold`}>
            <span /><span>Προϊόν</span><span>Τελευταία πώληση</span><span>Κόστος αγοράς</span><span>Markup %</span><span>Τιμή web με ΦΠΑ</span>
          </div>
          {rows.map((r) => {
            const plan = plans.get(r.productId)!, s = suggestion(r), cur = markupOf(r.web, r.cost, r.vat), on = !off.has(r.productId);
            const tgt = targets[r.productId], tm = tgt == null ? null : markupOf(tgt, r.cost, r.vat);
            const val = tgt != null ? (tm == null ? "" : show(tm)) : edited[r.productId] ?? (s == null ? "" : show(s));
            return (
              <div key={r.productId} className={`grid grid-cols-[2.75rem_minmax(0,1fr)] ${cols} items-center gap-x-3 gap-y-2 border-t border-eu-line py-3 text-[length:var(--fs-13)] ${on ? "" : "opacity-60"}`}>
                <label className="inline-flex size-11 cursor-pointer items-center justify-center"><input type="checkbox" className="size-4 accent-eu-navy" checked={on} onChange={() => toggle(r.productId)} aria-label={`Να αλλάξει: ${r.title}`} /></label>
                <div className="grid min-w-0"><span className="font-bold text-eu-ink break-words">{r.title}</span><span className={sub}>{r.brand} · {r.sku}</span></div>
                <div className="col-start-2 grid min-w-0 tabular-nums lg:col-start-auto">
                  <span className="lg:hidden text-eu-muted text-[length:var(--fs-12)]">Τελευταία πώληση</span>
                  {!r.sales ? <span className={sub}>Δεν διαβάστηκαν οι πωλήσεις</span> : <>
                    <span className="text-eu-ink">{r.sales.eshop ? <>{eur(r.sales.eshop.price)} <span className={sub}>eshop, {day(r.sales.eshop.at)}</span></> : <span className={sub}>Καμία στο eshop (12 μήνες)</span>}</span>
                    <span className={sub}>{r.sales.partner ? `Συνεργάτης ${eur(r.sales.partner.price)} χωρίς ΦΠΑ, ${day(r.sales.partner.at)}` : "Καμία σε συνεργάτη"}</span>
                  </>}
                </div>
                <div className="col-start-2 grid min-w-0 tabular-nums lg:col-start-auto" title={r.costSource ? SOURCE[r.costSource] : undefined}>
                  <span className="lg:hidden text-eu-muted text-[length:var(--fs-12)]">Κόστος αγοράς</span>
                  <span className="text-eu-ink">{r.cost == null ? "Δεν υπάρχει" : eur(r.cost)}</span>
                  {r.cost != null && <span className={sub}>χωρίς ΦΠΑ{cur != null ? ` · κέρδος τώρα ${show(cur)}%` : ""}</span>}
                </div>
                <div className="col-start-2 grid justify-items-start gap-0.5 lg:col-start-auto">
                  <span className="lg:hidden text-eu-muted text-[length:var(--fs-12)]">Markup %</span>
                  <input className={num} inputMode="decimal" value={val} disabled={r.cost == null || r.promo} onChange={(e) => { dropTarget(r.productId); setEdited((x) => ({ ...x, [r.productId]: e.target.value })); }} aria-label={`Markup % για ${r.title}`} />
                  {s != null
                    ? <button type="button" onClick={() => { dropTarget(r.productId); setEdited((x) => { const n = { ...x }; delete n[r.productId]; return n; }); }} title={`Μέση τιμή πώλησης ${PERIOD_LABEL[period]}: ${eur(r.sales!.avg[period]!)}`} className="inline-flex min-h-6 items-center gap-1 font-semibold text-eu-blue text-[length:var(--fs-12)] hover:underline"><Lightbulb className="size-3.5" aria-hidden />πρόταση {show(s)}%</button>
                    : <span className={sub}>χωρίς πρόταση</span>}
                </div>
                <div className="col-start-2 grid min-w-0 gap-0.5 tabular-nums lg:col-start-auto">
                  {"newPrice" in plan ? <>
                    <span className="flex flex-wrap items-center gap-1.5"><span className="text-eu-muted line-through">{eur(r.web)}</span><ArrowRight className="size-3.5 text-eu-muted" aria-hidden /><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{eur(plan.newPrice)}</span></span>
                    <span className={`font-bold text-[length:var(--fs-12)] ${plan.changeEur < 0 ? "text-eu-green" : "text-eu-blue"}`}>{plan.changeEur < 0 ? "Μείωση" : "Αύξηση"} {eur(Math.abs(plan.changeEur))} ({show(Math.abs(plan.changePct))}%)</span>
                  </> : (() => { const t = SKIP_TONE[plan.skip]; return <>
                    <span className="text-eu-ink">{eur(r.web)} <span className={sub}>μένει</span></span>
                    <span title={SKIP[plan.skip].hint} className="inline-flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-12)]"><t.Icon className={`size-3.5 shrink-0 ${t.ink}`} aria-hidden />{SKIP[plan.skip].label}</span>
                  </>; })()}
                  {r.kot && (() => { const mine = "newPrice" in plan ? plan.newPrice : r.web, d = mine - r.kot.price; return (
                    <span className={`${sub} flex flex-wrap items-center gap-x-1.5`} title={r.kot.at ? `Τιμή Κωτσόβολου, έλεγχος ${day(r.kot.at)}` : undefined}>
                      {r.kot.url ? <a href={r.kot.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-eu-ink hover:text-eu-blue hover:underline">Κωτσόβολος {eur(r.kot.price)}<ExternalLink className="size-3 shrink-0 text-eu-muted" aria-hidden /></a> : <span className="text-eu-ink">Κωτσόβολος {eur(r.kot.price)}</span>}
                      <span className={`font-bold ${Math.abs(d) < 0.005 ? "text-eu-muted" : d > 0 ? "text-eu-red" : "text-eu-green"}`}>{Math.abs(d) < 0.005 ? "ίδια τιμή" : `εμείς ${eur(Math.abs(d))} ${d > 0 ? "ακριβότεροι" : "φθηνότεροι"}`}</span>
                    </span>
                  ); })()}
                </div>
              </div>
            );
          })}
        </section>

        <section data-help="pricing-summary" aria-label="Σύνοψη και εγγραφή" className={`${card} grid gap-3`}>
          <h3 className={h3}>3. Τι θα αλλάξει</h3>
          <p className="m-0 text-eu-ink text-[length:var(--fs-15)]"><strong>{picked.length} από {rows.length}</strong> προϊόντα αλλάζουν τιμή · συνολική αλλαγή <strong className="tabular-nums">{signedEur(total)}</strong></p>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-eu-surface" role="img" aria-label={`${up} αυξήσεις, ${down} μειώσεις, ${out} μένουν ίδια`}>
            {bar(up, "bg-eu-blue")}{bar(down, "bg-eu-green")}{bar(out, "bg-eu-muted")}
          </div>
          <ul className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 ${sub}`}>
            <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-blue" />{up} ανεβαίνουν</li>
            <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-green" />{down} κατεβαίνουν</li>
            <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-muted" />{out} μένουν ίδια</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={apply} disabled={!!why || busy} className={`${btn} bg-eu-navy text-white`}>{busy || running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{picked.length === 1 ? "Άλλαξε 1 τιμή" : `Άλλαξε ${picked.length} τιμές`} σε SoftOne και eshop</button>
            {why && <span className={`inline-flex items-center gap-1.5 ${sub}`}><Lock className="size-3.5 shrink-0" aria-hidden />{why}</span>}
          </div>
        </section>
      </>)}

      {live && live.lines.length > 0 && (() => {
        // αναίρεση: μετρούν μόνο όσες γραμμές είχαν γραφτεί
        const undo = live.kind === "undo", lines = undo ? live.lines.filter((l) => l.ok) : live.lines;
        const state = (l: BatchLine) => undo ? (l.undoOk === true ? "ok" : l.undoOk === false ? "fail" : "wait") : l.ok ? "ok" : l.error ? "fail" : "wait";
        const ok = lines.filter((l) => state(l) === "ok").length, fail = lines.filter((l) => state(l) === "fail").length, wait = lines.length - ok - fail;
        const now = lines.find((l) => state(l) === "wait");
        return (
          <section data-help="pricing-progress" aria-label="Πορεία εγγραφής" aria-live="polite" className={`${card} grid gap-3`}>
            <h3 className={h3}>{undo ? "Πορεία αναίρεσης" : "Πορεία εγγραφής"}</h3>
            <p className="m-0 text-eu-ink text-[length:var(--fs-15)]"><strong>{ok + fail} από {lines.length}</strong>{wait > 0 ? " · γράφεται μία-μία στο SoftOne, μπορείς να φύγεις από τη σελίδα" : " · τελείωσε"}</p>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-eu-surface" role="img" aria-label={`${ok} εντάξει, ${fail} απέτυχαν, ${wait} περιμένουν`}>
              {bar(ok, "bg-eu-green")}{bar(fail, "bg-eu-amber")}{bar(wait, "bg-eu-line-2")}
            </div>
            <ul className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 ${sub}`}>
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-green" />{ok} {undo ? "γύρισαν πίσω" : "γράφτηκαν"}</li>
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-amber" />{fail} δεν άλλαξαν</li>
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-muted" />{wait} περιμένουν</li>
            </ul>
            <ul className="m-0 grid list-none gap-0 p-0">
              {lines.map((l) => { const st = state(l), from = undo ? l.newPrice : l.oldPrice, to = undo ? l.oldPrice : l.newPrice; return (
                <li key={l.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 border-t border-eu-line py-2 text-[length:var(--fs-13)] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]">
                  {st === "ok" ? <CheckCircle2 className="mt-0.5 size-4 text-eu-green" aria-hidden /> : st === "fail" ? <AlertTriangle className="mt-0.5 size-4 text-eu-amber" aria-hidden /> : l === now ? <Loader2 className="mt-0.5 size-4 animate-spin text-eu-navy" aria-hidden /> : <Clock className="mt-0.5 size-4 text-eu-muted" aria-hidden />}
                  <span className="grid min-w-0"><span className="font-bold text-eu-ink break-words">{l.title}</span>
                    <span className={`${sub} break-words`}>{st === "ok" ? (undo ? "Γύρισε στην προηγούμενη τιμή" : "Γράφτηκε σε SoftOne και eshop") : st === "fail" ? `Δεν άλλαξε: ${l.error ?? "άγνωστο σφάλμα"}` : l === now ? "Γράφεται τώρα" : "Περιμένει"}</span></span>
                  <span className="col-start-2 tabular-nums text-eu-ink sm:col-start-auto sm:text-right"><span className="text-eu-muted">{eur(from)}</span> <ArrowRight className="inline size-3.5 text-eu-muted" aria-hidden /> <strong>{eur(to)}</strong></span>
                </li>
              ); })}
            </ul>
          </section>
        );
      })()}

      <section data-help="pricing-history" aria-label="Ιστορικό αλλαγών" className={`${card} grid gap-3`}>
        <h3 className={h3}>Ιστορικό αλλαγών τιμής</h3>
        {batches.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν έχει γίνει ακόμη αλλαγή. Κάθε εγγραφή καταγράφεται εδώ με την προηγούμενη τιμή, ώστε να αναιρείται με ένα κλικ.</p> : (
          <ul className="m-0 grid list-none gap-0 p-0">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-eu-line py-3 first:border-t-0">
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{when(b.createdAt)}{b.user ? ` · ${b.user}` : ""}</span>
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)]">
                    <span className="font-bold text-eu-green">Άλλαξαν {b.ok}</span>
                    {b.failed > 0 && <span className="font-bold text-eu-amber"> · δεν άλλαξαν {b.failed}</span>}
                    {` · ${signedEur(b.totalEur)}`}
                    {b.phase === "idle" && b.undone > 0 && ` · αναιρέθηκαν ${b.undone}`}
                  </span>
                  {b.phase !== "idle" && <span className="inline-flex items-center gap-1.5 font-bold text-eu-navy text-[length:var(--fs-13)]"><Loader2 className="size-3.5 animate-spin" aria-hidden />{b.phase === "applying" ? "Γράφτηκαν" : "Αναιρέθηκαν"} {b.done} από {b.total}</span>}
                  {b.errors.length > 0 && <details className={sub}><summary className="cursor-pointer py-1">Γιατί δεν άλλαξαν κάποια</summary><ul className="m-0 grid gap-0.5 pl-4">{b.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul></details>}
                </div>
                {canRun && b.undoable > 0 && <button type="button" onClick={() => undo(b.id)} disabled={busy || running || !!blockedReason} title={blockedReason ?? undefined} className={ghost}><RotateCcw className="size-4" aria-hidden />{b.undoFailed > 0 ? `Ξαναδοκίμασε αναίρεση (${b.undoable})` : "Αναίρεση"}</button>}
              </li>
            ))}
          </ul>
        )}
        <p className={`m-0 ${sub}`}>Εδώ φαίνονται και οι αλλαγές από τη «Μαζική αλλαγή τιμών» της Σύγκρισης τιμών. Η αναίρεση γυρίζει μόνο όσες τιμές δεν άλλαξε στο μεταξύ κάποιος άλλος.</p>
      </section>
    </div>
  );
}
