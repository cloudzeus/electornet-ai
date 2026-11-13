import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/ui/Image";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { Countdown } from "@/components/commerce/Countdown";
import { LandingProducts } from "@/components/promo/LandingProducts";
import { Price } from "@/components/commerce/Price";
import { cutoutFor } from "@/lib/data/cutouts";
import { bannerCutouts } from "@/lib/promo/banner-cutouts";
import { discountPct } from "@/lib/format";
import type { Product } from "@/lib/data/types";
import { CopyCoupon } from "@/components/promo/CopyCoupon";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockProducts, getLanding } from "@/lib/promo/landing";
import type { Block } from "@/lib/promo/landing-blocks";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

async function load({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // προεπισκόπηση πρόχειρης σελίδας: μόνο για συνδεδεμένο προσωπικό
  const preview = sp.preview === "1" && !!(await auth())?.user;
  return { data: await getLanding(slug, { preview }), preview };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { data } = await load(props);
  if (!data) return { title: "Προσφορά" };
  return { title: data.page.seoTitle ?? data.page.title, description: data.page.seoDesc ?? undefined, robots: data.page.status !== "published" ? { index: false } : undefined };
}

const TONE = { navy: "bg-eu-navy text-white", yellow: "bg-eu-yellow text-eu-navy", red: "bg-eu-red text-white" } as const;

/** Landing page προσφοράς: τα blocks με τη σειρά που τα έστησε ο διαχειριστής. */
export default async function LandingPage(props: Props) {
  const { data, preview } = await load(props);
  if (!data) notFound();
  const { page, blocks, promo, ended, endsAt } = data;
  // Τα προϊόντα της σελίδας διαβάζονται μία φορά: τα δείχνει το block «Προϊόντα» και από αυτά στήνεται η βιτρίνα του hero (τα 3 με τη μεγαλύτερη έκπτωση).
  const pBlock = blocks.find((b): b is Extract<Block, { type: "products" }> => b.type === "products");
  const products = pBlock ? await blockProducts(pBlock.props, promo?.id ?? null) : [];
  const top = [...products].filter((p) => p.price > 0 && p.image).sort((a, b) => (discountPct(b.price, b.wasPrice) ?? 0) - (discountPct(a.price, a.wasPrice) ?? 0)).slice(0, 3);
  const cuts = top.length ? await bannerCutouts(top.map((p) => p.id)).catch(() => new Map<string, string>()) : new Map<string, string>();
  const showcase = top.map((p) => { const cut = cuts.get(p.id) ?? cutoutFor(p.image); return { p, image: cut ?? p.image!, cutout: !!cut }; });
  const cats = Object.fromEntries((await db.category.findMany({ where: { slug: { in: [...new Set(products.map((p) => p.subcategory))] } }, select: { slug: true, name: true } })).map((c) => [c.slug, c.name]));
  const rendered = await Promise.all(blocks.map((b) => renderBlock(b, { promotionId: promo?.id ?? null, terms: promo?.termsText ?? null, endsAt: endsAt?.toISOString() ?? null, ended, products, productsId: pBlock?.id ?? null, showcase, cats })));
  return (
    <div className="eu-container">
      {preview && page.status !== "published" && <div className="bg-eu-yellow text-eu-navy text-center font-bold py-2 text-[length:var(--fs-14)]">Προεπισκόπηση — η σελίδα δεν είναι δημοσιευμένη</div>}
      <Breadcrumbs items={[{ label: "Προσφορές", href: "/prosfores" }, { label: page.title }]} />
      {ended && (
        <div className="eu-canvas eu-gutter pt-6">
          <p className="m-0 rounded-2xl bg-eu-surface p-5 text-eu-ink-2 text-[length:var(--fs-16)]"><strong>Η προσφορά έληξε.</strong> Δες τις <Link href="/prosfores" className="font-bold text-eu-blue hover:underline">τρέχουσες προσφορές</Link>.</p>
        </div>
      )}
      <div className="grid gap-10 pb-14">{rendered}</div>
    </div>
  );
}

type Ctx = { promotionId: string | null; terms: string | null; endsAt: string | null; ended: boolean; products: Product[]; productsId: string | null; showcase: { p: Product; image: string; cutout: boolean }[]; cats: Record<string, string> };
async function renderBlock(b: Block, ctx: Ctx) {
  switch (b.type) {
    case "hero": {
      const p = b.props;
      const maxPct = Math.max(0, ...ctx.products.map((x) => discountPct(x.price, x.wasPrice) ?? 0));
      const facts = [ctx.products.length > 1 ? `${ctx.products.length} προϊόντα` : null, maxPct > 0 ? `έως −${maxPct}\u00a0%` : null, ctx.endsAt && !ctx.ended ? `έως ${new Date(ctx.endsAt).toLocaleDateString("el-GR", { day: "numeric", month: "long", timeZone: "Europe/Athens" })}` : null].filter(Boolean) as string[];
      const show = ctx.ended ? [] : ctx.showcase;
      return (
        <section key={b.id} className={`${TONE[p.tone ?? "navy"]} relative overflow-hidden`}>
          <div className="eu-canvas eu-gutter py-10 @lg:py-14 grid @3xl:grid-cols-[1.1fr_1fr] gap-6 items-center">
            <div className="grid gap-3">
              {p.kicker && <div className="font-extrabold text-[length:var(--fs-14)] tracking-wide opacity-90">{p.kicker}</div>}
              <h1 className="m-0 font-heading font-bold text-[length:var(--fs-42)] leading-[1.05] tracking-[-0.02em]">{p.title}</h1>
              {p.subtitle && <p className="m-0 text-[length:var(--fs-18)] leading-relaxed opacity-95">{p.subtitle}</p>}
              {facts.length > 0 && <ul className="m-0 p-0 list-none flex flex-wrap gap-2">{facts.map((f) => <li key={f} className={`rounded-full px-3.5 py-1.5 font-bold text-[length:var(--fs-14)] ${p.tone === "yellow" ? "bg-eu-navy/10" : "bg-white/12 ring-1 ring-white/20"}`}>{f}</li>)}</ul>}
              {p.ctaLabel && p.ctaHref && !ctx.ended && <Link href={p.ctaHref} className={`justify-self-start rounded-full px-7 min-h-14 inline-flex items-center font-extrabold text-[length:var(--fs-17)] ${p.tone === "yellow" ? "bg-eu-navy text-white" : "bg-eu-yellow text-eu-navy"}`}>{p.ctaLabel}</Link>}
            </div>
            {(p.image || show.length > 0) && (
              // Η εικόνα της καμπάνιας γίνεται σκηνικό και πάνω της στέκονται τα 3 προϊόντα με τη μεγαλύτερη έκπτωση, το καθένα με την τιμή του — ποτέ άδεια εικόνα.
              <div className={`@container relative aspect-[4/3] rounded-3xl overflow-hidden ${p.image ? "" : "bg-black/20"}`}>
                {p.image && <Image src={p.image} alt="" fill sizes="(max-width: 900px) 100vw, 50vw" className="object-cover object-left-top" priority unoptimized={p.image.startsWith("http")} />}
                {show.length > 0 && (
                  <ul className={`absolute inset-x-[4%] bottom-[5%] top-[30%] m-0 p-0 list-none grid items-end gap-[2%] ${show.length === 3 ? "grid-cols-[1fr_1.25fr_1fr]" : show.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {(show.length === 3 ? [show[1], show[0], show[2]] : show).map(({ p: x, image, cutout }) => (
                      <li key={x.id} className="min-w-0 h-full">
                        <Link href={`/proion/${x.slug}`} className="group h-full grid grid-rows-[minmax(0,1fr)_auto] justify-items-center gap-[4%] rounded-2xl focus-visible:outline-2 focus-visible:outline-eu-yellow">
                          <img src={image} alt={`${x.brand} ${x.title}`} className={`max-w-full max-h-full min-h-0 object-contain object-bottom self-end transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none ${cutout ? "eu-cutout-shadow-dark" : "rounded-xl bg-white p-[4%]"}`} />
                          <span className="grid justify-items-center leading-none rounded-xl bg-eu-yellow text-eu-navy px-[5cqw] @md:px-3 py-1.5 shadow-lg">
                            <span className="font-extrabold uppercase truncate max-w-[10ch] text-[length:var(--fs-12)]">{x.brand}</span>
                            <span className="font-heading font-extrabold tabular-nums text-[length:var(--fs-18)] @md:text-[length:var(--fs-22)]"><Price value={x.price} short euroSmall /></span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      );
    }
    case "countdown":
      return ctx.endsAt && !ctx.ended ? (
        <section key={b.id} className="eu-canvas eu-gutter flex flex-wrap items-center justify-center gap-4">
          <span className="font-extrabold text-eu-navy text-[length:var(--fs-18)]">{b.props.label ?? "Λήγει σε"}</span>
          <Countdown endsAt={ctx.endsAt} variant="blocks" />
        </section>
      ) : null;
    case "products": {
      const products = b.id === ctx.productsId ? ctx.products : await blockProducts(b.props, ctx.promotionId);
      if (!products.length) return null;
      return <LandingProducts key={b.id} title={b.props.title} products={products} cats={ctx.cats} />;
    }
    case "categories": {
      const cats = b.props.ids.length ? await db.category.findMany({ where: { id: { in: b.props.ids }, active: true }, select: { id: true, name: true, slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } }) : [];
      if (!cats.length) return null;
      const href = (c: (typeof cats)[number]) => `/k/${[c.parent?.parent?.slug, c.parent?.slug, c.slug].filter(Boolean).join("/")}`;
      return (
        <section key={b.id} className="eu-canvas eu-gutter grid gap-4">
          {b.props.title && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{b.props.title}</h2>}
          <ul className="m-0 p-0 list-none grid grid-cols-2 @lg:grid-cols-3 @4xl:grid-cols-6 gap-3">
            {cats.map((c) => <li key={c.id}><Link href={href(c)} className="flex items-center justify-center text-center rounded-2xl bg-eu-chip text-eu-navy font-extrabold text-[length:var(--fs-16)] min-h-24 p-4 hover:bg-eu-navy hover:text-white transition-colors">{c.name}</Link></li>)}
          </ul>
        </section>
      );
    }
    case "coupon":
      return b.props.code && !ctx.ended ? (
        <section key={b.id} className="eu-canvas eu-gutter">
          <div className="rounded-3xl bg-eu-yellow/30 p-6 @md:p-8 grid justify-items-center gap-3 text-center">
            {b.props.text && <p className="m-0 font-bold text-eu-navy text-[length:var(--fs-18)]">{b.props.text}</p>}
            <CopyCoupon code={b.props.code} />
          </div>
        </section>
      ) : null;
    case "text":
      return (
        <section key={b.id} className="eu-canvas eu-gutter max-w-[72ch] grid gap-2">
          {b.props.title && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{b.props.title}</h2>}
          {b.props.body.split(/\n{2,}/).map((para, i) => <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-17)] leading-relaxed">{para}</p>)}
        </section>
      );
    case "banner":
      if (!b.props.image) return null;
      return (
        <section key={b.id} className="eu-canvas eu-gutter">
          {(() => { const img = <span className="relative block aspect-[16/4] rounded-3xl overflow-hidden"><Image src={b.props.image} alt={b.props.alt ?? ""} fill sizes="100vw" className="object-cover" unoptimized={b.props.image.startsWith("http")} /></span>; return b.props.href ? <Link href={b.props.href}>{img}</Link> : img; })()}
        </section>
      );
    case "terms":
      return ctx.terms ? (
        <section key={b.id} className="eu-canvas eu-gutter max-w-[80ch]">
          <details className="rounded-2xl border border-eu-line bg-white p-5"><summary className="cursor-pointer font-bold text-eu-ink text-[length:var(--fs-16)] min-h-8">{b.props.title ?? "Όροι προσφοράς"}</summary><p className="m-0 mt-3 text-eu-ink-3 text-[length:var(--fs-15)] leading-relaxed">{ctx.terms}</p></details>
        </section>
      ) : null;
    case "faq":
      return b.props.items.some((x) => x.q && x.a) ? (
        <section key={b.id} className="eu-canvas eu-gutter max-w-[80ch] grid gap-3">
          {b.props.title && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{b.props.title}</h2>}
          {b.props.items.filter((x) => x.q && x.a).map((x, i) => <details key={i} className="rounded-2xl border border-eu-line bg-white p-5"><summary className="cursor-pointer font-bold text-eu-ink text-[length:var(--fs-16)] min-h-8">{x.q}</summary><p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)] leading-relaxed">{x.a}</p></details>)}
        </section>
      ) : null;
  }
}
