"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type PickOpt = { id: string; name: string; hint?: string };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("el-GR").replace(/ς/g, "σ");

/**
 * Επιλογή από μεγάλη λίστα (1.300 μάρκες, εκατοντάδες κατηγορίες) χωρίς <select> χιλιάδων <option>: κλειστό είναι ένα
 * κουμπί με την τρέχουσα τιμή· ανοιχτό, αναζήτηση με τις 10 καλύτερες προτάσεις μέσα στη ροή (όχι αιωρούμενο — δεν κόβεται
 * σε στενές οθόνες).
 */
export function OptionPicker({ options, value, onChange, label, empty = "—", disabled }: { options: PickOpt[]; value: string | null; onChange: (id: string | null) => void; label: string; empty?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = value ? options.find((o) => o.id === value) : undefined;
  const list = useMemo(() => {
    const t = plain(q.trim());
    if (!t) return options.slice(0, 10);
    const hit = options.filter((o) => plain(o.name).includes(t));
    return hit.sort((a, b) => Number(!plain(a.name).startsWith(t)) - Number(!plain(b.name).startsWith(t))).slice(0, 10);
  }, [q, options]);
  const pick = (id: string | null) => { onChange(id); setOpen(false); setQ(""); };

  if (!open) return (
    <button type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label={`${label}: ${cur?.name ?? empty}`}
      className="w-full min-w-0 flex items-center justify-between gap-2 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-left text-[length:var(--fs-14)] hover:border-eu-blue disabled:opacity-50 disabled:cursor-not-allowed">
      <span className={`min-w-0 truncate ${cur ? "text-eu-ink" : "text-eu-muted"}`}>{cur?.name ?? (value ? "(δεν υπάρχει πια)" : empty)}</span>
      <ChevronDown className="size-4 text-eu-muted shrink-0" aria-hidden />
    </button>
  );
  return (
    <div className="grid gap-1.5 rounded-lg border border-eu-blue bg-white p-1.5 min-w-0">
      <div className="flex gap-1 items-center">
        <Search className="size-4 text-eu-muted shrink-0 ml-1.5" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Αναζήτηση: ${label}`} placeholder="Αναζήτηση…"
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } if (e.key === "Enter" && list[0]) { e.preventDefault(); pick(list[0].id); } }}
          className="min-w-0 flex-1 bg-transparent px-1 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
      </div>
      <ul className="m-0 p-0 list-none grid gap-0.5 max-h-72 overflow-y-auto">
        <li><button type="button" onClick={() => pick(null)} className="w-full text-left rounded-md px-2 min-h-11 md:min-h-9 text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-eu-surface">{empty}</button></li>
        {list.map((o) => (
          <li key={o.id}><button type="button" onClick={() => pick(o.id)} className={`w-full text-left rounded-md px-2 py-1 min-h-11 md:min-h-9 grid hover:bg-eu-surface ${o.id === value ? "bg-eu-chip" : ""}`}>
            <span className="text-eu-ink text-[length:var(--fs-14)] break-words">{o.name}</span>
            {o.hint && <span className="text-eu-muted text-[length:var(--fs-12)]">{o.hint}</span>}
          </button></li>
        ))}
        {!list.length && <li className="px-2 py-1 text-eu-muted text-[length:var(--fs-13)]">Τίποτα με «{q}».</li>}
      </ul>
    </div>
  );
}
