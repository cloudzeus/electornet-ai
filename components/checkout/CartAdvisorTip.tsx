"use client";

import Image from "next/image";
import type { CartLine } from "@/components/commerce/CartProvider";
import { priceLong } from "@/lib/format";
import { AskAris } from "@/components/advisor/AskAris";

const HEAVY = new Set(["plyntiria", "psygeia", "stegnotiria", "koyzines", "air-condition", "plyntiria-piaton"]);

/**
 * @dynamic Άρης in the cart: one useful sentence computed from the lines —
 * installation missing on a heavy appliance, free-shipping distance,
 * warranty extension — plus a question chip. Production: same rules from
 * the CMS upsell table (category → service), with the AI engine wording.
 */
export function CartAdvisorTip({ lines, subtotal, freeShippingFrom }: { lines: CartLine[]; subtotal: number; freeShippingFrom: number }) {
  if (!lines.length) return null;
  const heavy = lines.find((l) => HEAVY.has(l.product.subcategory));
  const noInstall = heavy && !l_has(heavy, "paradosi-egkatastasi");
  const noWarranty = lines.find((l) => l.product.price >= 300 && !l_has(l, "epektasi-eggyisis"));
  const gap = freeShippingFrom - subtotal;
  let text: string;
  let q: string;
  if (noInstall && heavy) {
    text = `Το ${heavy.product.brand} ${heavy.product.title.split(" ").slice(0, 3).join(" ")} θέλει σύνδεση και αλφάδιασμα. Ο τεχνικός του καταστήματος το τοποθετεί την ημέρα παράδοσης και παίρνει και την παλιά συσκευή.`;
    q = "Τι περιλαμβάνει η εγκατάσταση;";
  } else if (gap > 0 && gap <= 60) {
    text = `Σου λείπουν ${priceLong(gap)} για δωρεάν μεταφορικά. Ένα μικρό αξεσουάρ το καλύπτει.`;
    q = "Τι μπορώ να προσθέσω για δωρεάν μεταφορικά;";
  } else if (noWarranty) {
    text = `Για το ${noWarranty.product.brand} ${noWarranty.product.title.split(" ").slice(0, 3).join(" ")} η επέκταση εγγύησης σε 5 έτη κοστίζει από 19 € και καλύπτει και βλάβη από υγρά.`;
    q = "Αξίζει η επέκταση εγγύησης;";
  } else {
    text = "Όλα καλά με το καλάθι σου. Αν θες, ελέγχω αν χωρούν στον χώρο σου πριν την παραγγελία.";
    q = "Χωράνε στον χώρο μου;";
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-eu-chip px-4 py-3">
      <span className="relative size-10 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-white">
        <Image src="/img/advisor/mascot-head.png" alt="" fill sizes="40px" className="object-cover scale-[1.15] translate-y-[6%]" />
      </span>
      <div className="min-w-0 grid gap-1.5">
        <p className="m-0 text-eu-ink text-[length:var(--fs-15)] leading-snug">
          <span className="font-extrabold text-eu-navy">Ο Άρης:</span> {text}
        </p>
        <div>
          <AskAris q={q} tone="light" />
        </div>
      </div>
    </div>
  );
}

function l_has(l: CartLine, slug: string) {
  return (l.addons ?? []).some((a) => a.slug === slug);
}
