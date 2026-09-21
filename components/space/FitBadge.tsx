"use client";

import { Check, AlertTriangle, X, Ruler } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { dimsFor } from "@/lib/data/dims";
import { fitVerdict } from "@/lib/space/fit";
import { useMySpace } from "./MySpaceProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("fit");

/**
 * Fit-My-Space badge on cards and the PDP: «Χωράει» / «Οριακά» / «Δεν
 * χωράει» against the customer's saved door width and niche. Icon + text,
 * never colour alone. Shows a quiet «Δες αν χωράει» prompt when no space
 * is saved yet (opens «Ο χώρος μου»).
 */
export function FitBadge({ product, size = "sm", prompt = false }: { product: Product; size?: "sm" | "lg"; prompt?: boolean }) {
  const { space, setOpen, checking, setChecking } = useMySpace();
  const dims = dimsFor(product);
  if (!dims) return null;
  const big = size === "lg";
  const base = `inline-flex items-center gap-1.5 rounded-full font-extrabold leading-none ${big ? "text-[length:var(--fs-15)] px-3 py-2" : "text-[length:var(--fs-13)] px-2 py-1"}`;
  if (!space) {
    if (!prompt) return null;
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${base} bg-eu-chip text-eu-blue hover:bg-eu-blue hover:text-white transition-colors`}>
        <Ruler className={big ? "size-4" : "size-3.5"} aria-hidden /> {c.des_an_choraei_ston}
      </button>
    );
  }
  // Η ετυμηγορία είναι απάντηση σε συγκεκριμένο έλεγχο, όχι μόνιμη σήμανση πάνω σε κάθε κάρτα
  if (!checking) {
    if (!prompt) return null;
    return (
      <button type="button" onClick={() => setChecking(true)} className={`${base} bg-eu-chip text-eu-blue hover:bg-eu-blue hover:text-white transition-colors cursor-pointer`}>
        <Ruler className={big ? "size-4" : "size-3.5"} aria-hidden /> Δες αν χωράει στον χώρο σου
      </button>
    );
  }
  const v = fitVerdict(dims, space);
  const approx = dims.source === "category" ? " (τυπικές διαστάσεις)" : "";
  if (v.kind === "fits")
    return (
      <span className={`${base} bg-eu-green/12 text-eu-green`} title={`Περιθώριο ${v.margin.toFixed(0)} εκ.${approx}`}>
        <Check className={big ? "size-4" : "size-3.5"} aria-hidden /> Χωράει{big ? ` · ${v.margin.toFixed(0)} εκ. περιθώριο` : ""}
      </span>
    );
  if (v.kind === "tight")
    return (
      <span className={`${base} bg-eu-amber/15 text-eu-amber`} title={`Περιθώριο ${v.margin.toFixed(0)} εκ.${approx}`}>
        <AlertTriangle className={big ? "size-4" : "size-3.5"} aria-hidden /> Οριακά · {v.margin.toFixed(0)} εκ.
      </span>
    );
  return (
    <span className={`${base} bg-eu-surface-3 text-eu-ink-3`} title={`Λείπουν ${v.by.toFixed(0)} εκ. ${v.where === "door" ? "στην πόρτα" : "στην εσοχή"}${approx}`}>
      <X className={big ? "size-4" : "size-3.5"} aria-hidden /> Δεν χωράει{big ? ` · λείπουν ${v.by.toFixed(0)} εκ. ${v.where === "door" ? "στην πόρτα" : "στην εσοχή"}` : ""}
    </span>
  );
}
