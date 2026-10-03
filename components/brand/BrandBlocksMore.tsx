import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Cpu, Eye, Zap, Wifi, ShieldCheck, Sparkles, Leaf, Camera } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import type { Product } from "@/lib/data/types";
import type { CategoryTile } from "@/lib/cms/brand-auto";
import { ProductCard } from "@/components/commerce/ProductCard";
import { Countdown } from "@/components/commerce/Countdown";
import { Reveal } from "@/components/motion/Reveal";
import { BlockHead } from "./BrandFrame";

/**
 * Τα «δυναμικά» components της σελίδας μάρκας. Όλα διαβάζουν μόνο τα --bs-* χρώματα (BrandFrame), άρα δουλεύουν
 * με κάθε παλέτα, και είναι adaptive με container queries: μία στήλη σε κινητό, περισσότερες όσο ανοίγει ο χώρος,
 * χωρίς οριζόντια κύλιση.
 */
type B<T extends BrandBlock["type"]> = Extract<BrandBlock, { type: T }>;
const ICON = { cpu: Cpu, eye: Eye, zap: Zap, wifi: Wifi, shield: ShieldCheck, sparkles: Sparkles, leaf: Leaf, camera: Camera };
const btn = "inline-flex items-center justify-center gap-2 rounded-full font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 transition";
const primary = `${btn} bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] hover:brightness-110`;
const secondary = `${btn} border-2 border-current/30 hover:border-current`;

/** Λωρίδα ανακοίνωσης (συνήθως στη ζώνη «πάνω από το hero»), προαιρετικά με αντίστροφη μέτρηση. */
export function Announcement({ b }: { b: B<"announcement"> }) {
  const inner = (
    <span className="eu-canvas eu-gutter py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
      <span className="font-extrabold text-[length:var(--fs-15)]">{b.text}</span>
      {b.endsAt && new Date(b.endsAt) > new Date() && <Countdown endsAt={b.endsAt} className="font-bold text-[length:var(--fs-14)] tabular-nums" />}
      {b.href && <ArrowRight className="size-4 shrink-0" aria-hidden />}
    </span>
  );
  return b.href ? <Link href={b.href} className="block bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] hover:brightness-110">{inner}</Link> : <div className="bg-[var(--bs-accent)] text-[var(--bs-accent-ink)]">{inner}</div>;
}

/** Λωρίδα πλεονεκτημάτων με εικονίδια: 1 στήλη → 2 → όσα χωράνε. */
export function Usp({ b }: { b: B<"usp"> }) {
  const items = b.items.filter((i) => i.text.trim());
  if (!items.length) return null;
  return (
    <section aria-label={b.title ?? "Πλεονεκτήματα"} className="border-y border-[var(--bs-muted)]/20 bg-[var(--bs-bg2)]">
      <ul className={`eu-canvas eu-gutter py-4 m-0 list-none grid grid-cols-1 @sm:grid-cols-2 gap-x-6 gap-y-3 ${items.length >= 4 ? "@4xl:grid-cols-4" : items.length === 3 ? "@3xl:grid-cols-3" : ""}`}>
        {items.map((it, k) => { const I = ICON[it.icon] ?? Sparkles; return <li key={k} className="flex items-center gap-3 min-w-0"><span className="shrink-0 size-10 rounded-xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] grid place-items-center"><I className="size-5" aria-hidden /></span><span className="font-bold text-[length:var(--fs-15)] leading-snug">{it.text}</span></li>; })}
      </ul>
    </section>
  );
}

