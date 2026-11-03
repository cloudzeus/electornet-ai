"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/commerce/CartProvider";
import { priceLong } from "@/lib/format";

/**
 * Καλάθι: μία γραμμή, ύψος όσο τα διπλανά (44px). Ο αριθμός είναι πάντα σήμα πάνω στο εικονίδιο· δίπλα γράφει
 * «Καλάθι» όσο είναι άδειο και το σύνολο (κίτρινο) μόλις έχει προϊόντα. Σε στενή κεφαλίδα μένει στρογγυλό εικονίδιο.
 */
export function CartButton() {
  const { count, subtotal, addonsTotal, setMiniOpen } = useCart();
  const total = subtotal + addonsTotal;
  return (
    <button
      id="cart-button"
      type="button"
      onClick={() => setMiniOpen(true)}
      className="relative flex items-center justify-center gap-4 h-11 min-w-11 rounded-full bg-eu-blue text-white @6xl:pl-3.5 @6xl:pr-4 hover:bg-eu-blue-light transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-yellow"
      aria-label={count ? `Καλάθι, ${count} ${count === 1 ? "προϊόν" : "προϊόντα"}, σύνολο ${priceLong(total)}` : "Καλάθι, άδειο"}
    >
      <span className="relative shrink-0">
        <ShoppingBag className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -top-2.5 -right-3 min-w-5 h-5 px-1 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] leading-5 text-center tabular-nums ring-2 ring-eu-blue" aria-hidden>
            {count}
          </span>
        )}
      </span>
      <span className={`hidden @6xl:inline whitespace-nowrap font-bold tabular-nums text-[length:var(--fs-15)] ${count ? "text-eu-yellow" : ""}`} aria-hidden>
        {count ? priceLong(total) : "Καλάθι"}
      </span>
    </button>
  );
}
