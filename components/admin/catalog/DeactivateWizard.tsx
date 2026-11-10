"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CircleAlert, EyeOff, Loader2, PowerOff, Upload } from "lucide-react";
import { runDeactivation } from "@/app/admin/(shell)/catalog/templates/apenergopoiisi/actions";
import { deactApplies, DEACT_LABEL, type DeactMode, type DeactState } from "@/lib/catalog/deactivate-core";
import type { DeactRow } from "@/lib/catalog/deactivate";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums";
const n = (x: number) => x.toLocaleString("el-GR");
const items = (x: number) => `${n(x)} ${x === 1 ? "είδος" : "είδη"}`;
const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const BATCH = 10, PAGE = 100;

type Plan = { fileName: string; rows: DeactRow[]; writeOn: boolean; flagOn: boolean; canRun: boolean };
type Step = 1 | 2 | 3;
const STATE_CLS: Record<DeactState, string> = {
  live: "bg-eu-red/10 text-eu-red", "web-off": "bg-eu-surface text-eu-ink-2", inactive: "bg-eu-surface text-eu-ink-3", notfound: "bg-eu-yellow/30 text-eu-ink", problem: "bg-eu-yellow/30 text-eu-ink",
};
const ORDER: DeactState[] = ["live", "web-off", "inactive", "notfound", "problem"];
const HINT: Record<DeactState, string> = { live: "θα φύγουν", "web-off": "ενεργά στο SoftOne", inactive: "τίποτα να γίνει", notfound: "έλεγξε τον κωδικό", problem: "δες τη γραμμή" };

/**
 * Απενεργοποίηση από Excel: 1 αρχείο · 2 τι βρήκα (και από πού φεύγουν) · 3 αποτέλεσμα. Το αρχείο μένει στον browser· ο
 * server απαντά ποιο είδος είναι κάθε γραμμή και τι είναι σήμερα. Τίποτα δεν αλλάζει πριν από το κουμπί της εκτέλεσης.
 */