/** Μεγάλο banner εικόνας με κείμενο πάνω της· ξεχωριστή εικόνα για κινητό αν δοθεί. */
export function Banner({ b }: { b: B<"banner"> }) {
  if (!b.image) return null;
  const h = b.height === "s" ? "min-h-[14rem] @lg:min-h-[18rem]" : b.height === "l" ? "min-h-[26rem] @lg:min-h-[34rem]" : "min-h-[20rem] @lg:min-h-[26rem]";
  const align = b.align === "center" ? "items-center text-center mx-auto" : b.align === "right" ? "items-end text-right ml-auto" : "items-start";
  const ov = b.overlay ?? "dark";
  const tint = ov === "dark" ? "bg-[linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.25))] text-white" : ov === "light" ? "bg-[linear-gradient(90deg,rgba(255,255,255,.85),rgba(255,255,255,.35))] text-[#111]" : "";
  return (
    <section className="eu-canvas eu-gutter py-6 @lg:py-10" aria-label={b.title ?? "Banner"}>
      <div className={`relative isolate rounded-3xl overflow-hidden ${h} flex`}>
        <picture className="absolute inset-0 -z-10">
          {b.imageMobile && <source media="(max-width: 640px)" srcSet={b.imageMobile} />}
          { }
          <img src={b.image} alt="" className="size-full object-cover" loading="lazy" />
        </picture>
        <div className={`flex-1 flex p-6 @lg:p-10 ${tint}`}>
          <div className={`flex flex-col justify-center gap-3 max-w-[36rem] ${align}`}>
            {b.kicker && <span className="font-extrabold text-[length:var(--fs-13)] tracking-wide uppercase opacity-90">{b.kicker}</span>}
            {b.title && <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-32)] @lg:text-[length:var(--fs-50)] leading-[1.02] tracking-[-0.03em]">{b.title}</h2>}
            {b.body && <p className="m-0 text-[length:var(--fs-17)] leading-relaxed opacity-90">{b.body}</p>}
            {b.cta && <Link href={b.cta.href} className={`${primary} mt-1`}>{b.cta.label} <ArrowRight className="size-4" aria-hidden /></Link>}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Προϊόντα που ενημερώνονται μόνα τους (νεότερα, σε προσφορά, κορυφαία, οικονομικά, διαθέσιμα). */
export function ProductsAuto({ b, products }: { b: B<"products-auto">; products: Product[] }) {
  if (!products.length) return null;
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Προϊόντα"}>
      <BlockHead kicker={b.kicker} title={b.title} right={b.cta ? <Link href={b.cta.href} className="hidden @md:inline-flex items-center gap-1.5 font-bold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline shrink-0">{b.cta.label} <ArrowRight className="size-4" aria-hidden /></Link> : undefined} />
      <Reveal className="grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 gap-3" stagger={0.05}>
        {products.map((p, k) => <div key={p.id} data-reveal className={`min-w-0 h-full ${k >= 4 ? "hidden @sm:block" : ""}`}><ProductCard product={p} tone="dark" /></div>)}
      </Reveal>
      {b.cta && <Link href={b.cta.href} className={`${primary} mt-6 w-full @md:hidden`}>{b.cta.label}{products.length > 4 ? ` (${products.length}+)` : ""}</Link>}
    </section>
  );
}

