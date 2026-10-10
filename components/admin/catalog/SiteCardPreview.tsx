"use client";

import type { Product } from "@/lib/data/types";
import type { Settings } from "@/lib/cms/settings";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { CartProvider } from "@/components/commerce/CartProvider";
import { ProductCard } from "@/components/commerce/ProductCard";

/** Η κάρτα του προϊόντος όπως στο site (φωτογραφία, stickers, τιμή). inert: μόνο για να τη δεις — κανένα κλικ δεν βάζει στο καλάθι. */
export function SiteCardPreview({ product, settings }: { product: Product; settings: Settings }) {
  return (
    <div className="grid gap-2">
      <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Όπως στο site</span>
      <div inert className="@container max-w-[17rem]">
        <SettingsProvider settings={settings}><CartProvider><ProductCard product={product} /></CartProvider></SettingsProvider>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-13)]">Ανανεώνεται μόλις ξαναφορτώσει η σελίδα (π.χ. αλλαγή καρτέλας).</span>
    </div>
  );
}
