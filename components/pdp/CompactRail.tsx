import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { ProductImage } from "@/components/commerce/ProductImage";
import { AddButton } from "@/components/commerce/AddButton";
import { CardCarousel } from "@/components/commerce/CardCarousel";
import { Price } from "@/components/commerce/Price";

/**
 * Light «Ταιριάζει με αυτό το προϊόν» strip: up to four compact tiles
 * (small framed photo, brand, title, price, add) instead of full cards,
 * so the product page stays short and fast.
 */
export function CompactRail({ title, products }: { title: string; products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-label={title} className="rounded-2xl bg-eu-surface p-4 @md:p-5">
      <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-3">{title}</h2>
      <CardCarousel label={title} minItem={260} minItemNarrow={300} gap={12}>
        {products.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-eu-line p-3 flex items-center gap-3 min-w-0 h-full">
            <Link href={`/proion/${p.slug}`} className="shrink-0">
              <ProductImage src={p.image} sizes="72px" className="size-[72px]" rounded="rounded-lg" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-eu-muted-2 text-[length:var(--fs-13)] uppercase truncate">{p.brand}</div>
              <Link href={`/proion/${p.slug}`} className="block font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2 hover:text-eu-blue">
                {p.title}
              </Link>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)]"><Price value={p.price} short /></span>
                <AddButton product={p} label="Προσθήκη" />
              </div>
            </div>
          </div>
        ))}
      </CardCarousel>
    </section>
  );
}