/** Πλακίδια κατηγοριών της μάρκας, με εικόνα και πλήθος, προς τη λίστα με φίλτρο μάρκας. */
export function Categories({ b, tiles }: { b: B<"categories">; tiles: CategoryTile[] }) {
  if (!tiles.length) return null;
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Κατηγορίες"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <ul className="m-0 p-0 list-none grid grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <li key={t.id} className="min-w-0">
            <Link href={t.href} className="group h-full grid gap-2 rounded-2xl bg-[var(--bs-bg2)] p-3 @md:p-4 hover:-translate-y-0.5 transition-transform">
              <span className="relative block aspect-[4/3] rounded-xl overflow-hidden">{t.image && <Image src={t.image} alt="" fill sizes="(max-width: 768px) 45vw, 300px" className="object-contain transition-transform duration-500 group-hover:scale-105" />}</span>
              <span className="font-heading font-bold text-[length:var(--fs-16)] @md:text-[length:var(--fs-18)] leading-tight">{t.name}</span>
              <span className="inline-flex items-center gap-1 text-[var(--bs-muted)] text-[length:var(--fs-14)]">{t.count} προϊόντα <ArrowRight className="size-3.5 text-[var(--bs-accent)] transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Συχνές ερωτήσεις (αναδιπλούμενες, χωρίς JavaScript) με δομημένα δεδομένα FAQPage για τη Google. */
export function Faq({ b }: { b: B<"faq"> }) {
  const items = b.items.filter((x) => x.q.trim() && x.a.trim());
  if (!items.length) return null;
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Συχνές ερωτήσεις"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <div className="grid gap-2 max-w-4xl">
        {items.map((x, k) => (
          <details key={k} className="group rounded-2xl bg-[var(--bs-bg2)] open:ring-2 open:ring-[var(--bs-accent)]/40">
            <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 @md:px-5 min-h-14 font-bold text-[length:var(--fs-16)] @md:text-[length:var(--fs-17)]">{x.q}<ChevronDown className="size-5 shrink-0 text-[var(--bs-accent)] transition-transform group-open:rotate-180" aria-hidden /></summary>
            <p className="m-0 px-4 @md:px-5 pb-4 text-[var(--bs-muted)] text-[length:var(--fs-16)] leading-relaxed whitespace-pre-line">{x.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </section>
  );
}

/** Απλό κείμενο με τίτλο — παράγραφοι από κενές γραμμές. */
export function TextBlock({ b }: { b: B<"text"> }) {
  const paras = (b.body ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const center = b.align === "center";
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-12" aria-label={b.title ?? "Κείμενο"}>
      <div className={`max-w-3xl grid gap-4 ${center ? "mx-auto text-center" : ""}`}>
        {b.kicker && <div className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase">{b.kicker}</div>}
        {b.title && <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-28)] @lg:text-[length:var(--fs-36)] leading-[1.08] tracking-[-0.02em]">{b.title}</h2>}
        {paras.map((p, k) => <p key={k} className="m-0 text-[var(--bs-muted)] text-[length:var(--fs-17)] leading-relaxed whitespace-pre-line">{p}</p>)}
      </div>
    </section>
  );
}

/** Gallery: ομοιόμορφο πλέγμα ή «mosaic» με την πρώτη εικόνα μεγάλη. */
export function Gallery({ b }: { b: B<"gallery"> }) {
  const imgs = b.images.filter((i) => i.src);
  if (imgs.length < 2) return null;
  const mosaic = b.layout === "mosaic" && imgs.length >= 3;
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Gallery"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <ul className={`m-0 p-0 list-none grid gap-3 ${mosaic ? "grid-cols-2 @3xl:grid-cols-4 @3xl:grid-rows-2" : "grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-3"}`}>
        {imgs.map((im, k) => {
          const big = mosaic && k === 0;
          const fig = (
            <figure className={`m-0 relative h-full rounded-2xl overflow-hidden bg-[var(--bs-bg2)] ${big ? "aspect-square @3xl:aspect-auto" : "aspect-[4/3]"}`}>
              <Image src={im.src} alt={im.caption ?? ""} fill sizes={big ? "(max-width: 1024px) 100vw, 640px" : "(max-width: 768px) 50vw, 400px"} className="object-cover transition-transform duration-500 hover:scale-[1.03]" />
              {im.caption && <figcaption className="absolute bottom-0 inset-x-0 p-3 bg-[linear-gradient(transparent,rgba(0,0,0,.7))] text-white font-bold text-[length:var(--fs-14)]">{im.caption}</figcaption>}
            </figure>
          );
          return <li key={k} className={`min-w-0 ${big ? "col-span-2 @3xl:row-span-2" : ""}`}>{im.href ? <Link href={im.href} className="block h-full">{fig}</Link> : fig}</li>;
        })}
      </ul>
    </section>
  );
}

/** Κάλεσμα σε δράση: ζώνη στο χρώμα της μάρκας με 1–2 κουμπιά. */
export function CtaBand({ b }: { b: B<"cta"> }) {
  return (
    <section className="eu-canvas eu-gutter py-10 @lg:py-14" aria-label={b.title ?? "Κάλεσμα σε δράση"}>
      <div className="rounded-3xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] p-6 @md:p-10 grid @3xl:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center">
        <div className="grid gap-2">
          {b.kicker && <span className="font-extrabold text-[length:var(--fs-13)] tracking-wide uppercase opacity-85">{b.kicker}</span>}
          {b.title && <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-28)] @lg:text-[length:var(--fs-42)] leading-[1.05] tracking-[-0.03em]">{b.title}</h2>}
          {b.body && <p className="m-0 text-[length:var(--fs-17)] leading-relaxed opacity-90 max-w-[40em]">{b.body}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          {b.primary?.label && <Link href={b.primary.href} className={`${btn} bg-[var(--bs-accent-ink)] text-[var(--bs-accent)] hover:opacity-90 grow @md:grow-0`}>{b.primary.label} <ArrowRight className="size-4" aria-hidden /></Link>}
          {b.secondary?.label && <Link href={b.secondary.href} className={`${secondary} grow @md:grow-0`}>{b.secondary.label}</Link>}
        </div>
      </div>
    </section>
  );
}
