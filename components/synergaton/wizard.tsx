"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Dialog as D } from "@base-ui/react/dialog";
import { btn, focusRing } from "./ui";

/**
 * Wizard της πύλης: stepper (αριθμοί/τικ, προσβάσιμος), ένα βήμα τη φορά, «Επόμενο» μόνο όταν περνούν οι έλεγχοι του
 * βήματος, πάντα «Πίσω» και έξοδος. Στο κινητό συμπαγής κεφαλίδα «Βήμα 2 από 5» + μπάρα. Η εστίαση πάει στον τίτλο
 * του βήματος σε κάθε αλλαγή (screen readers), η μετάβαση είναι fade/slide 200ms και σβήνει με reduced motion.
 */
export type WizardStep = { key: string; title: string; hint?: string; optional?: boolean };

export function Wizard({ steps, current, done, onStep, children, footer, title }: {
  steps: WizardStep[];
  current: number;
  /** βήματα που έχουν ολοκληρωθεί (κλικ επιτρέπεται σε αυτά και στο αμέσως επόμενο) */
  done: Set<string>;
  onStep: (i: number) => void;
  children: ReactNode;
  footer: ReactNode;
  title: string;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } head.current?.focus(); }, [current]);
  const s = steps[current];
  const reachable = (i: number) => i <= current || done.has(steps[i - 1]?.key ?? "") || steps.slice(0, i).every((x) => done.has(x.key));
  const pct = ((current + (done.has(s.key) ? 1 : 0.5)) / steps.length) * 100;

  return (
    <div className="grid gap-4 min-w-0" aria-label={title}>
      {/* κινητό */}
      <div className="lg:hidden grid gap-2">
        <div className="flex items-center justify-between text-[length:var(--fs-13)]">
          <span className="font-bold text-eu-navy">Βήμα {current + 1} από {steps.length}</span>
          <span className="text-eu-ink-3">{steps[current + 1] ? `Μετά: ${steps[current + 1].title}` : "Τελευταίο βήμα"}</span>
        </div>
        <ProgressLine pct={pct} />
      </div>
      {/* υπολογιστής */}
      <ol className="hidden lg:flex m-0 p-0 list-none items-stretch gap-2" aria-label="Βήματα">
        {steps.map((st, i) => {
          const isDone = done.has(st.key), isCur = i === current, can = reachable(i);
          return (
            <li key={st.key} className="flex-1 min-w-0">
              <button type="button" disabled={!can} onClick={() => onStep(i)} aria-current={isCur ? "step" : undefined}
                className={`w-full text-left rounded-xl px-3 py-2.5 border-2 transition-colors duration-200 min-h-11 flex items-center gap-2.5 ${focusRing} ${isCur ? "border-eu-navy bg-white shadow-sm" : isDone ? "border-transparent bg-eu-chip hover:border-eu-blue/30 cursor-pointer" : "border-transparent bg-eu-surface-2 disabled:cursor-not-allowed"}`}>
                <span className={`grid place-items-center size-7 rounded-full shrink-0 font-extrabold text-[length:var(--fs-13)] ${isDone ? "bg-eu-green text-white" : isCur ? "bg-eu-navy text-white" : "bg-white text-eu-muted border border-eu-line"}`}>
                  {isDone ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate font-bold text-[length:var(--fs-13)] ${isCur ? "text-eu-ink" : "text-eu-ink-2"}`}>{st.title}</span>
                  <span className="block truncate text-eu-ink-3 text-[length:var(--fs-12)]">{isDone ? "Ολοκληρώθηκε" : isCur ? "Τώρα" : st.optional ? "Προαιρετικό" : "Επόμενο"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-eu-line bg-white min-w-0 overflow-hidden">
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <h2 ref={head} tabIndex={-1} className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-22)] leading-tight outline-none">{s.title}</h2>
          {s.hint && <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">{s.hint}</p>}
        </div>
        <div key={s.key} className="px-4 py-4 sm:px-6 sm:py-5 animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">{children}</div>
        <div className="sticky bottom-0 z-10 border-t border-eu-line bg-white/95 supports-backdrop-filter:backdrop-blur px-4 py-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      </section>
    </div>
  );
}

export function ProgressLine({ pct }: { pct: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (ref.current) ref.current.style.transform = `scaleX(${Math.max(0, Math.min(1, pct / 100))})`; }, [pct]);
  return <div className="relative h-2 rounded-full bg-eu-surface-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος"><span ref={ref} className="absolute inset-0 origin-left scale-x-0 rounded-full bg-eu-yellow transition-transform duration-500 ease-out motion-reduce:transition-none" /></div>;
}

/** Το κάτω μέρος του wizard: Πίσω · (μήνυμα) · Επόμενο. */
export function WizardNav({ onBack, onNext, nextLabel = "Συνέχεια", nextDisabled, busy, backLabel = "Πίσω", note, extra }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean; backLabel?: string; note?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onBack ? <button type="button" onClick={onBack} disabled={busy} className={btn("ghost")}><ChevronLeft className="size-4" aria-hidden /> {backLabel}</button> : <span />}
      <div className="flex-1 min-w-[8rem] text-eu-ink-3 text-[length:var(--fs-13)]" aria-live="polite">{note}</div>
      {extra}
      {onNext && (
        <button type="button" onClick={onNext} disabled={nextDisabled || busy} className={btn("primary")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{nextLabel}{!busy && <ChevronRight className="size-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}

// ---------- Πεδία ----------

export function Field({ id, label, help, error, required, children, counter }: { id: string; label: string; help?: ReactNode; error?: string; required?: boolean; children: ReactNode; counter?: string }) {
  return (
    <div className="grid gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}{required ? <span className="text-[#b3261e]" aria-hidden> *</span> : <span className="text-eu-muted font-normal text-[length:var(--fs-12)]"> (προαιρετικό)</span>}</label>
        {counter && <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{counter}</span>}
      </div>
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="m-0 text-[#b3261e] text-[length:var(--fs-13)] font-bold">{error}</p> : help ? <p id={`${id}-help`} className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{help}</p> : null}
    </div>
  );
}

export const inputCls = (err?: boolean) => `w-full min-w-0 min-h-12 rounded-xl border-2 bg-white px-3.5 text-eu-ink text-[length:var(--fs-15)] placeholder:text-eu-muted-2 transition-colors duration-150 ${focusRing} ${err ? "border-[#e0786e] bg-[#fffafa]" : "border-eu-line hover:border-eu-muted-3 focus:border-eu-blue"}`;

// ---------- Modal εξέλιξης ----------

export type ProgressStep = { key: string; label: string; state: "todo" | "run" | "ok" | "fail" | "skip"; detail?: string; ms?: number };

/**
 * Modal εξέλιξης για μακριές εργασίες (έλεγχος σύνδεσης, ανέβασμα, αποθήκευση). Δεν κλείνει όσο τρέχει (η εργασία
 * συνεχίζει στον server), δείχνει χρόνο, κάθε βήμα με εικονίδιο + κείμενο, και στο τέλος σύνοψη με ενέργειες.
 */
export function ProgressModal({ open, title, steps, running, startedAt, result, onClose }: { open: boolean; title: string; steps: ProgressStep[]; running: boolean; startedAt: number | null; result?: ReactNode; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 250); return () => { clearInterval(t); setNow(Date.now()); }; }, [running]);
  const secs = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
  const okN = steps.filter((s) => s.state === "ok").length;
  return (
    <D.Root open={open} onOpenChange={(o, e) => { if (!o && running) { e.cancel(); return; } if (!o) onClose(); }}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-50 bg-eu-navy/45 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <D.Popup className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[min(36rem,calc(100vw-2rem))] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 sm:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none">
          <div className="bg-eu-navy text-white px-5 pt-5 pb-4 sm:rounded-t-3xl">
            <div className="flex items-start justify-between gap-3">
              <D.Title className="m-0 font-heading font-extrabold text-[length:var(--fs-20)] leading-tight">{title}</D.Title>
              {!running && <D.Close className={`grid place-items-center size-11 -mr-2 -mt-2 rounded-full hover:bg-white/10 ${focusRing}`} aria-label="Κλείσιμο"><X className="size-5" aria-hidden /></D.Close>}
            </div>
            <D.Description className="m-0 mt-1 text-eu-on-dark text-[length:var(--fs-13)]" aria-live="polite">
              {running ? `Σε εξέλιξη · ${secs.toFixed(0)}″ — μην κλείσετε τη σελίδα` : `Ολοκληρώθηκε σε ${secs.toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}″ · ${okN}/${steps.filter((s) => s.state !== "skip").length} βήματα επιτυχή`}
            </D.Description>
            <div className="mt-3"><ProgressLine pct={running ? Math.min(92, (okN / Math.max(1, steps.length)) * 100 + 8) : 100} /></div>
          </div>
          <ol className="m-0 p-0 list-none px-5 py-4 grid gap-1" aria-label="Βήματα">
            {steps.map((s) => (
              <li key={s.key} className={`flex gap-3 items-start rounded-xl px-2 py-2 ${s.state === "run" ? "bg-eu-chip" : ""}`}>
                <StepIcon state={s.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`font-bold text-[length:var(--fs-14)] ${s.state === "todo" || s.state === "skip" ? "text-eu-muted" : "text-eu-ink"}`}>{s.label}</span>
                    {s.ms !== undefined && <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}″`}</span>}
                  </div>
                  {s.detail && <p className={`m-0 text-[length:var(--fs-13)] leading-snug break-words ${s.state === "fail" ? "text-[#b3261e]" : "text-eu-ink-3"}`}>{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
          {!running && result && <div className="px-5 pb-5 grid gap-3">{result}</div>}
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

function StepIcon({ state }: { state: ProgressStep["state"] }) {
  const base = "grid place-items-center size-6 rounded-full shrink-0 mt-0.5";
  if (state === "run") return <span className={`${base} bg-eu-blue text-white`}><Loader2 className="size-3.5 animate-spin" aria-hidden /><span className="sr-only">σε εξέλιξη</span></span>;
  if (state === "ok") return <span className={`${base} bg-eu-green text-white animate-in zoom-in-50 duration-200 motion-reduce:animate-none`}><Check className="size-3.5" aria-hidden /><span className="sr-only">επιτυχία</span></span>;
  if (state === "fail") return <span className={`${base} bg-[#b3261e] text-white`}><X className="size-3.5" aria-hidden /><span className="sr-only">αποτυχία</span></span>;
  return <span className={`${base} border-2 border-eu-line bg-white`}><span className="sr-only">{state === "skip" ? "παραλείφθηκε" : "σε αναμονή"}</span></span>;
}

/** Επιβεβαίωση πριν από αλλαγή (με σύνοψη διαφορών). */
export function ConfirmModal({ open, title, children, confirmLabel, onConfirm, onCancel, busy, tone = "primary" }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; tone?: "primary" | "danger" }) {
  return (
    <D.Root open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-50 bg-eu-navy/45 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <D.Popup className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[min(32rem,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl p-5 outline-none grid gap-4 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 sm:data-open:zoom-in-95 motion-reduce:animate-none">
          <D.Title className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-20)]">{title}</D.Title>
          <div className="text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">{children}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className={btn("ghost")}>Άκυρο</button>
            <button type="button" onClick={onConfirm} disabled={busy} className={btn(tone === "danger" ? "danger" : "primary")}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{confirmLabel}</button>
          </div>
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

/** Τρέχει μια μακριά εργασία με «ψευδο-βήματα» που προχωρούν όσο περιμένουμε τον server, και μετά δείχνει τα πραγματικά. */
export function useProgress(initial: ProgressStep[]) {
  const [steps, setSteps] = useState<ProgressStep[]>(initial);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  async function run<T>(fn: () => Promise<T>, plan: ProgressStep[], pace = 1400): Promise<T> {
    setSteps(plan.map((s, i) => ({ ...s, state: i === 0 ? "run" : "todo" })));
    setOpen(true); setRunning(true); setStartedAt(Date.now());
    let i = 0;
    timer.current = setInterval(() => {
      i = Math.min(i + 1, plan.length - 1);
      setSteps((cur) => cur.map((s, j) => (j < i && s.state === "run" ? { ...s, state: "run" } : j === i && s.state === "todo" ? { ...s, state: "run" } : s)));
    }, pace);
    try { return await fn(); } finally { if (timer.current) clearInterval(timer.current); setRunning(false); }
  }
  return { steps, setSteps, running, open, setOpen, startedAt, run };
}
