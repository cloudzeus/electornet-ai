"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useCart } from "./CartProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("compareTray");

/** Sticky tray when products are selected for comparison (max 4). */
export function CompareTray() {
  const { compare, toggleCompare, hydrated } = useCart();
  const pathname = usePathname();
  // Never over the cart / checkout CTAs, never on the compare page itself.
  if (!hydrated || compare.length === 0 || /^\/(kalathi|checkout|sygkrisi)/.test(pathname)) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-eu-navy text-white rounded-full shadow-[var(--shadow-overlay)] px-4 py-2 flex items-center gap-3 text-[length:var(--fs-15)]">
      <span className="font-bold">Σύγκριση · {compare.length}/4</span>
      <Link href="/sygkrisi" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold px-3.5 py-2 min-h-9 inline-flex items-center hover:bg-eu-yellow-dark">
        {c.sygkrine}
      </Link>
      <button type="button" aria-label={c.katharismos_sygkrisis} onClick={() => compare.forEach((id) => toggleCompare(id))} className="size-9 inline-flex items-center justify-center rounded-full hover:bg-eu-navy-2">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
