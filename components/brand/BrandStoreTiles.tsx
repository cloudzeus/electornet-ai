import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { BrandStore } from "@/lib/cms/brand-store";
import { getProductsByIds } from "@/lib/data/repo";
import { cutoutFor } from "@/lib/data/cutouts";
import { Reveal } from "@/components/motion/Reveal";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("brandTiles");

/** @dynamic Featured brand stores on /brands: one themed tile per CMS record, flagship cutout, tagline. */
export async function BrandStoreTiles({ stores }: { stores: BrandStore[] }) {
  if (!stores.length) return null;
  const products = await getProductsByIds(stores.map((s) => s.hero.productId));
  return (
    <section className="mb-8" aria-label="Brand stores">
      <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase mb-2">Brand stores</div>
      <h2 className="m-0 mb-4 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{c.oi_selides_ton_kataskeyaston}</h2>
      <Reveal className="grid grid-cols-1 @md:grid-cols-3 gap-4" stagger={0.1}>
        {stores.map((s) => {
          const p = products.find((x) => x.id === s.hero.productId);
          const cut = p ? cutoutFor(p.image) : null;
          return (
            <Link key={s.slug} href={`/brands/${s.slug}`} data-reveal className="group relative block rounded-3xl overflow-hidden p-5 min-h-[220px] isolate" style={{ background: s.theme.bg, color: s.theme.ink }}>
              <span className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full blur-2xl opacity-60" style={{ background: s.theme.accent }} aria-hidden />
              <div className="relative">
                <div className="font-heading font-extrabold text-[length:var(--fs-26)] tracking-[-0.04em]">{s.wordmark}</div>
                <div className="text-[length:var(--fs-14)] font-semibold" style={{ color: s.theme.muted }}>{s.tagline}</div>
              </div>
              {(cut || p?.image) && (
                <span className="absolute right-4 bottom-4 w-[45%] aspect-square transition-transform duration-500 group-hover:scale-105 eu-float">
                  <Image src={cut ?? p!.image!} alt="" fill sizes="200px" className="object-contain" />
                </span>
              )}
              <span className="absolute left-5 bottom-5 inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-10" style={{ background: s.theme.accent, color: s.theme.accentInk }}>
                {c.des_ti_selida} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          );
        })}
      </Reveal>
    </section>
  );
}
