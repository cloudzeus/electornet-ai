"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, TriangleAlert, CircleCheck, CircleDashed, CircleAlert, Loader2 } from "lucide-react";

/**
 * Δομικά στοιχεία για όλες τις σελίδες ρυθμίσεων: κάθε πεδίο έχει ορατή εξήγηση, έλεγχο μορφής καθώς γράφεις,
 * και οι αλλαγές δεν χάνονται σιωπηλά (μπάρα αποθήκευσης + προειδοποίηση πριν φύγεις από τη σελίδα).
 */

export const inputCls = "w-full min-w-0 rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue bg-white";

export type Verdict = { ok: boolean; msg: string } | null;
/** κανόνας μορφής: regex + μήνυμα όταν δεν ταιριάζει (και προαιρετικά όταν ταιριάζει) */
export type Rule = { re: RegExp; bad: string; good?: string };
export const checkValue = (v: string, rule?: Rule): Verdict => (!rule || !v.trim() ? null : rule.re.test(v.trim()) ? { ok: true, msg: rule.good ?? "Σωστή μορφή" } : { ok: false, msg: rule.bad });

function Feedback({ c, id }: { c: Verdict; id: string }) {
  if (!c) return null;
  return <span id={id} role={c.ok ? undefined : "alert"} className={`inline-flex items-start gap-1.5 text-[length:var(--fs-13)] font-bold ${c.ok ? "text-eu-green" : "text-eu-amber"}`}>{c.ok ? <Check className="size-4 shrink-0" aria-hidden /> : <TriangleAlert className="size-4 shrink-0" aria-hidden />}{c.msg}</span>;
}

/** Ετικέτα + πεδίο + εξήγηση + έλεγχος μορφής. */
export function TextField({ name, label, help, value, onChange, placeholder, rule, required, type = "text", mono = false, autoComplete = "off", min, max, step, unit, error, inputMode }: { name: string; label: string; help?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; rule?: Rule; required?: boolean; type?: string; mono?: boolean; autoComplete?: string; min?: number; max?: number; step?: number | "any"; unit?: string; error?: string | null; inputMode?: "numeric" | "decimal" | "email" | "url" | "tel" | "text" }) {
  const id = useId();
  const n = type === "number" && value !== "" ? Number(value) : null;
  const range: Verdict = n === null ? null : Number.isNaN(n) ? { ok: false, msg: "Δεν είναι αριθμός" } : min !== undefined && n < min ? { ok: false, msg: `Ελάχιστο ${min}${unit ? ` ${unit}` : ""}` } : max !== undefined && n > max ? { ok: false, msg: `Μέγιστο ${max}${unit ? ` ${unit}` : ""}` } : null;
  const c: Verdict = error ? { ok: false, msg: error } : range ?? checkValue(value, rule);
  return (
    <label className="grid gap-1 min-w-0" htmlFor={id}>
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}{required && <span className="text-eu-red" aria-hidden> *</span>}</span>
      <span className="relative flex items-center">
        <input id={id} name={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} spellCheck={false} min={min} max={max} step={type === "number" ? step ?? "any" : undefined} inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)} aria-describedby={c ? `${id}-c` : undefined} aria-invalid={c ? !c.ok : undefined} aria-required={required || undefined} className={`${inputCls} ${mono ? "font-mono text-[length:var(--fs-15)]" : ""} ${unit ? "pr-14" : ""} ${c && !c.ok ? (error ? "border-eu-red" : "border-eu-amber") : ""}`} />
        {unit && <span className="pointer-events-none absolute right-3 text-eu-muted font-bold text-[length:var(--fs-14)]">{unit}</span>}
      </span>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] font-normal leading-snug">{help}</span>}
      <Feedback c={c} id={`${id}-c`} />
    </label>
  );
}

/**
 * Μυστικό (κωδικός, secret, ιδιωτικό κλειδί): ποτέ δεν επιστρέφει στον browser. Αν υπάρχει, φαίνεται «αποθηκευμένο»
 * με «Αλλαγή» / «Διαγραφή». Το όνομα `<key>__clear` λέει στον server να το σβήσει.
 */
