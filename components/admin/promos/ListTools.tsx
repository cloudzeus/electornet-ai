"use client";

import { Search } from "lucide-react";

export const FEW = 6;
export const MANY = 200;

/**
 * Εργαλεία μιας μακριάς λίστας προϊόντων προσφοράς: φαίνονται λίγα (τα πρώτα 6), με αναζήτηση για να βρεις ένα συγκεκριμένο και
 * «Δείξε όλα» για να ανοίξει ολόκληρη. Έτσι 120 προϊόντα δεν σπρώχνουν τα υπόλοιπα της σελίδας δέκα οθόνες πιο κάτω.
 */
export function ListSearch({ q, onQ, total, label = "Αναζήτηση στο καλάθι" }: { q: string; onQ: (v: string) => void; total: number; label?: string }) {
  if (total <= FEW) return null;
  return (
    <label className="relative block mx-4 mb-2">
      <span className="sr-only">{label}</span>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
      <input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={`${label}: όνομα ή κωδικός`} className="w-full rounded-full border border-eu-line bg-white pl-9 pr-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
    </label>
  );
}

export function ListMore({ shown, found, total, all, onAll, q }: { shown: number; found: number; total: number; all: boolean; onAll: (v: boolean) => void; q: string }) {
  if (total <= FEW) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t border-eu-line text-eu-ink-3 text-[length:var(--fs-13)]">
      <span className="flex-1 basis-40">{q ? `${found} από ${total} ταιριάζουν` : `Φαίνονται ${shown} από ${total}`}{shown < found && all ? ` · τα πρώτα ${shown}` : ""}</span>
      {found > FEW && <button type="button" aria-expanded={all} onClick={() => onAll(!all)} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-blue hover:border-eu-navy cursor-pointer">{all ? "Δείξε λιγότερα" : `Δείξε όλα (${found})`}</button>}
    </p>
  );
}

/** Τα στοιχεία που φαίνονται: φιλτραρισμένα με την αναζήτηση, λίγα ή όλα. */
export function visible<T>(rows: T[], text: (r: T) => string, q: string, all: boolean): { found: T[]; shown: T[] } {
  const k = q.trim().toLocaleLowerCase("el-GR");
  const found = k ? rows.filter((r) => text(r).toLocaleLowerCase("el-GR").includes(k)) : rows;
  return { found, shown: found.slice(0, all ? MANY : FEW) };
}
