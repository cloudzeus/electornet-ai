"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/data/types";
import { useCart } from "@/components/commerce/CartProvider";
import { ProductGrid } from "./ProductGrid";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("wishlistGrid");

export function WishlistGrid({ initial }: { initial: Product[] }) {
  const { wishlist, hydrated } = useCart();
  const router = useRouter();
  useEffect(() => {
    if (!hydrated) return;
    const want = wishlist.join(",");
    const have = initial.map((p) => p.id).join(",");
    if (want !== have) router.replace(want ? `/lista?ids=${want}` : "/lista");
  }, [wishlist, hydrated, initial, router]);
  if (initial.length === 0)
    return (
      <div className="rounded-lg bg-eu-surface p-8 text-center">
        <div className="font-bold text-eu-ink text-[length:var(--fs-17)] mb-1">{c.i_lista_soy_einai}</div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">{c.patise_tin_kardia_se}</p>
        <Link href="/prosfores" className="inline-flex mt-4 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 items-center">
          {c.des_tis_prosfores}
        </Link>
      </div>
    );
  return <ProductGrid products={initial} />;
}