export function DeactivateWizard() {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mode, setMode] = useState<DeactMode>("web");
  const [off, setOff] = useState<Set<number>>(new Set()); // γραμμές που ο χρήστης ΞΕτσέκαρε
  const [filter, setFilter] = useState<DeactState | "all">("all");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);

  const upload = async (f: File) => {
    setBusy(true); setErr(null); setPlan(null); setResults({}); setProgress(null); setOff(new Set()); setFilter("all"); setPage(0);
    try {
      const body = new FormData(); body.set("file", f);
      const r = await fetch("/api/admin/catalog/deactivate/plan", { method: "POST", body });
      const j = await r.json().catch(() => ({ error: "Η ανάγνωση του αρχείου απέτυχε." }));
      if (!r.ok) throw new Error(j.error ?? "Η ανάγνωση του αρχείου απέτυχε.");
      setPlan(j as Plan); setStep(2);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const rows = useMemo(() => plan?.rows ?? [], [plan]);
  const counts = useMemo(() => { const c: Record<DeactState, number> = { live: 0, "web-off": 0, inactive: 0, notfound: 0, problem: 0 }; for (const r of rows) c[r.state]++; return c; }, [rows]);
  const applies = (r: DeactRow) => r.mtrl != null && deactApplies(r.state, mode);
  const todo = rows.filter((r) => applies(r) && !off.has(r.rowNo) && !results[r.rowNo]?.ok);
  const lock = !plan ? null
    : !plan.writeOn ? "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne). Μπορείς να δεις τι βρέθηκε, αλλά όχι να εκτελέσεις."
    : !plan.canRun ? "Για την εκτέλεση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»."
    : mode === "web" && !plan.flagOn ? "Η εγγραφή της «Εξαίρεσης Web» δεν έχει ενεργοποιηθεί σε αυτό το περιβάλλον — διάλεξε «Και από το SoftOne» ή ζήτησε να ανοίξει."
    : null;
  const shown = rows.filter((r) => filter === "all" || r.state === filter);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), cur = Math.min(page, pages - 1);

  const run = async () => {
    if (!plan || !todo.length || lock) return;
    const what = mode === "web" ? "θα φύγουν από το eshop (Εξαίρεση Web)· στο SoftOne μένουν ενεργά" : "θα γίνουν ΑΝΕΝΕΡΓΑ στο SoftOne: φεύγουν από eshop, παραγγελίες και παραστατικά";
    if (!confirm(`${items(todo.length)} ${what}. Ξανανοίγουν μόνο από το SoftOne. Συνέχεια;`)) return;
    setErr(null); setRunning(true); setStep(3); setProgress({ done: 0, total: todo.length });
    const list = todo.map((r) => ({ rowNo: r.rowNo, mtrl: r.mtrl! }));
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      let res;
      try { res = await runDeactivation(part.map((p) => p.mtrl), mode, plan.fileName); } catch { res = { error: "Η σύνδεση διακόπηκε." }; }
      if ("error" in res) { setErr(`${res.error} — όσα έγιναν μέχρι εδώ έμειναν· πάτα ξανά για τα υπόλοιπα.`); break; }
      const by = new Map(res.map((x) => [x.mtrl, x]));
      setResults((prev) => ({ ...prev, ...Object.fromEntries(part.map((p) => { const x = by.get(p.mtrl); return [p.rowNo, x?.ok ? { ok: true, text: x.error ?? (mode === "web" ? "Έφυγε από το eshop." : "Έγινε ανενεργό στο SoftOne και έφυγε από το eshop.") } : { ok: false, text: x?.error ?? "Δεν έγινε." }]; })) }));
      setProgress({ done: Math.min(i + BATCH, list.length), total: list.length });
    }
    setRunning(false);
  };
  const okCount = Object.values(results).filter((r) => r.ok).length, failCount = Object.values(results).filter((r) => !r.ok).length;
  const STEPS: [Step, string][] = [[1, "Αρχείο"], [2, "Τι βρήκα"], [3, "Αποτέλεσμα"]];

  return (
    <div className="grid gap-4 min-w-0">
      <ol data-help="deactivate.steps" aria-label="Βήματα" className="m-0 p-0 list-none grid grid-cols-3 gap-2">
        {STEPS.map(([s, l]) => (
          <li key={s}><button type="button" disabled={running || busy || (s > 1 && !plan) || (s === 3 && !progress)} onClick={() => setStep(s)} aria-current={step === s ? "step" : undefined}
            className={`w-full flex items-center gap-2 rounded-xl border-2 px-3 min-h-11 md:min-h-9 text-left font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed ${step === s ? "border-eu-navy bg-eu-navy text-white" : s < step ? "border-eu-blue/40 bg-eu-chip/40 text-eu-navy" : "border-eu-line bg-white text-eu-ink-3"}`}>
            <span className={`grid place-items-center size-6 shrink-0 rounded-full text-[length:var(--fs-12)] ${step === s ? "bg-white text-eu-navy" : "bg-eu-surface text-eu-ink-2"}`}>{s < step ? <Check className="size-3.5" aria-hidden /> : s}</span><span className="min-w-0 truncate">{l}</span>
          </button></li>
        ))}
      </ol>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}

      {step === 1 && (
        <section data-help="deactivate.upload" className={card} aria-labelledby="d-file">
          <div>
            <h3 id="d-file" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">1. Αρχείο με τα προϊόντα που φεύγουν</h3>
            <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">.xlsx ή .csv, έως 15 MB και 5.000 είδη. Αρκεί <strong>μία στήλη</strong> με κωδικό είδους, barcode (EAN) ή MTRL — ό,τι άλλο έχει το αρχείο αγνοείται. Διαβάζονται όλα τα φύλλα. Το ανέβασμα δεν αλλάζει τίποτα: πρώτα βλέπεις τι βρέθηκε.</p>
          </div>
          <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
            className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-eu-line-2 bg-eu-surface/50 p-4 cursor-pointer hover:border-eu-blue focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-eu-blue min-w-0">
            {busy ? <Loader2 className="size-6 text-eu-blue shrink-0 animate-spin" aria-hidden /> : <Upload className="size-6 text-eu-blue shrink-0" aria-hidden />}
            <span className="min-w-0 flex-1 grid">
              <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-all">{busy ? "Διαβάζω το αρχείο και βρίσκω τα είδη…" : plan ? plan.fileName : "Διάλεξε ή σύρε εδώ ένα .xlsx / .csv"}</span>
              <span className="text-eu-muted text-[length:var(--fs-12)]">{plan ? `${n(plan.rows.length)} γραμμές στο αρχείο — διάλεξε άλλο για να ξεκινήσεις από την αρχή` : "Π.χ. η λίστα καταργημένων κωδικών ενός προμηθευτή."}</span>
            </span>
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={busy || running}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          </label>
        </section>
      )}

      {step >= 2 && plan && (
        <section data-help="deactivate.found" className={card} aria-labelledby="d-found">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="d-found" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] min-w-0 [overflow-wrap:anywhere]">{step === 2 ? "2. Τι βρήκα" : "3. Αποτέλεσμα"} · {plan.fileName}</h3>
            <span className="text-eu-muted text-[length:var(--fs-13)]">{n(rows.length)} γραμμές στο αρχείο</span>
          </div>

          <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))]">
            {ORDER.filter((s) => counts[s] || s === "live").map((s) => (
              <div key={s} className={`grid gap-0.5 rounded-lg px-3 py-2 ${s === "live" ? "bg-eu-red/10" : s === "notfound" || s === "problem" ? "bg-eu-yellow/20" : "bg-eu-surface/70"}`}>
                <dt className="font-bold text-eu-ink text-[length:var(--fs-13)]">{s === "live" ? "Στο eshop τώρα" : s === "web-off" ? "Εκτός eshop ήδη" : DEACT_LABEL[s]}</dt>
                <dd className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{n(counts[s])}</dd>
                <dd className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{HINT[s]}</dd>
              </div>
            ))}
          </dl>

          <fieldset data-help="deactivate.mode" disabled={running || step === 3} className="m-0 p-0 border-0 grid gap-2 min-w-0">
            <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Από πού να φύγουν</legend>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
              {([["web", "Μόνο από το eshop", "Τσεκάρεται η «Εξαίρεση Web». Το είδος μένει ενεργό στο SoftOne και τα καταστήματα συνεχίζουν να το πουλούν και να το παραγγέλνουν.", EyeOff],
                 ["erp", "Και από το SoftOne", "Το είδος γίνεται ανενεργό στο ERP: φεύγει από eshop, παραγγελίες και παραστατικά — για όλα τα καταστήματα.", PowerOff]] as const).map(([v, title, text, Icon]) => (
                <label key={v} className={`grid gap-1 rounded-xl border-2 p-3 cursor-pointer min-w-0 ${mode === v ? "border-eu-navy bg-eu-chip/30" : "border-eu-line"}`}>
                  <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="radio" name="deact-mode" checked={mode === v} onChange={() => setMode(v)} className="size-5 accent-eu-navy" /><Icon className="size-4 text-eu-ink-2" aria-hidden />{title}</span>
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{text}</span>
                  <span className="text-eu-ink font-bold text-[length:var(--fs-12)] tabular-nums">{items(rows.filter((r) => r.mtrl != null && deactApplies(r.state, v)).length)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {lock && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{lock}</p>}

          <div role="tablist" aria-label="Φίλτρο ειδών" className="flex flex-wrap gap-2">
            {(["all", ...ORDER] as const).filter((k) => k === "all" || counts[k]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setPage(0); }}
                className={`${btn} px-3 ${filter === k ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>{k === "all" ? "Όλα" : DEACT_LABEL[k]} <span className="tabular-nums opacity-80">{k === "all" ? rows.length : counts[k]}</span></button>
            ))}
          </div>

          <ul data-help="deactivate.rows" className="m-0 p-0 list-none grid gap-1.5">
            {shown.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => {
              const can = applies(r), res = results[r.rowNo];
              return (
                <li key={r.rowNo} className={`rounded-lg border p-2 min-w-0 ${res ? (res.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
                  <label className={`flex items-start gap-2 min-w-0 min-h-11 md:min-h-9 ${can && !running && step === 2 ? "cursor-pointer" : ""}`}>
                    <input type="checkbox" checked={can && !off.has(r.rowNo)} disabled={!can || running || step === 3} onChange={() => setOff((x) => { const y = new Set(x); if (y.has(r.rowNo)) y.delete(r.rowNo); else y.add(r.rowNo); return y; })}
                      aria-label={`Επιλογή ${r.title ?? r.key}`} className="size-5 mt-0.5 accent-eu-navy shrink-0 disabled:opacity-40" />
                    <span className="grid gap-0.5 min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className={`${chip} ${STATE_CLS[r.state]}`}>{DEACT_LABEL[r.state]}</span>
                        <span className={`font-bold text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere] ${r.title ? "text-eu-ink" : "text-eu-ink-3"}`}>{r.title ?? (r.fileName || r.key)}</span>
                      </span>
                      <span className="text-eu-muted text-[length:var(--fs-12)] break-all">{[r.code, r.mtrl ? `MTRL ${r.mtrl}` : null, `${r.sheet} · γραμμή ${r.line}`, !r.title ? `στο αρχείο: ${r.key}` : null].filter(Boolean).join(" · ")}</span>
                      {r.problem && <span className="flex gap-1.5 items-start text-eu-ink text-[length:var(--fs-13)]"><CircleAlert className="size-3.5 text-eu-red shrink-0 mt-0.5" aria-hidden />{r.problem}</span>}
                      {r.state === "notfound" && <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Κανένα είδος με αυτό το κλειδί — έλεγξε τον κωδικό στο αρχείο.</span>}
                      {can && ((r.stock ?? 0) > 0 || (r.price ?? 0) > 0) && <span className="flex gap-1.5 items-start text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-3.5 text-eu-navy shrink-0 mt-0.5" aria-hidden />{[(r.stock ?? 0) > 0 ? `απόθεμα ${n(r.stock!)} τεμ.` : null, (r.price ?? 0) > 0 ? `τιμή web ${eur.format(r.price!)}` : null].filter(Boolean).join(" · ")} — σίγουρα να φύγει;</span>}
                      {res && <span className={`flex gap-1.5 items-start text-[length:var(--fs-13)] ${res.ok ? "text-eu-ink" : "text-eu-red"}`}>{res.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}{res.text}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
            {!shown.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Κανένα είδος σε αυτό το φίλτρο.</li>}
          </ul>
          {pages > 1 && (
            <nav aria-label="Σελίδες" className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" className={secondary} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Προηγούμενα</button>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{cur * PAGE + 1}–{Math.min(shown.length, cur * PAGE + PAGE)} από {n(shown.length)}</span>
              <button type="button" className={secondary} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Επόμενα</button>
            </nav>
          )}

          <div data-help="deactivate.run" className="sticky bottom-2 z-10 grid gap-2 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={running} className={`${btn} border-2 border-white/60 text-white hover:bg-white/10`}><ArrowLeft className="size-4" aria-hidden /> {step === 3 ? "Τι βρήκα" : "Αρχείο"}</button>
              <span className={`text-[length:var(--fs-14)] min-w-0 ${progress ? "" : "max-sm:hidden"}`} aria-live="polite">
                {progress ? `${n(progress.done)}/${n(progress.total)} · ${n(okCount)} έγιναν${failCount ? ` · ${n(failCount)} με σφάλμα` : ""}` : "Τίποτα δεν αλλάζει πριν πατήσεις το κουμπί."}
              </span>
              <button type="button" onClick={run} disabled={!todo.length || running || !!lock} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>
                {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PowerOff className="size-4" aria-hidden />} {mode === "web" ? "Βγάλε από το eshop" : "Απενεργοποίηση"} {todo.length ? n(todo.length) : ""}
              </button>
            </div>
            {progress && <progress value={progress.done} max={progress.total || 1} aria-label="Πρόοδος" className="w-full h-2 appearance-none rounded-full overflow-hidden bg-white/20 [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-eu-yellow [&::-moz-progress-bar]:bg-eu-yellow" />}
          </div>
        </section>
      )}
    </div>
  );
}
