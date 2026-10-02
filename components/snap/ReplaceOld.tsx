"use client";

import { Camera, ArrowRight } from "lucide-react";
import type { SnapProduct } from "./SnapSheet";

/**
 * Στη σελίδα προϊόντος: «Αντικαθιστάς παλιά συσκευή;» → ανοίγει τη φωτογράφιση με αυτό το προϊόν ως σημείο σύγκρισης.
 * Δεν χρειάζεται λογαριασμό· η αποθήκευση στις «Συσκευές μου» προτείνεται μετά τη σύγκριση.
 */
export function ReplaceOld({ product }: { product: SnapProduct }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("eu:snap", { detail: { product } }))}
      className="w-full text-left rounded-xl border-2 border-eu-line bg-white p-4 flex items-center gap-3 hover:border-eu-blue group">
      <span className="size-12 rounded-full bg-eu-yellow text-eu-navy inline-flex items-center justify-center shrink-0"><Camera className="size-6" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-snug">Αντικαθιστάς παλιά συσκευή;</span>
        <span className="block text-eu-ink-3 text-[length:var(--fs-15)] leading-snug">Φωτογράφισέ τη και δες δίπλα-δίπλα τι κερδίζεις με αυτό: ρεύμα, κόστος, διαστάσεις.</span>
      </span>
      <ArrowRight className="size-5 text-eu-blue shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}
