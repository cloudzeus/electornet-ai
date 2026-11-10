"use client";

import { Store } from "lucide-react";
import type { Settings } from "@/lib/cms/settings";
import type { Product } from "@/lib/data/types";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { CartProvider } from "@/components/commerce/CartProvider";
import { ProductCard } from "@/components/commerce/ProductCard";
import { ProductImage } from "@/components/commerce/ProductImage";

/** Ό,τι ξέρουμε για ένα προϊόν πριν μπει — αρκεί για να φανεί η κάρτα του όπως στο site. */
export interface PeekData { key: string; title: string; sku?: string; brand?: string; images: string[]; price?: number | null }

const asProduct = (d: PeekData): Product => ({
  id: `peek-${d.key}`, sku: d.sku ?? "", slug: "", brand: d.brand ?? "", brandSlug: "", title: d.title, category: "", subcategory: "",
  image: d.images[0] ?? null, price: d.price && d.price > 0 ? d.price : 0, noPrice: !(d.price && d.price > 0), fromDb: true, availability: { kind: "order" },
});

/**
 * «Πώς θα φαίνεται στο eshop»: η πραγματική κάρτα του site για ένα προϊόν που ετοιμάζεται (Excel, XML, Keyvoto, νέα είδη),
 * με όλες τις φωτογραφίες του από κάτω και μία γραμμή για ό,τι λείπει. Μόνο για να τη δεις (inert). Ο γονέας κρατά
 * ποια είναι ανοιχτή: η κάρτα του site θέλει μοναδικό όνομα μετάβασης, άρα **μία ανοιχτή τη φορά** ανά σελίδα.
 */
export function CardPeek({ data, settings, open, onToggle, notes = [] }: { data: PeekData; settings: Settings; open: boolean; onToggle: () => void; /** επιπλέον σημειώσεις κάτω από την κάρτα */ notes?: string[] }) {
  const all = [
    !data.images.length && "Δεν υπάρχει φωτογραφία — το προϊόν θα βγει χωρίς.",
    !(data.price && data.price > 0) && "Δεν υπάρχει τιμή — θα γράφει «Τιμή στο κατάστημα».",
    ...notes,
  ].filter(Boolean) as string[];
  return (
    <div data-help="card.peek" className="grid gap-2 justify-items-start min-w-0">
      <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex items-center gap-1.5 min-h-11 md:min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><Store className="size-4" aria-hidden />{open ? "Κλείσιμο κάρτας" : "Πώς θα φαίνεται στο eshop"}</button>
      {open && (
        <>
          <div inert className="@container w-full max-w-[15rem]"><SettingsProvider settings={settings}><CartProvider><ProductCard product={asProduct(data)} /></CartProvider></SettingsProvider></div>
          {data.images.length > 0 && (
            <div className="grid gap-1 min-w-0">
              <span className="font-bold text-eu-ink-2 text-[length:var(--fs-12)]">{data.images.length === 1 ? "1 φωτογραφία" : `${data.images.length} φωτογραφίες — η πρώτη είναι η κύρια`}</span>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-2">{data.images.slice(0, 12).map((u, i) => <li key={i}><ProductImage src={u} alt={`Φωτογραφία ${i + 1}`} sizes="64px" className="w-16" rounded="rounded-lg" cutout={false} /></li>)}{data.images.length > 12 && <li className="self-center text-eu-muted text-[length:var(--fs-12)]">+{data.images.length - 12}</li>}</ul>
            </div>
          )}
          {all.length > 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)] max-w-[44ch]">{all.join(" ")}</p>}
        </>
      )}
    </div>
  );
}
