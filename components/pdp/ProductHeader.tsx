import { copyOf } from "@/lib/cms/copy";
import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { ChevronLeft } from "lucide-react";

const c = copyOf("productHeader");

/** Derive up to 4 headline facts from the spec table (the «Με μια ματιά» tiles). */
export function keyFacts(p: Product): { k: string; v: string }[] {
  const want = ["Διαγώνιος", "Εύρος Οθόνης", "Μέγεθος Οθόνης", "Τεχνολογία Panel", "Τεχνολογία panel", "Ανάλυση", "Ανάλυση Οθόνης", "Ρυθμός ανανέωσης", "Ονομαστική απόδοση", "Ισχύς ψύξης", "Ενεργειακή Κλάση Ψύξης", "Ενεργειακή κλάση ψύξης / θέρμανσης", "Χωρητικότητα Πλύσης", "Χωρητικότητα", "Στροφές", "Ενεργειακή Κλάση", "Ενεργειακή κλάση", "Επεξεργαστής", "Chip", "Μνήμη RAM", "Μνήμη", "Δίσκος", "SSD", "Αποθηκευτικός χώρος", "Βασική Κάμερα", "Κύρια", "Ισχύς", "Πίεση", "Αυτονομία", "Τύπος Ψύξης", "Καθαρή χωρητικότητα", "Συνολική χωρητικότητα", "Συνολική"];
  const out: { k: string; v: string }[] = [];
  for (const w of want) {
    const s = p.specs?.find((x) => x.key === w);
    if (s && !out.some((o) => o.v === s.value)) out.push({ k: s.key, v: s.value });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * Product header band: breadcrumb, brand, H1, rating, codes, badges and
 * up to four key facts as tiles. The energy label lives on the photo only;
 * the breadcrumb stops at the category (the H1 is the product) and on
 * phones it is one «‹ Κατηγορία» link instead of three wrapped lines.
 */
export function ProductHeader({ product: p, crumbs }: { product: Product; crumbs: { label: string; href?: string }[] }) {
  // ένα μόνο χαρακτηριστικό δίπλα στον τίτλο έμοιαζε ξεχασμένο· από 2 και πάνω είναι σύνοψη
  const facts = keyFacts(p);
  const links = crumbs.filter((x) => x.href);
  const parent = links[links.length - 1];
  return (
    <header className="bg-eu-blue text-white eu-container">
      <div className="eu-canvas eu-gutter pt-3 @md:pt-4 pb-4 @md:pb-6 @lg:pb-8">
        <nav aria-label={c.diadromi} className="text-[length:var(--fs-15)] text-eu-on-dark-3 mb-2 @md:mb-4">
          {parent?.href && (
            <Link href={parent.href} className="@md:hidden inline-flex items-center gap-1 min-h-11 -my-2 hover:text-white">
              <ChevronLeft className="size-4" aria-hidden /> {parent.label}
            </Link>
          )}
          <ol className="hidden @md:flex flex-wrap items-center gap-x-1.5 gap-y-0.5 m-0 p-0 list-none">
            <li>
              <Link href="/" className="hover:text-white">
                {c.archiki}
              </Link>
            </li>
            {links.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden>›</span>
                <Link href={c.href!} className="hover:text-white">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] gap-5 items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Link href={`/brands/${p.brandSlug}`} className="rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center min-h-8 font-bold text-[length:var(--fs-15)] px-3 transition-colors">
                {p.brand}
              </Link>
              {p.badge?.kind === "discount" && <span className="rounded-full bg-eu-red text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">{c.prosfora}</span>}
              {p.badge?.kind === "new" && <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">{c.neo}</span>}
              {p.badge?.kind === "renew" && <span className="rounded-full bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">Renew · Grade {p.badge.grade}</span>}
            </div>
            <h1 className="m-0 font-heading font-bold text-[length:var(--fs-34)] leading-[1.1] tracking-[-0.02em]">{p.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 @md:mt-3 text-[length:var(--fs-14)] text-eu-on-dark-3 tabular-nums">
              {p.rating && (
                <a href="#reviews" className="inline-flex items-center gap-1.5 text-white font-semibold hover:text-eu-yellow">
                  <span className="text-eu-yellow">{"★".repeat(Math.round(p.rating.value))}</span> {p.rating.value.toLocaleString("el-GR")} · {p.rating.count} αξιολογήσεις
                </a>
              )}
              <span>Κωδικός {p.sku}</span>
              {p.ean && <span>EAN {p.ean}</span>}
            </div>
          </div>
          {facts.length > 1 && (
            <dl className={`m-0 grid gap-2 min-w-0 ${facts.length >= 4 ? "grid-cols-2 @xl:grid-cols-4" : facts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {facts.map((f) => (
                <div key={f.k} className="rounded-lg bg-white/10 px-3.5 py-3 min-w-0">
                  <dt className="text-eu-on-dark-3 text-[length:var(--fs-14)] truncate">{f.k}</dt>
                  <dd className="m-0 font-bold text-white text-[length:var(--fs-17)] leading-tight truncate">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </header>
  );
}
