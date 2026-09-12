"use client";

import { Heart } from "lucide-react";
import { useCart } from "./CartProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("wishlist");

export function WishlistButton({ id, className = "" }: { id: string; className?: string }) {
  const { wishlist, toggleWishlist } = useCart();
  const on = wishlist.includes(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Αφαίρεση από τη λίστα" : "Προσθήκη στη λίστα"}
      onClick={() => toggleWishlist(id)}
      className={`size-11 inline-flex items-center justify-center rounded-full border-2 ${on ? "border-eu-red text-eu-red bg-white" : "border-eu-line text-eu-muted hover:border-eu-red hover:text-eu-red"} ${className}`}
    >
      <Heart className="size-4" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

export function CompareCheckbox({ id }: { id: string }) {
  const { compare, toggleCompare } = useCart();
  const on = compare.includes(id);
  return (
    <label className="inline-flex items-center gap-1.5 font-semibold text-eu-muted-2 text-[length:var(--fs-13)] cursor-pointer hover:text-eu-blue min-h-8">
      <input type="checkbox" checked={on} onChange={() => toggleCompare(id)} className="size-3.5 accent-eu-blue" />
      {c.sygkrisi}
    </label>
  );
}
