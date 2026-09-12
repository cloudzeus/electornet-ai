import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BrandStore } from "@/lib/cms/brand-store";
import type { Product } from "@/lib/data/types";
import { cutoutFor } from "@/lib/data/cutouts";
import { Spotlight } from "@/components/motion/Spotlight";
import { priceShort } from "@/lib/format";

/**
 * Brand hero: wordmark, three-line title in the brand accent glow, the
 * flagship as a floating cutout with an accent halo, optional dimmed key
 * visual behind. Adaptive: product under the text below @lg.
 */
export function BrandHero({ store, product }: { store: BrandStore; product: Product | null }) {
  const cut = product ? cutoutFor(product.image) : null;
  const dark = store.theme.mode === "dark";
  return (
    <header className="relative overflow-hidden isolate">
      {store.hero.image && (
        <div className="absolute inset-0" aria-hidden>
          <Image src={store.hero.image} alt="" fill sizes="100vw" className={`object-cover ${dark ? "opacity-20" : "opacity-[.12]"}`} priority />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--bs-bg)_0%,color-mix(in_srgb,var(--bs-bg)_75%,transparent)_55%,color-mix(in_srgb,var(--bs-bg)_30%,transparent)_100%)]" />
        </div>
      )}
      <span className="pointer-events-none absolute -top-40 right-[-8%] size-[40rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--bs-accent)_28%,transparent),transparent)]" aria-hidden />
      <Spotlight />
      <div className="relative eu-canvas eu-gutter py-10 @lg:py-16 grid grid-cols-1 @lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-8 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-5">
            <span className="font-heading font-extrabold text-[length:var(--fs-28)] tracking-[-0.04em]">{store.wordmark}</span>
            <span className="h-5 w-px bg-[var(--bs-muted)]/40" aria-hidden />
            <span className="text-[var(--bs-muted)] font-semibold text-[length:var(--fs-14)]">{store.hero.kicker}</span>
          </div>
          <h1 className="m-0 font-heading font-extrabold text-[length:var(--fs-50)] @md:text-[length:var(--fs-66)] @xl:text-[length:var(--fs-96)] leading-[0.95] tracking-[-0.045em]">
            {store.hero.title.map((line, k) => (
              <span key={k} className={`block ${k === store.hero.title.length - 1 ? "text-[var(--bs-accent)]" : ""}`}>
                {line}
              </span>
            ))}
          </h1>
          <p className="m-0 mt-5 text-[var(--bs-muted)] text-[length:var(--fs-18)] leading-relaxed max-w-[34em]">{store.hero.body}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={store.hero.cta.href} className="group inline-flex items-center gap-2 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:brightness-110 transition">
              {store.hero.cta.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            {product && (
              <Link href={`/proion/${product.slug}`} className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--bs-muted)]/40 font-bold text-[length:var(--fs-15)] px-5 min-h-12 hover:border-[var(--bs-ink)] transition">
                {product.title.split(" ").slice(0, 3).join(" ")} · {priceShort(product.price)}
              </Link>
            )}
          </div>
        </div>
        {product && (
          <Link href={`/proion/${product.slug}`} aria-label={`${product.brand} ${product.title}`} className="relative block w-[70%] mx-auto @lg:w-full max-w-[560px] aspect-square">
            <span className="absolute inset-[10%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--bs-accent)_45%,transparent),transparent)] blur-2xl" aria-hidden />
            <span className="relative block size-full eu-float">
              <Image src={cut ?? product.image ?? ""} alt="" fill sizes="(max-width: 1024px) 70vw, 560px" priority className={`object-contain ${cut ? (dark ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-3xl"}`} />
            </span>
          </Link>
        )}
      </div>
      <div className="relative border-t border-[var(--bs-muted)]/20">
        <div className="eu-canvas eu-gutter py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[length:var(--fs-14)] text-[var(--bs-muted)]">
          <span className="font-bold text-[var(--bs-ink)]">Επίσημος συνεργάτης Euronics</span>
          <span>Εργοστασιακή εγγύηση</span>
          <span>Service αντιπροσωπείας</span>
          <span>Δόσεις χωρίς κάρτα</span>
          <span>Παραλαβή σε 2 ώρες από 350 καταστήματα</span>
        </div>
      </div>
    </header>
  );
}
