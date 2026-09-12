import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { NewsItem } from "@/lib/data/types";
import { getNewsCategories } from "@/lib/data/repo";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("newsCard");

export const fmtDate = (d: string) => new Date(d).toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });

/**
 * @dynamic News card — one CMS record. Fixed 16:10 image frame so the
 * grid rows stay aligned whatever the source photo; title clamped to
 * three lines; the whole card is the link.
 */
export function NewsCard({ item, priority = false, featured = false }: { item: NewsItem; priority?: boolean; featured?: boolean }) {
  const cat = getNewsCategories().find((c) => c.slug === item.category)?.label ?? item.category;
  return (
    <article className={`group bg-white rounded-2xl border border-eu-line overflow-hidden flex h-full hover:shadow-[var(--shadow-raised)] transition-shadow ${featured ? "flex-col @3xl:flex-row" : "flex-col"}`}>
      <Link href={`/nea/${item.slug}`} className={`relative block bg-eu-surface-2 shrink-0 ${featured ? "aspect-[16/10] @3xl:aspect-auto @3xl:w-[52%]" : "aspect-[16/10]"}`}>
        {item.image ? <Image src={item.image} alt="" fill sizes={featured ? "(max-width: 768px) 100vw, 640px" : "(max-width: 640px) 100vw, 400px"} priority={priority} className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : null}
        <span className="absolute top-3 left-3 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 py-1">{cat}</span>
      </Link>
      <div className={`p-5 flex flex-col gap-2 flex-1 ${featured ? "@3xl:p-8 @3xl:justify-center" : ""}`}>
        <div className="flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-14)]">
          <CalendarDays className="size-4" aria-hidden /> {fmtDate(item.date)}
        </div>
        <h3 className={`m-0 font-heading font-bold text-eu-ink leading-tight group-hover:text-eu-blue ${featured ? "text-[length:var(--fs-28)]" : "text-[length:var(--fs-19)] line-clamp-3 min-h-[3.6em]"}`}>
          <Link href={`/nea/${item.slug}`}>{item.title}</Link>
        </h3>
        <p className={`m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed ${featured ? "" : "line-clamp-3"}`}>{item.excerpt}</p>
        <Link href={`/nea/${item.slug}`} className="mt-auto pt-2 inline-flex items-center gap-1 font-extrabold text-eu-blue text-[length:var(--fs-15)]">
          {c.diavase} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
