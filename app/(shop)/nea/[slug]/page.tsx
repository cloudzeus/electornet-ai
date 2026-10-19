import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Share2 } from "lucide-react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { NewsCard, fmtDate } from "@/components/news/NewsCard";
import { getNews, getNewsCategories, getNewsItem } from "@/lib/data/repo";
import { SITE } from "@/lib/seo/product";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const n = await getNewsItem((await params).slug);
  if (!n) return {};
  const url = `${SITE}/nea/${n.slug}`;
  return { title: n.title, description: n.excerpt, alternates: { canonical: url }, openGraph: { title: n.title, description: n.excerpt, url, type: "article", publishedTime: n.date, images: n.image ? [{ url: `${SITE}${n.image}` }] : [] } };
}

/**
 * @dynamic /nea/[slug] — one CMS record rendered as an article with
 * NewsArticle JSON-LD, the related action (CTA) and three more items of
 * the same category. Body paragraphs come as rich text from the CMS.
 */
export default async function NewsArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const n = await getNewsItem(slug);
  if (!n) notFound();
  const cat = getNewsCategories().find((c) => c.slug === n.category);
  const more = (await getNews({ category: n.category })).filter((x) => x.slug !== n.slug).slice(0, 3);
  const ld = { "@context": "https://schema.org", "@type": "NewsArticle", headline: n.title, description: n.excerpt, datePublished: n.date, image: n.image ? [`${SITE}${n.image}`] : undefined, publisher: { "@type": "Organization", name: "Euronics", "@id": `${SITE}/#org` }, mainEntityOfPage: `${SITE}/nea/${n.slug}` };
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Νέα & ανακοινώσεις", href: "/nea" }, ...(cat ? [{ label: cat.label, href: `/nea?k=${cat.slug}` }] : []), { label: n.title }]} />
      <article className="eu-canvas eu-gutter pb-12">
        <header className="max-w-[820px] mx-auto text-center">
          {cat && (
            <Link href={`/nea?k=${cat.slug}`} className="inline-flex rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 py-1.5">
              {cat.label}
            </Link>
          )}
          <h1 className="m-0 mt-4 font-heading font-bold text-eu-ink text-[length:var(--fs-36)] leading-[1.1] tracking-[-0.02em]">{n.title}</h1>
          <p className="m-0 mt-4 text-eu-ink-2 text-[length:var(--fs-18)] leading-relaxed">{n.excerpt}</p>
          <div className="mt-4 flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-eu-muted text-[length:var(--fs-15)]">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> {fmtDate(n.date)}
            </span>
            <span>Euronics Ελλάδας</span>
            <span className="inline-flex items-center gap-1.5">
              <Share2 className="size-4" aria-hidden /> Κοινοποίηση
            </span>
          </div>
        </header>
        {n.image && (
          <div className="relative aspect-[16/9] @3xl:aspect-[21/9] rounded-2xl overflow-hidden my-8 max-w-[1100px] mx-auto">
            <Image src={n.image} alt="" fill sizes="(max-width: 1100px) 100vw, 1100px" priority className="object-cover" />
          </div>
        )}
        <div className="max-w-[720px] mx-auto grid gap-5">
          {(n.body ?? [n.excerpt]).map((p, i) => (
            <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-17)] leading-[1.75]">
              {p}
            </p>
          ))}
          {n.cta && (
            <Link href={n.cta.href} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:bg-eu-blue">
              {n.cta.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        {more.length > 0 && (
          <section className="mt-12" aria-label="Περισσότερα νέα">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] mb-4">Περισσότερα από {cat?.label.toLowerCase()}</h2>
            <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {more.map((x) => (
                <li key={x.slug} className="min-w-0">
                  <NewsCard item={x} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
