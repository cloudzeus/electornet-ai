"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { soldAloneAction } from "@/app/admin/(shell)/catalog/actions";

type Mode = "auto" | "yes" | "no";

/**
 * «Πωλείται και μόνο του» ενός είδους: Αυτόματα · Ναι · Όχι, με εξήγηση κάτω από κάθε επιλογή και τι ισχύει τώρα στο site.
 * Η αλλαγή αποθηκεύεται αμέσως (αναστρέψιμη).
 */
export function SoldAloneSwitch({ productId, mode, soldAlone, mainOfParts, canWrite }: { productId: string; mode: string; soldAlone: boolean; mainOfParts: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const opts: { v: Mode; label: string; hint: string }[] = [
    { v: "auto", label: "Αυτόματα", hint: mainOfParts ? "Τώρα: όχι — είναι κύριο είδος σε σετ εξαρτημάτων, πωλείται μόνο μέσα στο σετ." : "Τώρα: ναι — δεν είναι κύριο σε σετ εξαρτημάτων." },
    { v: "yes", label: "Ναι, πωλείται και μόνο του", hint: "Εμφανίζεται στις λίστες και στην αναζήτηση· στη σελίδα του φαίνεται «Διαθέσιμο και σε σετ»." },
    { v: "no", label: "Όχι, μόνο μέσα σε σετ", hint: "Φεύγει από λίστες, αναζήτηση και προσφορές· η σελίδα του οδηγεί στο σετ (ή «δεν βρέθηκε» αν δεν υπάρχει ενεργό σετ)." },
  ];
  const pick = (v: Mode) => start(async () => {
    setMsg(null);
    const r = await soldAloneAction([productId], v);
    setMsg(r.ok ? "Αποθηκεύτηκε." : r.error);
    if (r.ok) router.refresh();
  });
  return (
    <fieldset data-help="product.sold-alone" disabled={!canWrite || pending} className="m-0 p-0 border-0 grid gap-1.5 min-w-0">
      <legend className="sr-only">Πωλείται και μόνο του</legend>
      <p className="m-0 text-[length:var(--fs-14)]">Στο site τώρα: <b className={soldAlone ? "text-eu-green" : "text-eu-ink"}>{soldAlone ? "πωλείται και μόνο του" : "μόνο μέσα σε σετ"}</b></p>
      {opts.map((o) => (
        <label key={o.v} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 items-start rounded-xl border p-2.5 cursor-pointer min-h-11 ${mode === o.v ? "border-eu-navy bg-eu-chip/50" : "border-eu-line hover:border-eu-navy"}`}>
          <input type="radio" name={`sold-alone-${productId}`} value={o.v} checked={mode === o.v} onChange={() => pick(o.v)} className="mt-1 size-4 accent-eu-navy" />
          <span className="grid min-w-0"><b className="text-eu-ink text-[length:var(--fs-14)]">{o.label}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{o.hint}</span></span>
        </label>
      ))}
      <p role="status" aria-live="polite" className="m-0 empty:hidden text-eu-ink-3 text-[length:var(--fs-13)] inline-flex items-center gap-1.5">{pending ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Αποθήκευση…</> : msg}</p>
    </fieldset>
  );
}
