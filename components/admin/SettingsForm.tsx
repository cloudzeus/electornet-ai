"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, PlugZap, Check, TriangleAlert } from "lucide-react";
import type { Section, Field } from "@/lib/settings/schema";
import { saveSection, testSection, type ActionResult } from "@/app/admin/(shell)/settings/actions";

/**
 * Renders one settings section from its schema. Secrets are never sent back
 * to the browser: a stored secret shows «•••••• αποθηκευμένο» with a change /
 * clear affordance. «Δοκιμή σύνδεσης» posts the current (unsaved) values.
 */
export function SettingsForm({ section, data, secretSet }: { section: Section; data: Record<string, string | number | boolean>; secretSet: Record<string, boolean> }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [dirty, setDirty] = useState(false);
  return (
    <form
      onChange={() => setDirty(true)}
      action={(fd) => start(async () => { const r = await saveSection(section.key, fd); setResult(r); if (r.ok) setDirty(false); })}
      className="rounded-2xl bg-white border border-eu-line overflow-hidden"
    >
      <div className="p-5 @md:p-6 border-b border-eu-line">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{section.title}</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">{section.description}</p>
      </div>
      {result && (
        <div role="status" aria-live="polite" className={`px-5 @md:px-6 py-3 border-b border-eu-line flex items-start gap-2 font-bold text-[length:var(--fs-14)] ${result.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>
          {result.ok ? <Check className="size-4 mt-0.5 shrink-0" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />}
          <div>
            {result.message}
            {result.details && (
              <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-normal text-eu-ink">
                {Object.entries(result.details).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-eu-muted">{k}</dt><dd className="m-0 font-bold">{v ?? "—"}</dd></div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
      <div className="p-5 @md:p-6 grid grid-cols-1 @2xl:grid-cols-2 gap-x-5 gap-y-4">
        {section.fields.map((f) => (
          <FieldInput key={f.key} field={f} value={data[f.key]} stored={!!secretSet[f.key]} />
        ))}
      </div>
      <div className="px-5 @md:px-6 py-4 border-t border-eu-line bg-eu-surface/60 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-11 hover:bg-eu-blue disabled:opacity-50">
          {pending ? "Αποθήκευση…" : "Αποθήκευση"}
        </button>
        {section.test && (
          <button
            type="button"
            disabled={testing}
            onClick={(e) => { const fd = new FormData(e.currentTarget.form!); startTest(async () => setResult(await testSection(section.key, fd))); }}
            className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-navy hover:text-white disabled:opacity-50 transition-colors"
          >
            <PlugZap className="size-4" aria-hidden /> {testing ? "Δοκιμή…" : "Δοκιμή σύνδεσης"}
          </button>
        )}
        {dirty && <span className="text-eu-muted text-[length:var(--fs-14)]">Μη αποθηκευμένες αλλαγές</span>}
      </div>
    </form>
  );
}

const box = "rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue bg-white w-full";

function FieldInput({ field: f, value, stored }: { field: Field; value: string | number | boolean | undefined; stored: boolean }) {
  const [show, setShow] = useState(false);
  const [change, setChange] = useState(!stored);
  const span = f.width === "half" ? "" : "@2xl:col-span-2";
  const label = (
    <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">
      {f.label} {f.required && <span className="text-eu-red" aria-hidden>*</span>}
    </span>
  );
  const help = f.help && <span className="text-eu-muted text-[length:var(--fs-13)] font-normal">{f.help}</span>;
  if (f.type === "toggle") {
    return (
      <label className={`flex items-center justify-between gap-3 rounded-xl border-2 border-eu-line px-3 min-h-12 cursor-pointer has-checked:border-eu-navy ${span}`}>
        <span className="grid">{label}{help}</span>
        <input type="checkbox" name={f.key} defaultChecked={value === true} className="peer sr-only" />
        <span className="relative w-11 h-6 rounded-full bg-eu-line-3 peer-checked:bg-eu-navy transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" aria-hidden />
      </label>
    );
  }
  if (f.type === "secret") {
    return (
      <div className={`grid gap-1 ${span}`}>
        <label className="grid gap-1">
          {label}
          {change ? (
            <span className="relative flex">
              <input type={show ? "text" : "password"} name={f.key} autoComplete="new-password" placeholder={stored ? "Νέα τιμή (κενό = παραμένει)" : ""} className={`${box} pr-12`} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Απόκρυψη" : "Εμφάνιση"} className="absolute right-1 top-1/2 -translate-y-1/2 size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface">
                {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </span>
          ) : (
            <span className={`${box} flex items-center justify-between gap-2 bg-eu-surface`}>
              <span className="text-eu-ink-3 tracking-widest">••••••••</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => setChange(true)} className="rounded-full px-3 min-h-9 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-blue/10">Αλλαγή</button>
                <label className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10 cursor-pointer">
                  <input type="checkbox" name={`${f.key}__clear`} className="size-4 accent-eu-red" /> Διαγραφή
                </label>
              </span>
            </span>
          )}
        </label>
        {help}
        {stored && <span className="text-eu-green text-[length:var(--fs-13)] font-bold">Αποθηκευμένο κρυπτογραφημένα</span>}
      </div>
    );
  }
  if (f.type === "select") {
    return (
      <label className={`grid gap-1 ${span}`}>
        {label}
        <select name={f.key} defaultValue={String(value ?? f.options?.[0]?.value ?? "")} className={box}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {help}
      </label>
    );
  }
  if (f.type === "textarea") {
    return (
      <label className={`grid gap-1 ${span}`}>
        {label}
        <textarea name={f.key} rows={3} defaultValue={String(value ?? "")} placeholder={f.placeholder} className={`${box} py-2 font-mono text-[length:var(--fs-14)]`} />
        {help}
      </label>
    );
  }
  return (
    <label className={`grid gap-1 ${span}`}>
      {label}
      <input type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"} name={f.key} defaultValue={value === undefined ? "" : String(value)} placeholder={f.placeholder} step={f.type === "number" ? "any" : undefined} className={box} />
      {help}
    </label>
  );
}