export function SecretField({ name, label, help, stored, rule, multiline = false, required = false, onChange, onDirty }: { name: string; label: string; help?: ReactNode; stored: boolean; rule?: Rule; multiline?: boolean; required?: boolean; onChange?: (v: string) => void; onDirty?: () => void }) {
  const id = useId();
  const [edit, setEdit] = useState(!stored);
  const [show, setShow] = useState(false);
  const [clear, setClear] = useState(false);
  const [v, setV] = useState("");
  const c = checkValue(v, rule);
  const set = (x: string) => { setV(x); onChange?.(x); onDirty?.(); };
  return (
    <div className="grid gap-1 min-w-0">
      <label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}{required && <span className="text-eu-red" aria-hidden> *</span>}</label>
      {!edit ? (
        <div className={`${inputCls} flex flex-wrap items-center justify-between gap-2 bg-eu-surface py-1.5`}>
          <span className="inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><CircleCheck className="size-4" aria-hidden /> {clear ? <s className="text-eu-red">Αποθηκευμένο</s> : "Αποθηκευμένο (κρυπτογραφημένα)"}</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => { setEdit(true); setClear(false); }} className="rounded-full px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-blue/10">Αλλαγή</button>
            <button type="button" onClick={() => { setClear((x) => !x); onDirty?.(); }} aria-pressed={clear} className={`rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] ${clear ? "bg-eu-red text-white" : "text-eu-red hover:bg-eu-red/10"}`}>{clear ? "Θα διαγραφεί" : "Διαγραφή"}</button>
          </span>
          {clear && <input type="hidden" name={`${name}__clear`} value="on" />}
        </div>
      ) : multiline ? (
        <textarea id={id} name={name} rows={5} value={v} onChange={(e) => set(e.target.value)} spellCheck={false} autoComplete="off" placeholder={stored ? "Νέα τιμή (κενό = παραμένει η αποθηκευμένη)" : "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"} className={`${inputCls} py-2 font-mono text-[length:var(--fs-14)] ${show ? "" : "[-webkit-text-security:disc]"}`} />
      ) : (
        <span className="relative flex">
          <input id={id} name={name} type={show ? "text" : "password"} value={v} onChange={(e) => set(e.target.value)} autoComplete="new-password" spellCheck={false} placeholder={stored ? "Νέα τιμή (κενό = παραμένει η αποθηκευμένη)" : ""} className={`${inputCls} pr-12 font-mono text-[length:var(--fs-15)] ${c && !c.ok ? "border-eu-amber" : ""}`} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Απόκρυψη" : "Εμφάνιση"} className="absolute right-1 top-1/2 -translate-y-1/2 size-11 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface">{show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
        </span>
      )}
      {edit && multiline && <button type="button" onClick={() => setShow((s) => !s)} className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] min-h-9">{show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}{show ? "Απόκρυψη" : "Εμφάνιση"}</button>}
      {edit && stored && <button type="button" onClick={() => { setEdit(false); set(""); }} className="justify-self-start text-eu-muted font-bold text-[length:var(--fs-13)] hover:underline min-h-9">Άκυρο — κράτα την αποθηκευμένη</button>}
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
      <Feedback c={c} id={`${id}-c`} />
    </div>
  );
}

/** Διακόπτης με τίτλο και εξήγηση. */
export function ToggleField({ name, label, help, checked, onChange }: { name: string; label: string; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 min-h-14 cursor-pointer ${checked ? "border-eu-navy bg-eu-chip" : "border-eu-line bg-white"}`}>
      <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{label}</span>{help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}</span>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative shrink-0 w-12 h-7 rounded-full bg-eu-line-3 peer-checked:bg-eu-navy peer-focus-visible:outline-2 peer-focus-visible:outline-eu-blue transition-colors after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" aria-hidden />
    </label>
  );
}

/** Τιμή που αντιγράφεται σε άλλη κονσόλα (redirect URI, domain…). */
export function CopyValue({ label, value, help }: { label: string; value: string; help?: ReactNode }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* χωρίς πρόσβαση στο πρόχειρο */ } };
  return (
    <div className="grid gap-1 min-w-0">
      <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{label}</span>
      <div className="flex items-stretch gap-1 min-w-0">
        <code className="flex-1 min-w-0 rounded-lg bg-eu-surface border border-eu-line px-3 py-2 font-mono text-[length:var(--fs-14)] text-eu-ink break-all">{value}</code>
        <button type="button" onClick={copy} aria-label={`Αντιγραφή: ${label}`} className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 min-h-11 font-bold text-[length:var(--fs-13)] border-2 ${done ? "border-eu-green bg-eu-green text-white" : "border-eu-line hover:border-eu-navy"}`}>{done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}<span className="hidden @md:inline">{done ? "Αντιγράφηκε" : "Αντιγραφή"}</span></button>
      </div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
    </div>
  );
}

