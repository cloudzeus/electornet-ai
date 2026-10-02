"use client";

import { Gift, Lightbulb, Truck } from "lucide-react";
import { priceLong } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";
import type { ServerQuote } from "./useServerQuote";

/** Δώρα της παραγγελίας: γραμμή με την αξία τους και 0 € — όπως θα γραφτούν και στο παραστατικό. */
export function GiftLines({ quote, compact = false }: { quote: ServerQuote | null; compact?: boolean }) {
  if (!quote?.gifts.length) return null;
  return (
    <ul className="m-0 p-0 list-none grid gap-2" aria-label="Δώρα">
      {quote.gifts.map((g) => (
        <li key={g.promotionId} className={`flex items-center gap-3 rounded-2xl border-2 border-dashed border-eu-green/50 bg-eu-green/5 ${compact ? "p-3" : "p-4"}`}>
          <ProductImage src={g.image ?? undefined} sizes="64px" className={compact ? "size-12" : "size-16"} rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 font-extrabold text-eu-green text-[length:var(--fs-13)] uppercase tracking-wide">
              <Gift className="size-3.5" aria-hidden /> Δώρο · {g.label}
            </div>
            <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-2">
              {g.qty > 1 ? `${g.qty} × ` : ""}{g.title}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-extrabold text-eu-green text-[length:var(--fs-16)]">0,00 €</div>
            <s className="text-eu-muted-2 text-[length:var(--fs-13)]">αξία {priceLong(g.value / 100)}</s>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** «Πρόσθεσε 1 ακόμη…», «σου λείπουν Χ €…» — από τη μηχανή, όχι από τον browser. */
export function PromoHints({ quote }: { quote: ServerQuote | null }) {
  if (!quote?.hints.length) return null;
  return (
    <ul className="m-0 p-0 list-none grid gap-2" aria-live="polite">
      {quote.hints.map((h) => (
        <li key={h} className="flex items-start gap-2.5 rounded-xl bg-eu-chip text-eu-navy px-4 py-3 text-[length:var(--fs-14)] font-semibold">
          <Lightbulb className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /> {h}
        </li>
      ))}
    </ul>
  );
}

/** Δωρεάν μεταφορικά από προσφορά (πέρα από το όριο του καταστήματος). */
export function FreeShippingNote({ quote }: { quote: ServerQuote | null }) {
  if (!quote?.freeShipping) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-eu-green/10 text-eu-green px-4 py-3 text-[length:var(--fs-14)] font-bold">
      <Truck className="size-4 shrink-0" aria-hidden /> {quote.freeShipping.label} · κερδίζεις {priceLong(quote.freeShipping.saved / 100)}
    </div>
  );
}
