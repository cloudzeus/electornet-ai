import type { NewsItem } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { SectionHead } from "./SectionHead";
import { NewsCard } from "@/components/news/NewsCard";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("newsBand");

/**
 * @dynamic Zone «Νέα & ανακοινώσεις» — `getNews({ limit })` from the
 * CMS; the zone config (lib/cms/home.layout) sets the limit and can
 * schedule / A-B it like any other widget. Columns follow the width.
 */
export function NewsBand({ items, zoneNo }: { items: NewsItem[]; zoneNo?: number }) {
  if (items.length === 0) return null;
  return (
    <section className="relative bg-eu-surface eu-container" aria-labelledby="news-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter py-8 @lg:py-10">
        <SectionHead id="news-title" kicker="Νέα & ανακοινώσεις" title={c.ti_ginetai_sti_euronics} link={{ label: "Όλα τα νέα →", href: "/nea" }} />
        <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {items.map((n) => (
            <li key={n.slug} className="min-w-0">
              <NewsCard item={n} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
