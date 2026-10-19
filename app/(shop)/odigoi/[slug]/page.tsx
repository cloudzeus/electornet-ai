import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { getGuide, getGuidesFull, listProducts } from "@/lib/data/repo";
import { ProductRail } from "@/components/pdp/ProductRail";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = await getGuide((await params).slug);
  return g ? { title: g.title, description: g.excerpt } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) notFound();
  const l2 = g.ctaHref?.split("/")[3];
  const l1 = g.ctaHref?.split("/")[2];
  const [others, picks] = await Promise.all([getGuidesFull(), listProducts({ l1: l1 && l1 !== "renew" ? l1 : undefined, l2, renew: l1 === "renew" ? true : undefined, perPage: 6 })]);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Οδηγοί", href: "/odigoi" }, { label: g.title }]} />
      <article className="eu-canvas eu-gutter pb-12">
        <div className="max-w-[760px] mx-auto">
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide mb-2">
            {g.kicker} · {g.minutes}′ ανάγνωση{g.date ? ` · ${new Date(g.date).toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" })}` : ""}
          </div>
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-34)] leading-[1.1] tracking-[-0.02em]">{g.title}</h1>
          <p className="m-0 mt-3 text-eu-muted text-[length:var(--fs-17)]">{g.excerpt}</p>
        </div>
        {g.image && (
          <div className="relative h-[240px] @md:h-[420px] rounded-xl overflow-hidden my-6">
            <Image src={g.image} alt="" fill sizes="1100px" className="object-cover" priority />
          </div>
        )}
        <div className="max-w-[760px] mx-auto grid gap-4">
          {g.body?.map((p, i) => (
            <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-17)] leading-[1.7]">
              {p}
            </p>
          ))}
          {g.ctaHref && (
            <Link href={g.ctaHref} className="justify-self-start rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 py-3.5 min-h-12 inline-flex items-center hover:bg-eu-yellow-dark">
              {g.cta}
            </Link>
          )}
          {g.sourceUrl && (
            <p className="m-0 text-eu-muted-2 text-[length:var(--fs-13-5)]">
              Θέμα από το blog του euronics.gr ·{" "}
              <a href={g.sourceUrl} className="underline" rel="noreferrer" target="_blank">
                πηγή
              </a>
            </p>
          )}
        </div>
        {picks.items.length > 0 && <ProductRail title="Οι προτάσεις του οδηγού" products={picks.items} />}
        <section className="mt-10">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-3">Περισσότεροι οδηγοί</h2>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
            {others.filter((o) => o.slug !== g.slug).map((o) => (
              <li key={o.slug}>
                <Link href={`/odigoi/${o.slug}`} className="inline-flex rounded-full border border-eu-line bg-white px-4 py-2 min-h-10 items-center font-semibold text-eu-ink-2 text-[length:var(--fs-15)] hover:border-eu-blue hover:text-eu-blue">
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
