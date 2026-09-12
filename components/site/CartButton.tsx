"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/commerce/CartProvider";
import { priceLong } from "@/lib/format";

/** Cart with count *and* total (the current site shows a link without a total). */
export function CartButton() {
  const { count, subtotal, addonsTotal, setMiniOpen } = useCart();
  const total = subtotal + addonsTotal;
  return (
    <button
      id="cart-button"
      type="button"
      onClick={() => setMiniOpen(true)}
      className="relative flex items-center gap-2 bg-eu-blue text-white rounded-full size-11 justify-center @md:size-auto @md:pl-3 @md:pr-4 @md:py-2 min-h-11 hover:bg-eu-blue-light transition-colors"
      aria-label={`Καλάθι, ${count} προϊόντα, σύνολο ${priceLong(total)}`}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && <span className="@md:hidden absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] leading-5 text-center" aria-hidden>{count}</span>}
      <span className="hidden @md:flex flex-col leading-tight">
        <span className="font-extrabold text-[length:var(--fs-14)]">Καλάθι · {count}</span>
        <span className="font-extrabold text-eu-yellow text-[length:var(--fs-15)]">{priceLong(total)}</span>
      </span>
    </button>
  );
}
