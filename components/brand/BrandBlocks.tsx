import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Cpu, Eye, Zap, Wifi, ShieldCheck, Sparkles, Leaf, Camera } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import type { Product } from "@/lib/data/types";
import { cutoutFor } from "@/lib/data/cutouts";
import { priceShort, priceLong, instalment } from "@/lib/format";
import { ProductCard } from "@/components/commerce/ProductCard";
import { CardCarousel } from "@/components/commerce/CardCarousel";
import { Countdown } from "@/components/commerce/Countdown";
import { Reveal } from "@/components/motion/Reveal";
import { Tilt } from "@/components/motion/Tilt";
import { AskAris } from "@/components/advisor/AskAris";
import { BlockHead } from "./BrandFrame";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("brandBlocks");

type P = Record<string, Product>;
const byId = (ids: string[], map: P) => ids.map((id) => map[id]).filter(Boolean);
const ICON = { cpu: Cpu, eye: Eye, zap: Zap, wifi: Wifi, shield: ShieldCheck, sparkles: Sparkles, leaf: Leaf, camera: Camera };

/** «Μόλις έφτασαν»: big cutouts on accent-tinted stages, one per product, staggered. */
export function NewArrivals({ b, products }: { b: Extract<BrandBlock, { type: "new-arrivals" }>; products: P }) {
  const items = byId(b.productIds, products);
  if (!items.length) return null;
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Νέα προϊόντα"}>
      <BlockHead kicker={b.kicker} title={b.title} right={b.lead ? <p className="m-0 hidden @lg:block max-w-[28em] text-[var(--bs-muted)] text-[length:var(--fs-15)]">{b.lead}</p> : undefined} />
      <Reveal className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-4" stagger={0.1}>
        {items.map((p, i) => {
          const cut = cutoutFor(p.image);
          return (
            <div key={p.id} data-reveal className="min-w-0">
              <Tilt max={5} className="h-full">
                <Link href={`/proion/${p.slug}`} className="group relative block h-full rounded-3xl overflow-hidden bg-[var(--bs-bg2)] p-5 isolate">
                  <span className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--bs-accent)_35%,transparent),transparent)]" aria-hidden />
                  <span className="absolute top-4 left-4 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-13)] px-2.5 py-1 eu-shimmer">Νέο {i === 0 ? "· 2026" : ""}</span>
                  <span className="relative block aspect-[4/3] mt-6" data-tilt-layer>
                    <Image src={cut ?? p.image ?? ""} alt="" fill sizes="(max-width: 768px) 90vw, 400px" className={`object-contain transition-transform duration-500 group-hover:scale-105 ${cut ? "eu-cutout-shadow" : ""}`} />
                  </span>
                  <span className="relative block mt-4">
                    <span className="block text-[var(--bs-muted)] font-bold text-[length:var(--fs-13)] uppercase">{p.brand}</span>
                    <span className="block font-heading font-bold text-[length:var(--fs-19)] leading-tight line-clamp-2">{p.title}</span>
                    <span className="mt-2 flex items-baseline gap-2">
                      <span className="font-heading font-extrabold text-[length:var(--fs-26)] tracking-[-0.02em]">{priceShort(p.price)}</span>
                      <span className="text-[var(--bs-muted)] text-[length:var(--fs-14)]">ή 24 × {priceLong(instalment(p.price, 24))}</span>
                    </span>
                  </span>
                  <ArrowRight className="absolute bottom-5 right-5 size-5 text-[var(--bs-accent)] transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </Tilt>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}

/** Series: editorial cards with a photo, blurb and the products of the series as chips. */
export function Series({ b, products }: { b: Extract<BrandBlock, { type: "series" }>; products: P }) {
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Σειρές"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <Reveal className="grid grid-cols-1 @lg:grid-cols-3 gap-4" stagger={0.1}>
        {b.items.map((it) => {
          const ps = byId(it.productIds, products);
          return (
            <article key={it.name} data-reveal className="group relative rounded-3xl overflow-hidden bg-[var(--bs-bg2)] grid grid-rows-[auto_minmax(0,1fr)]">
              <Link href={it.href ?? "#"} className="relative block aspect-[16/10] overflow-hidden">
                <Image src={it.image} alt={it.name} fill sizes="(max-width: 1024px) 100vw, 440px" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,var(--bs-bg2)_100%)]" aria-hidden />
              </Link>
              <div className="p-5 grid gap-3 content-start">
                <div>
                  <h3 className="m-0 font-heading font-extrabold text-[length:var(--fs-24)] tracking-[-0.02em]">{it.name}</h3>
                  <p className="m-0 mt-1 text-[var(--bs-muted)] text-[length:var(--fs-15)] leading-snug">{it.blurb}</p>
                </div>
                {ps.length > 0 && (
                  <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                    {ps.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <Link href={`/proion/${p.slug}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--bs-muted)]/30 px-3 min-h-9 text-[length:var(--fs-14)] font-bold hover:border-[var(--bs-accent)] hover:text-[var(--bs-accent)]">
                          {p.title.split(" ").slice(0, 3).join(" ")} <span className="text-[var(--bs-muted)] font-semibold">{priceShort(p.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {it.href && (
                  <Link href={it.href} className="inline-flex items-center gap-1 font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline">
                    {c.oli_i_seira} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </Reveal>
    </section>
  );
}

/** Offers: the Euronics product card (stickers, fit, quick buy) in a rail with a real countdown. */
export function Offers({ b, products }: { b: Extract<BrandBlock, { type: "offers" }>; products: P }) {
  const items = byId(b.productIds, products);
  if (!items.length) return null;
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Προσφορές"}>
      <BlockHead kicker={b.kicker} title={b.title} right={<Countdown endsAt={b.endsAt} variant="blocks" tone="dark" className="shrink-0" />} />
      <CardCarousel label={b.title ?? "Προσφορές"}>
        {items.map((p) => (
          <div key={p.id} className="h-full">
            <ProductCard product={p} dealEndsAt={b.endsAt} tone="dark" />
          </div>
        ))}
      </CardCarousel>
    </section>
  );
}

/** Story: editorial split, image on the side chosen by the CMS. */
export function Story({ b }: { b: Extract<BrandBlock, { type: "story" }> }) {
  const right = b.align !== "left";
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title}>
      <Reveal className={`grid grid-cols-1 @lg:grid-cols-2 gap-8 items-center ${right ? "" : "@lg:[&>*:first-child]:order-2"}`}>
        <div data-reveal>
          {b.kicker && <div className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase mb-2">{b.kicker}</div>}
          {b.title && <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-32)] @lg:text-[length:var(--fs-42)] leading-[1.05] tracking-[-0.03em]">{b.title}</h2>}
          <p className="m-0 mt-4 text-[var(--bs-muted)] text-[length:var(--fs-17)] leading-relaxed max-w-[38em]">{b.body}</p>
          {b.cta && (
            <Link href={b.cta.href} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:brightness-110">
              {b.cta.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        <div data-reveal className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-[var(--bs-bg2)]">
          <Image src={b.image} alt="" fill sizes="(max-width: 1024px) 100vw, 640px" className="object-cover" />
        </div>
      </Reveal>
    </section>
  );
}

/** Tech: feature tiles with an icon, on the second surface. */
export function Tech({ b }: { b: Extract<BrandBlock, { type: "tech" }> }) {
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Τεχνολογία"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <Reveal className="grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-4 gap-3" stagger={0.06}>
        {b.items.map((it) => {
          const I = ICON[it.icon] ?? Sparkles;
          return (
            <div key={it.title} data-reveal className="rounded-2xl bg-[var(--bs-bg2)] p-5 grid gap-3 content-start hover:-translate-y-0.5 transition-transform">
              <span className="size-11 rounded-xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] inline-flex items-center justify-center">
                <I className="size-5" aria-hidden />
              </span>
              <div>
                <div className="font-heading font-bold text-[length:var(--fs-18)] leading-tight">{it.title}</div>
                <p className="m-0 mt-1 text-[var(--bs-muted)] text-[length:var(--fs-15)] leading-snug">{it.blurb}</p>
              </div>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}

/** Support: warranty/service facts and «Ρώτα τον Άρη» chips for this brand. */
export function Support({ b, brand }: { b: Extract<BrandBlock, { type: "support" }>; brand: string }) {
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={c.ypostirixi}>
      <div className="rounded-3xl bg-[var(--bs-bg2)] p-6 @lg:p-8 grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-center">
        <div>
          <div className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase mb-2">Εγγύηση & service {brand}</div>
          <ul className="m-0 p-0 list-none grid gap-2">
            {b.facts.map((f) => (
              <li key={f} className="flex gap-2 text-[length:var(--fs-16)]">
                <ShieldCheck className="size-5 text-[var(--bs-accent)] shrink-0" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        </div>
        {b.askAris && b.askAris.length > 0 && (
          <div>
            <div className="text-[var(--bs-muted)] font-semibold text-[length:var(--fs-14)] mb-2">Ρώτα τον Άρη για {brand}:</div>
            <div className="flex flex-wrap gap-1.5">
              {b.askAris.map((q) => (
                <AskAris key={q} q={q} tone="light" />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Video block: muted loop with a caption. */
export function VideoBlock({ b }: { b: Extract<BrandBlock, { type: "video" }> }) {
  return (
    <section className="eu-canvas eu-gutter py-10" aria-label={b.caption ?? "Βίντεο"}>
      <div className="relative rounded-3xl overflow-hidden aspect-video bg-[var(--bs-bg2)]">
        <video src={b.src} poster={b.poster} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
        {b.caption && <div className="absolute bottom-4 left-4 rounded-full bg-black/60 text-white px-3 py-1.5 text-[length:var(--fs-14)] font-bold">{b.caption}</div>}
      </div>
    </section>
  );
}
