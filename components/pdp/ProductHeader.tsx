import { copyOf } from "@/lib/cms/copy";
import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { ChevronLeft } from "lucide-react";

const c = copyOf("productHeader");

/**
 * Product header band: breadcrumb, brand, H1, rating, codes, badges and
 * up to four key facts as tiles. The energy label lives on the photo only;
 * the breadcrumb stops at the category (the H1 is the product) and on
 * phones it is one «‹ Κατηγορία» link instead of three wrapped lines.
 */
export function ProductHeader({ product: p, crumbs }: { product: Product; crumbs: { label: string; href?: string }[] }) {
  const links = crumbs.filter((x) => x.href);
  const parent = links[links.length - 1];
  return (
    <header className="bg-white text-eu-ink border-b border-eu-line eu-container">
      <div className="eu-canvas eu-gutter pt-3 @md:pt-4 pb-3 @md:pb-4">
        <nav aria-label={c.diadromi} className="text-[length:var(--fs-15)] text-eu-muted mb-2">
          {parent?.href && (
            <Link href={parent.href} className="@md:hidden inline-flex items-center gap-1 min-h-11 -my-2 hover:text-eu-blue">
              <ChevronLeft className="size-4" aria-hidden /> {parent.label}
            </Link>
          )}
          <ol className="hidden @md:flex flex-wrap items-center gap-x-1.5 gap-y-0.5 m-0 p-0 list-none">
            <li>
              <Link href="/" className="hover:text-eu-blue">
                {c.archiki}
              </Link>
            </li>
            {links.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden>›</span>
                <Link href={c.href!} className="hover:text-eu-blue">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Link href={`/brands/${p.brandSlug}`} className="rounded-full bg-eu-surface hover:bg-eu-chip text-eu-ink inline-flex items-center min-h-11 font-bold text-[length:var(--fs-15)] px-3.5 transition-colors">
                {p.brand}
              </Link>
              {p.badge?.kind === "new" && <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">{c.neo}</span>}
              {p.badge?.kind === "renew" && <span className="rounded-full bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">Renew · Grade {p.badge.grade}</span>}
            </div>
            <h1 className="m-0 font-heading font-bold text-[length:var(--fs-28)] leading-[1.15] tracking-[-0.02em]">{p.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[length:var(--fs-14)] text-eu-muted tabular-nums">
              {p.rating && (
                <a href="#reviews" className="inline-flex items-center gap-1.5 text-eu-ink font-semibold hover:text-eu-blue">
                  <span className="text-eu-amber">{"★".repeat(Math.round(p.rating.value))}</span> {p.rating.value.toLocaleString("el-GR")} · {p.rating.count} αξιολογήσεις
                </a>
              )}
              <span>Κωδικός {p.sku}</span>
              {p.ean && <span>EAN {p.ean}</span>}
            </div>
        </div>
      </div>
    </header>
  );
}
