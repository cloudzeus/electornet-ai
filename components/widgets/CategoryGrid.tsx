import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Category } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { SectionHead } from "./SectionHead";

/**
 * Zone 6 — nine categories as a typographic grid: numbers 01–09, big
 * type, product & brand counts, one arrow. No icons: a set for nine
 * unrelated categories always ends up cheap and never survives 200
 * sub-categories. One cell fills dark as the seasonal emphasis —
 * marketing picks which from the CMS (`featured` prop).
 *
 * Adaptive: 3 columns ≥ 820px container, 2 at tablet widths, a single
 * column with compact rows on phones (count moves inline).
 */
export function CategoryGrid({ categories, featured, zoneNo, title = ["Ό,τι χρειάζεται το σπίτι σου,", "σε εννέα κατηγορίες."] }: { categories: Category[]; featured?: string; zoneNo?: number; title?: string | [string, string] }) {
  return (
    <section className="relative eu-container bg-white" aria-labelledby="cat-grid-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter pt-8 @lg:pt-[38px] pb-8">
        <SectionHead
          id="cat-grid-title"
          kicker="Κατάλογος"
          title={title}
          link={{ label: "Όλος ο κατάλογος →", href: "/proionta" }}
        />
        <ul className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-px bg-eu-line border border-eu-line rounded-lg overflow-hidden m-0 p-0 list-none">
          {categories.map((c) => {
            const dark = c.id === featured || (!featured && c.featured);
            return (
              <li key={c.id} data-reveal className={`relative overflow-hidden ${dark ? "bg-eu-navy" : "bg-white"}`}>
                {/* giant numeral watermark: slides up on hover */}
                <span className={`pointer-events-none absolute -right-2 -bottom-6 font-heading font-extrabold text-[length:var(--fs-120)] leading-none tracking-[-0.06em] select-none transition-transform duration-500 ease-[var(--eu-ease-out)] group-hover:translate-y-0 ${dark ? "text-white/[.07]" : "text-eu-navy/[.05]"}`} aria-hidden>
                  {c.no}
                </span>
                <Link
                  href={`/k/${c.slug}`}
                  className={`relative flex justify-between items-start gap-3 p-4 @md:p-[20px_22px] h-full group ${dark ? "text-white" : "text-eu-ink"} hover:bg-eu-surface/60 ${dark ? "hover:bg-eu-navy-2" : ""} transition-colors`}
                >
                  <span className="pointer-events-none absolute left-0 bottom-0 h-[3px] w-full origin-left scale-x-0 bg-eu-yellow transition-transform duration-500 ease-[var(--eu-ease-out)] group-hover:scale-x-100" aria-hidden />
                  <div>
                    <div className={`font-extrabold text-[length:var(--fs-13-5)] mb-2 ${dark ? "text-eu-yellow" : "text-eu-muted-3"}`}>{c.no}</div>
                    <div className="font-bold text-[length:var(--fs-19)] leading-[1.15]">
                      {c.titleBreak ? (
                        <>
                          {c.titleBreak[0]}
                          <br className="hidden @sm:block" /> {c.titleBreak[1]}
                        </>
                      ) : (
                        c.title
                      )}
                    </div>
                    <div className={`font-medium text-[length:var(--fs-14)] mt-2 ${dark ? "text-eu-on-dark-2" : "text-eu-muted-2"}`}>
                      {c.count.toLocaleString("el-GR")} προϊόντα{c.meta ? ` · ${c.meta}` : ""}
                    </div>
                  </div>
                  <ArrowRight className={`size-4 mt-1 shrink-0 transition-transform group-hover:translate-x-1 ${dark ? "text-eu-yellow" : "text-eu-blue"}`} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