export type Status = "live" | "ready" | "incomplete" | "off";
export function StatusPill({ status, text }: { status: Status; text: string }) {
  const s = { live: ["bg-eu-green/15 text-eu-green", CircleCheck], ready: ["bg-eu-chip text-eu-blue", CircleDashed], incomplete: ["bg-eu-amber/15 text-eu-amber", CircleAlert], off: ["bg-eu-surface text-eu-muted", CircleDashed] } as const;
  const [cls, Icon] = s[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${cls}`}><Icon className="size-3.5" aria-hidden />{text}</span>;
}

/**
 * Σταθερή μπάρα αποθήκευσης στο κάτω μέρος της οθόνης (πάντα ορατή, και σε κινητό) + προστασία από απώλεια αλλαγών:
 * προειδοποίηση πριν κλείσει/ανανεωθεί η σελίδα ή πριν πατηθεί σύνδεσμος προς άλλη σελίδα του admin.
 */
export function SaveBar({ dirty, pending, label = "Αποθήκευση", extra, top, note }: { dirty: boolean; pending: boolean; label?: string; extra?: ReactNode; top?: ReactNode; note?: ReactNode }) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.hash)) return;
      if (!window.confirm("Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν. Να φύγεις χωρίς αποθήκευση;")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
  return (
    <div className="sticky bottom-0 z-20 -mx-4 @md:-mx-6 px-4 @md:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-eu-line grid gap-2 shadow-[0_-6px_16px_-12px_rgba(0,0,0,0.25)]">
      {top}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending || !dirty} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-40 grow @md:grow-0">{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}{pending ? "Αποθήκευση…" : label}</button>
        {extra}
        <span role="status" className={`text-[length:var(--fs-14)] font-semibold ${dirty ? "text-eu-amber" : "text-eu-muted"}`}>{dirty ? "● Μη αποθηκευμένες αλλαγές" : "Όλα αποθηκευμένα"}</span>
      </div>
      {note && <p className="m-0 hidden @md:block text-eu-muted text-[length:var(--fs-13)] leading-snug">{note}</p>}
    </div>
  );
}

export function ResultBanner({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div role={ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 flex items-start gap-2 font-bold text-[length:var(--fs-14)] ${ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{ok ? <Check className="size-4 mt-0.5 shrink-0" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />}<div className="min-w-0">{children}</div></div>;
}

export function SelectField({ name, label, help, value, onChange, options, required }: { name: string; label: string; help?: ReactNode; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  return (
    <label className="grid gap-1 min-w-0" htmlFor={id}>
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}{required && <span className="text-eu-red" aria-hidden> *</span>}</span>
      <select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-8 truncate`} title={current?.label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </label>
  );
}

export function TextAreaField({ name, label, help, value, onChange, placeholder, rows = 3 }: { name: string; label: string; help?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <label className="grid gap-1 min-w-0" htmlFor={id}>
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      <textarea id={id} name={name} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} className={`${inputCls} py-2 font-mono text-[length:var(--fs-14)]`} />
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </label>
  );
}

/** Ομάδα πεδίων σε κάρτα: τίτλος + μία πρόταση «τι ρυθμίζεις εδώ» + πεδία σε πλέγμα που γίνεται μία στήλη σε στενή οθόνη. */
export function FieldGroup({ title, help, children, aside, id }: { title: string; help?: ReactNode; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="m-0 min-w-0 rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4 scroll-mt-24">
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]" aria-hidden>{title}</h3>
          {help && <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug max-w-[75ch]">{help}</p>}
        </div>
        {aside}
      </div>
      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-5 gap-y-4 items-start">{children}</div>
    </fieldset>
  );
}

export function Details({ details }: { details?: Record<string, string | number | null> }) {
  if (!details) return null;
  return (
    <dl className="m-0 mt-1 grid gap-y-1 font-normal text-eu-ink">
      {Object.entries(details).map(([k, v]) => (
        <div key={k} className="grid @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-3 min-w-0"><dt className="text-eu-muted">{k}</dt><dd className="m-0 font-bold break-all">{v ?? "—"}</dd></div>
      ))}
    </dl>
  );
}
