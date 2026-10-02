import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { Countdown } from "@/components/commerce/Countdown";
import { ProductGrid } from "@/components/catalog/ProductGrid";
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
  const rendered = await Promise.all(blocks.map((b) => renderBlock(b, { promotionId: promo?.id ?? null, terms: promo?.termsText ?? null, endsAt: endsAt?.toISOString() ?? null, ended })));
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

async function renderBlock(b: Block, ctx: { promotionId: string | null; terms: string | null; endsAt: string | null; ended: boolean }) {
  switch (b.type) {
    case "hero": {
      const p = b.props;
      return (
        <section key={b.id} className={`${TONE[p.tone ?? "navy"]} relative overflow-hidden`}>
          <div className="eu-canvas eu-gutter py-10 @lg:py-14 grid @3xl:grid-cols-[1.1fr_1fr] gap-6 items-center">
            <div className="grid gap-3">
              {p.kicker && <div className="font-extrabold text-[length:var(--fs-14)] tracking-wide opacity-90">{p.kicker}</div>}
              <h1 className="m-0 font-heading font-bold text-[length:var(--fs-42)] leading-[1.05] tracking-[-0.02em]">{p.title}</h1>
              {p.subtitle && <p className="m-0 text-[length:var(--fs-18)] leading-relaxed opacity-95">{p.subtitle}</p>}
              {p.ctaLabel && p.ctaHref && !ctx.ended && <Link href={p.ctaHref} className={`justify-self-start rounded-full px-7 min-h-14 inline-flex items-center font-extrabold text-[length:var(--fs-17)] ${p.tone === "yellow" ? "bg-eu-navy text-white" : "bg-eu-yellow text-eu-navy"}`}>{p.ctaLabel}</Link>}
            </div>
            {p.image && <div className="relative aspect-[4/3] rounded-3xl overflow-hidden"><Image src={p.image} alt="" fill sizes="(max-width: 900px) 100vw, 50vw" className="object-cover" priority unoptimized={p.image.startsWith("http")} /></div>}
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
      const products = await blockProducts(b.props, ctx.promotionId);
      if (!products.length) return null;
      return (
        <section key={b.id} id="proionta" className="eu-canvas eu-gutter grid gap-4 scroll-mt-24">
          {b.props.title && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{b.props.title}</h2>}
          <ProductGrid products={products} />
        </section>
      );
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
