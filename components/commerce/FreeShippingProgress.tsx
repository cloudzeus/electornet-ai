"use client";

import { priceLong } from "@/lib/format";
import { sx } from "@/components/ui/sx";

/** Δωρεάν μεταφορά από €100 (πρότυπο κανόνα — οι πραγματικοί όροι στους Τρόπους αποστολής). */
export function FreeShippingProgress({ subtotal, threshold = 100 }: { subtotal: number; threshold?: number }) {
  const left = Math.max(0, threshold - subtotal);
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  const bar = sx({ width: `${pct}%` });
  return (
    <div>
      <div className="flex justify-between text-[length:var(--fs-13-5)] mb-1.5">
        <span className={left === 0 ? "font-bold text-eu-green" : "text-eu-ink-2"}>{left === 0 ? "Δωρεάν μεταφορά ✓" : `Ακόμη ${priceLong(left)} για δωρεάν μεταφορά`}</span>
        <span className="text-eu-muted-2">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-eu-line overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        {bar.node}
        <div className={`h-full rounded-full ${left === 0 ? "bg-eu-green" : "bg-eu-blue"} ${bar.className}`} />
      </div>
    </div>
  );
}
