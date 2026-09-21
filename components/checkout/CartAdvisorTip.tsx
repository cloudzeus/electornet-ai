"use client";

import { tpl } from "@/lib/cms/settings";
import { useSettings } from "@/components/site/SettingsProvider";
import Image from "next/image";
import type { CartLine } from "@/components/commerce/CartProvider";
import { priceLong } from "@/lib/format";
import { AskAris } from "@/components/advisor/AskAris";
import { fitMattersFor } from "@/lib/data/dims";

const HEAVY = new Set(["plyntiria", "psygeia", "stegnotiria", "koyzines", "air-condition", "plyntiria-piaton"]);

/**
 * @dynamic Ερμής in the cart: one useful sentence computed from the lines —
 * installation missing on a heavy appliance, free-shipping distance,
 * warranty extension — plus a question chip. Production: same rules from
 * the CMS upsell table (category → service), with the AI engine wording.
 */
export function CartAdvisorTip({ lines, subtotal, freeShippingFrom }: { lines: CartLine[]; subtotal: number; freeShippingFrom: number }) {
  const { advisor } = useSettings();
  if (!lines.length) return null;
  const heavy = lines.find((l) => HEAVY.has(l.product.subcategory));
  const noInstall = heavy && !l_has(heavy, "paradosi-egkatastasi");
  const noWarranty = lines.find((l) => l.product.price >= 300 && !l_has(l, "epektasi-eggyisis"));
  const gap = freeShippingFrom - subtotal;
  let text: string;
  let q: string;
  if (noInstall && heavy) {
    text = tpl(advisor.cartTips.install, { product: `${heavy.product.brand} ${heavy.product.title.split(" ").slice(0, 3).join(" ")}` });
    q = "Τι περιλαμβάνει η εγκατάσταση;";
  } else if (gap > 0 && gap <= 60) {
    text = tpl(advisor.cartTips.freeShipping, { gap: priceLong(gap) });
    q = "Τι μπορώ να προσθέσω για δωρεάν μεταφορικά;";
  } else if (noWarranty) {
    text = tpl(advisor.cartTips.warranty, { product: `${noWarranty.product.brand} ${noWarranty.product.title.split(" ").slice(0, 3).join(" ")}` });
    q = "Αξίζει η επέκταση εγγύησης;";
  } else if (lines.some((l) => fitMattersFor(l.product))) {
    // ο έλεγχος χώρου προτείνεται μόνο όταν το καλάθι έχει κάτι που πρέπει να χωρέσει κάπου (συσκευή, τηλεόραση)
    text = advisor.cartTips.ok;
    q = "Χωράνε στον χώρο μου;";
  } else {
    text = advisor.cartTips.okPlain ?? "Όλα καλά με το καλάθι σου.";
    q = "Πότε θα το παραλάβω;";
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-eu-chip px-4 py-3">
      <span className="relative size-10 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-white">
        <Image src={advisor.avatarHead} alt="" fill sizes="40px" className="object-cover scale-[1.15] translate-y-[6%]" />
      </span>
      <div className="min-w-0 grid gap-1.5">
        <p className="m-0 text-eu-ink text-[length:var(--fs-15)] leading-snug">
          <span className="font-extrabold text-eu-navy">Ο {advisor.name}:</span> {text}
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
