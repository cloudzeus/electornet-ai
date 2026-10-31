"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { RULES, strength } from "@/lib/partner-portal/password-rules";
import { focusRing } from "./ui";
import { Field, inputCls } from "./wizard";

const LEVEL = ["Πολύ αδύναμος", "Αδύναμος", "Μέτριος", "Καλός", "Πολύ καλός"];
const COLOR = ["bg-[#b3261e]", "bg-[#d9653b]", "bg-eu-amber", "bg-eu-green", "bg-eu-green"];

/** Νέος κωδικός + επιβεβαίωση με ζωντανή λίστα ελέγχων και ένδειξη δύναμης. `valid` = περνούν όλοι οι κανόνες και ταιριάζουν. */
export function PasswordFields({ email, value, confirm, onChange, onConfirm, idPrefix = "pw" }: { email: string; value: string; confirm: string; onChange: (v: string) => void; onConfirm: (v: string) => void; idPrefix?: string }) {
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const lvl = strength(value);
  const mismatch = !!confirm && confirm !== value;
  return (
    <div className="grid gap-4">
      <Field id={`${idPrefix}-new`} label="Νέος κωδικός" required>
        <div className="relative">
          <input id={`${idPrefix}-new`} type={show ? "text" : "password"} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setTouched(true)} className={`${inputCls()} pr-12`} aria-describedby={`${idPrefix}-rules`} />
          <button type="button" onClick={() => setShow((v) => !v)} className={`absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center size-10 rounded-lg text-eu-ink-3 hover:bg-eu-surface-2 ${focusRing}`} aria-label={show ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"} aria-pressed={show}>{show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}</button>
        </div>
      </Field>
      <div className="grid gap-1.5" aria-live="polite">
        <div className="grid grid-cols-4 gap-1" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full transition-colors duration-300 ${value && i < Math.max(1, lvl) ? COLOR[lvl] : "bg-eu-surface-3"}`} />)}</div>
        {value && <span className="text-[length:var(--fs-13)] font-bold text-eu-ink-2">Δύναμη: {LEVEL[lvl]}</span>}
      </div>
      <ul id={`${idPrefix}-rules`} className="m-0 p-0 list-none grid gap-1.5 sm:grid-cols-2">
        {RULES.map((r) => {
          const ok = r.test(value, email);
          return <li key={r.key} className={`flex items-center gap-2 text-[length:var(--fs-13)] ${ok ? "text-eu-green font-bold" : touched ? "text-[#b3261e]" : "text-eu-ink-3"}`}>{ok ? <Check className="size-4 shrink-0" aria-hidden /> : <X className="size-4 shrink-0" aria-hidden />}{r.label}<span className="sr-only">{ok ? " — ισχύει" : " — δεν ισχύει ακόμη"}</span></li>;
        })}
      </ul>
      <Field id={`${idPrefix}-confirm`} label="Ξανά ο νέος κωδικός" required error={mismatch ? "Οι δύο κωδικοί δεν ταιριάζουν" : undefined}>
        <input id={`${idPrefix}-confirm`} type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} className={inputCls(mismatch)} />
      </Field>
    </div>
  );
}
export const passwordValid = (p: string, c: string, email: string) => RULES.every((r) => r.test(p, email)) && p === c;
