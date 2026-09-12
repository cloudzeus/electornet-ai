import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("breadcrumbs");

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumbs with BreadcrumbList JSON-LD. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: "Αρχική", href: "/" }, ...items];
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...(c.href ? { item: `https://www.euronics.gr${c.href}` } : {}) })),
  };
  return (
    <nav aria-label={c.diadromi} className="eu-canvas eu-gutter py-3 text-[length:var(--fs-14)] text-eu-muted">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 m-0 p-0 list-none">
        {all.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 text-eu-muted-3" aria-hidden />}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="hover:text-eu-blue">
                {c.label}
              </Link>
            ) : (
              <span className="text-eu-ink font-semibold" aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </nav>
  );
}
