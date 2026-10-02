"use client";

import { Camera } from "lucide-react";
import type { SnapProduct } from "./SnapSheet";

/**
 * Στη σελίδα προϊόντος, δίπλα στο «Χωράει στον χώρο μου»: φωτογράφισε την παλιά συσκευή → αναγνώριση και σύγκριση με
 * αυτό το προϊόν (κατανάλωση, κόστος, διαστάσεις σε στερεό). Χωρίς λογαριασμό· η αποθήκευση προτείνεται μετά.
 */
export function ReplaceOld({ product }: { product: SnapProduct }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("eu:snap", { detail: { product } }))}
      className="group inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-navy hover:text-white transition-colors">
      <Camera className="size-4 transition-transform group-hover:-rotate-6" aria-hidden /> Σύγκρινε με την παλιά σου
    </button>
  );
}
