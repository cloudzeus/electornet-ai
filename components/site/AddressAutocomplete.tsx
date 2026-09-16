"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import type { AddressSuggestion } from "@/lib/geo/suggest";

/**
 * Πεδίο διεύθυνσης με προτάσεις όσο γράφει ο χρήστης (combobox, πληκτρολόγιο
 * με βέλη/Enter/Escape). Ρωτά το /api/geo/suggest μετά από παύση 350 ms και
 * από 3 χαρακτήρες. Ό,τι διαλέξει έρχεται στο `onSelect` με συντεταγμένες,
 * πόλη και Τ.Κ. όταν τα ξέρει ο πάροχος. Το κείμενο μένει ελεύθερο: αν δεν
 * διαλέξει πρόταση, ισχύει αυτό που έγραψε.
 */
export function AddressAutocomplete({ label, value, onChange, onSelect, required, placeholder = "Οδός και αριθμός, ή Τ.Κ. / πόλη", className = "", dark = false, name = "address" }: {
  label: string; value: string; onChange: (v: string) => void; onSelect?: (s: AddressSuggestion) => void; required?: boolean; placeholder?: string; className?: string; dark?: boolean; name?: string;
}) {
  const id = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const picked = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || picked.current === q) { setItems([]); setLoading(false); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true);
      try {
        const r = await fetch(`/api/geo/suggest?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const j = (await r.json()) as { items: AddressSuggestion[] };
        if (!ac.signal.aborted) { setItems(j.items ?? []); setOpen(true); setActive(-1); }
      } catch { /* ακυρώθηκε ή έπεσε — δεν πειράζει, το πεδίο δουλεύει και χωρίς προτάσεις */ }
      finally { if (!ac.signal.aborted) setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [value]);

  const pick = (s: AddressSuggestion) => {
    const text = s.secondary && !s.label.includes(",") ? `${s.label}, ${s.secondary}` : s.label;
    picked.current = text;
    onChange(text);
    onSelect?.(s);
    setItems([]); setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const labelCls = dark ? "text-eu-on-dark" : "text-eu-ink";
  return (
    <div className={`relative grid gap-1 ${className}`}>
      <label htmlFor={id} className={`font-bold text-[length:var(--fs-14)] ${labelCls}`}>{label}{required && <span aria-hidden> *</span>}</label>
      <div className="relative">
        <input
          id={id} name={name} value={value} required={required} placeholder={placeholder} autoComplete="street-address"
          role="combobox" aria-expanded={open && items.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          onChange={(e) => { picked.current = null; onChange(e.target.value); }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          className="rounded-md border border-eu-line bg-white text-eu-ink px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full pr-9"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden>{loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}</span>
      </div>
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-40 top-full left-0 right-0 mt-1 m-0 p-1 list-none bg-white text-eu-ink rounded-xl border border-eu-line shadow-[var(--shadow-overlay)] max-h-72 overflow-auto">
          {items.map((s, i) => (
            <li key={s.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setActive(i)}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer text-[length:var(--fs-15)] ${i === active ? "bg-eu-chip" : "hover:bg-eu-surface"}`}>
              <MapPin className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
              <span className="min-w-0"><span className="block font-bold text-eu-ink truncate">{s.label}</span>{s.secondary && <span className="block text-eu-muted text-[length:var(--fs-13)] truncate">{s.secondary}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
