"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Product } from "@/lib/data/types";
import type { Settings } from "@/lib/cms/settings";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { CartProvider } from "@/components/commerce/CartProvider";
import { ProductCard } from "@/components/commerce/ProductCard";

/**
 * Η κάρτα του προϊόντος όπως στο site (φωτογραφία, stickers, τιμή). inert: μόνο για να τη δεις. Δίπλα στη δουλειά όπου
 * χωράει· σε στενότερη οθόνη μαζεμένη πίσω από ένα κουμπί. Μία μόνο κάρτα στη σελίδα (το ViewTransition θέλει μοναδικό όνομα).
 */
export function SiteCardPreview({ product, settings }: { product: Product; settings: Settings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2 rounded-xl border border-eu-line bg-white p-2.5 @5xl:border-0 @5xl:bg-transparent @5xl:p-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="@5xl:hidden flex items-center justify-between gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Όπως στο site <ChevronDown className={`size-4 text-eu-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></button>
      <span className="hidden @5xl:block font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Όπως στο site</span>
      <div className={open ? "grid gap-2" : "hidden @5xl:grid gap-2"}>
        <div inert className="@container max-w-[15rem]">
          <SettingsProvider settings={settings}><CartProvider><ProductCard product={product} /></CartProvider></SettingsProvider>
        </div>
        <span className="text-eu-muted text-[length:var(--fs-12)]">Ανανεώνεται μόλις ξαναφορτώσει η σελίδα (π.χ. αλλαγή καρτέλας).</span>
      </div>
    </div>
  );
}
