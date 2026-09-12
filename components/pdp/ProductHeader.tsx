import { copyOf } from "@/lib/cms/copy";
import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { EnergyChip } from "@/components/commerce/EnergyChip";

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
 * Product header band: brand chip, H1, rating, codes, badges, energy
 * label, and four key facts as large tiles — the answer to «13 specs in
 * a 7px wall of text» on the current site.
 */
export function ProductHeader({ product: p, crumbs }: { product: Product; crumbs: { label: string; href?: string }[] }) {
  const facts = keyFacts(p);
  return (
    <header className="bg-eu-blue text-white eu-container">
      <div className="eu-canvas eu-gutter pt-4 pb-6 @lg:pb-8">
        <nav aria-label={c.diadromi} className="text-[length:var(--fs-15)] text-eu-on-dark-3 mb-4">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 m-0 p-0 list-none">
            <li>
              <Link href="/" className="hover:text-white">
                {c.archiki}
              </Link>
            </li>
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden>›</span>
                {c.href ? (
                  <Link href={c.href} className="hover:text-white">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-white font-semibold">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] gap-5 items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Link href={`/brands/${p.brandSlug}`} className="rounded-full bg-white/15 hover:bg-white/25 text-white font-extrabold text-[length:var(--fs-15)] px-3 py-1.5 tracking-wide">
                {p.brand}
              </Link>
              {p.badge?.kind === "discount" && <span className="rounded-full bg-eu-red text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">{c.prosfora}</span>}
              {p.badge?.kind === "new" && <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">{c.neo}</span>}
              {p.badge?.kind === "renew" && <span className="rounded-full bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5">Renew · Grade {p.badge.grade}</span>}
              {p.energy && (
                <span className="inline-flex items-center gap-1.5">
                  <EnergyChip cls={p.energy.cls} fiche={p.energy.fiche} />
                </span>
              )}
            </div>
            <h1 className="m-0 font-heading font-bold text-[length:var(--fs-34)] leading-[1.1] tracking-[-0.02em]">{p.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[length:var(--fs-16)] text-eu-on-dark">
              {p.rating && (
                <a href="#reviews" className="inline-flex items-center gap-1.5 text-white font-semibold hover:text-eu-yellow">
                  <span className="text-eu-yellow">{"★".repeat(Math.round(p.rating.value))}</span> {p.rating.value.toLocaleString("el-GR")} · {p.rating.count} αξιολογήσεις
                </a>
              )}
              <span>Κωδικός {p.sku}</span>
              {p.ean && <span>EAN {p.ean}</span>}
              <a href="#compare" className="text-eu-yellow font-semibold hover:underline">
                {c.sygkrine_me_paromoia}
              </a>
            </div>
          </div>
          {facts.length > 0 && (
            <dl className={`m-0 grid gap-2 min-w-0 ${facts.length >= 4 ? "grid-cols-2 @xl:grid-cols-4" : facts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {facts.map((f) => (
                <div key={f.k} className="rounded-lg bg-white/10 px-3.5 py-3 min-w-0">
                  <dt className="text-eu-on-dark-3 text-[length:var(--fs-14)] truncate">{f.k}</dt>
                  <dd className="m-0 font-extrabold text-white text-[length:var(--fs-17)] leading-tight truncate">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </header>
  );
}
