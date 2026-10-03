"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Images, Plus, X } from "lucide-react";
import { ImagePickerDialog } from "./ImagePicker";
import { inputCls } from "@/components/admin/settings/ui";

/** Μικρά, κοινά πεδία του editor σελίδων μάρκας — πάντα με ορατή εξήγηση και μετρητή όπου μετρά το μήκος. */

function Count({ n, max }: { n: number; max?: number }) {
  if (!max) return null;
  return <span className={`text-[length:var(--fs-13)] font-bold tabular-nums ${n > max ? "text-eu-amber" : "text-eu-muted"}`}>{n}/{max}</span>;
}

export function Txt({ label, value, onChange, help, placeholder, max, mono, inputMode }: { label: string; value: string; onChange: (v: string) => void; help?: ReactNode; placeholder?: string; max?: number; mono?: boolean; inputMode?: "url" | "text" }) {
  const id = useId();
  return (
    <div className="grid gap-1 min-w-0">
      <span className="flex items-baseline justify-between gap-2"><label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</label><Count n={value.length} max={max} /></span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} spellCheck={!mono} className={`${inputCls} ${mono ? "font-mono text-[length:var(--fs-15)]" : ""}`} />
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </div>
  );
}

export function Area({ label, value, onChange, help, placeholder, max, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; help?: ReactNode; placeholder?: string; max?: number; rows?: number }) {
  const id = useId();
  return (
    <div className="grid gap-1 min-w-0">
      <span className="flex items-baseline justify-between gap-2"><label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</label><Count n={value.length} max={max} /></span>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} py-2 leading-relaxed`} />
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </div>
  );
}

const okHref = (h: string) => !h || /^\/[^\s]*$/.test(h) || /^https:\/\/[^\s]+$/.test(h);
export function LinkField({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: ReactNode }) {
  return (
    <div className="grid gap-1 min-w-0">
      <Txt label={label} value={value} onChange={onChange} mono inputMode="url" placeholder="/k/eikona-ixos/tileoraseis?brand=lg" help={help ?? "Σελίδα του site (ξεκινά με /) ή εξωτερικό https://. Αντέγραψε τη διεύθυνση από τον browser, χωρίς το domain."} />
      {!okHref(value) && <span className="text-eu-red font-bold text-[length:var(--fs-13)]">Ο σύνδεσμος πρέπει να ξεκινά με / ή https://</span>}
    </div>
  );
}

/** URL εικόνας ή βίντεο: επιλογή από φωτογραφίες προϊόντος, από tags ή από τη βιβλιοθήκη media, με προεπισκόπηση. */
export function MediaUrl({ label, value, onChange, help, kind = "image" }: { label: string; value: string; onChange: (v: string) => void; help?: ReactNode; kind?: "image" | "video" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="grid gap-1 min-w-0">
      <label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</label>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] @md:grid-cols-[auto_minmax(0,1fr)_auto] gap-2 items-center">
        <span className="size-12 rounded-lg border border-eu-line bg-eu-surface bg-center bg-contain bg-no-repeat" style={value && kind === "image" ? { backgroundImage: `url("${value}")` } : undefined} aria-hidden />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://euronics.b-cdn.net/…" spellCheck={false} className={`${inputCls} font-mono text-[length:var(--fs-14)]`} />
        <button type="button" onClick={() => setOpen(true)} className="col-span-2 @md:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Images className="size-4" aria-hidden /> Επιλογή</button>
      </div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
      {open && <ImagePickerDialog kind={kind} current={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Λίστα σύντομων κειμένων (στοιχεία εγγύησης, ερωτήσεις για τον Ερμή, γραμμές τίτλου). */
export function StringList({ label, help, items, onChange, placeholder, addLabel = "Προσθήκη", max }: { label: string; help?: ReactNode; items: string[]; onChange: (v: string[]) => void; placeholder?: string; addLabel?: string; max?: number }) {
  const set = (i: number, v: string) => onChange(items.map((x, k) => (k === i ? v : x)));
  const move = (i: number, d: number) => { const x = [...items]; [x[i], x[i + d]] = [x[i + d], x[i]]; onChange(x); };
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-2 min-w-0">
      <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">{label}</legend>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-1 min-w-0">
          <input value={v} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} aria-label={`${label} ${i + 1}`} className={inputCls} />
          {items.length > 1 && <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Πιο πάνω" className="shrink-0 size-10 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>}
          {items.length > 1 && <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Πιο κάτω" className="shrink-0 size-10 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>}
          <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Αφαίρεση" className="shrink-0 size-10 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><X className="size-4" aria-hidden /></button>
        </div>
      ))}
      {(!max || items.length < max) && <button type="button" onClick={() => onChange([...items, ""])} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-3 min-h-10 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> {addLabel}</button>}
    </fieldset>
  );
}

/** ISO ↔ <input type="datetime-local"> (ώρα Ελλάδας του browser) */
export const toLocal = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(+d)) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

export function DateTime({ label, value, onChange, help }: { label: string; value?: string; onChange: (iso: string | undefined) => void; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1 min-w-0">
      <label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</label>
      <span className="flex gap-1">
        <input id={id} type="datetime-local" value={toLocal(value)} onChange={(e) => onChange(fromLocal(e.target.value))} className={inputCls} />
        {value && <button type="button" onClick={() => onChange(undefined)} aria-label={`Καθαρισμός: ${label}`} className="shrink-0 size-12 grid place-items-center rounded-full text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>}
      </span>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </div>
  );
}
