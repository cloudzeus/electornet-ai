import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { SmartGuide } from "@/components/guides/SmartGuide";
import { GUIDES, isKind } from "@/lib/guides/smart";
import { listProducts } from "@/lib/data/repo";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isKind(kind)) return {};
  const g = GUIDES[kind];
  return { title: `Έξυπνος οδηγός αγοράς · ${g.title}`, description: g.intro };
}

export function generateStaticParams() {
  return Object.keys(GUIDES).map((kind) => ({ kind }));
}

/**
 * /odigos-agoras/{tileoraseis|ypologistes|klimatistika}: the smart buying
 * guide. The server loads every candidate product of the category; the
 * client wizard scores them against the answers (lib/guides/smart).
 */
export default async function SmartGuidePage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isKind(kind)) notFound();
  const g = GUIDES[kind];
  const lists = await Promise.all(g.l2s.map((l2) => listProducts({ l1: g.l1, l2, perPage: 60 })));
  const products = lists.flatMap((r) => r.items);
  const others = Object.values(GUIDES).filter((x) => x.kind !== kind);

  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Έξυπνος οδηγός αγοράς", href: "/odigos-agoras" }, { label: g.title }]} />
      <header className="bg-eu-navy text-white eu-container">
        <div className="eu-canvas eu-gutter py-7 @lg:py-10 grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-center">
          <div>
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide mb-2 flex items-center gap-1.5">
              <Sparkles className="size-4" aria-hidden /> Έξυπνος οδηγός αγοράς
            </div>
            <h1 className="m-0 font-heading font-bold text-[length:var(--fs-34)] leading-[1.1] tracking-[-0.02em]">{g.title}</h1>
            <p className="m-0 mt-3 text-eu-on-dark text-[length:var(--fs-17)] max-w-[46em] leading-relaxed">{g.intro}</p>
            <p className="m-0 mt-3 text-eu-on-dark-2 text-[length:var(--fs-14)]">
              {products.length} μοντέλα στη σύγκριση · η πρόταση αιτιολογείται με τα πραγματικά χαρακτηριστικά κάθε προϊόντος.
            </p>
          </div>
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden hidden @3xl:block">
            <Image src={g.image} alt="" fill sizes="340px" className="object-cover" priority />
          </div>
        </div>
      </header>
      <div className="eu-canvas eu-gutter py-8 @lg:py-10">
        <SmartGuide kind={kind} products={products} />
      </div>
      <div className="eu-canvas eu-gutter pb-12">
        <div className="rounded-2xl bg-eu-surface p-5 flex flex-wrap items-center gap-3 text-[length:var(--fs-15)]">
          <span className="font-bold text-eu-ink">Άλλοι οδηγοί:</span>
          {others.map((o) => (
            <Link key={o.kind} href={`/odigos-agoras/${o.kind}`} className="rounded-full bg-white border border-eu-line px-4 min-h-11 inline-flex items-center font-semibold text-eu-ink-2 hover:border-eu-blue hover:text-eu-blue">
              {o.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
