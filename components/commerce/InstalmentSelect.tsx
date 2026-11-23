"use client";

import { instalment, priceLong } from "@/lib/format";

/**
 * Ο πελάτης διαλέγει σε πόσες άτοκες δόσεις πληρώνει με κάρτα: κάθε επιλογή γράφει και τη μηνιαία δόση.
 * none = πρώτη επιλογή «χωρίς δόσεις» (ταμείο)· χωρίς αυτήν οι επιλογές ξεκινούν από τις 2 (σελίδα προϊόντος).
 */
export function InstalmentSelect({ id, amount, max, value, onChange, none = false }: { id: string; amount: number; max: number; value: number; onChange: (n: number) => void; none?: boolean }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full min-w-0 rounded-lg border border-eu-line bg-white text-eu-ink font-semibold px-3 min-h-12 text-[length:var(--fs-15)] cursor-pointer">
      {none && <option value={1}>Χωρίς δόσεις · {priceLong(amount)} μία φορά</option>}
      {Array.from({ length: Math.max(0, max - 1) }, (_, i) => i + 2).map((n) => (
        <option key={n} value={n}>{n} άτοκες δόσεις × {priceLong(instalment(amount, n))}</option>
      ))}
    </select>
  );
}
