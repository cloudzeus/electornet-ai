import Image from "next/image";
import Link from "next/link";
import type { Guide } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { SectionHead } from "./SectionHead";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("guidesBand");

const TONE = { blue: "text-eu-blue", red: "text-eu-red", green: "text-eu-green" };

/**
 * Zone 11 — guides with an asymmetric composition: one lead guide
 * full-bleed, two secondary. Each ends in a shopping path, because this
 * is the channel for early-intent queries where marketplaces don't rank.
 */
export function GuidesBand({ guides, zoneNo }: { guides: Guide[]; zoneNo?: number }) {
  const [lead, ...rest] = guides;
  return (
    <section className="relative bg-white eu-container" aria-labelledby="guides-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter pt-8 @lg:pt-[38px] pb-8">
        <SectionHead id="guides-title" kicker="Οδηγοί αγοράς" title={c.prota_katalavaineis_meta_agorazeis} link={{ label: "Όλοι οι οδηγοί →", href: "/odigoi" }} />
        <div className="grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-[1.4fr_1fr_1fr] gap-4">
          <Link href={`/odigoi/${lead.slug}`} className="relative overflow-hidden rounded-lg min-h-[260px] @lg:min-h-[340px] @md:col-span-2 @lg:col-span-1 group">
            {lead.image && <Image src={lead.image} alt="" fill sizes="(max-width: 1024px) 100vw, 560px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" unoptimized={lead.image.startsWith("http")} />}
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(18,42,88,.94)_8%,rgba(18,42,88,.15)_78%)]" />
            <div className="relative flex flex-col justify-end p-5 text-white h-full min-h-[260px] @lg:min-h-[340px]">
              <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide mb-2">
                {lead.kicker} · {lead.minutes}′
              </div>
              <h3 className="m-0 font-heading font-bold text-[length:var(--fs-23)] leading-[1.18] tracking-[-0.015em] mb-2">{lead.title}</h3>
              <p className="m-0 text-eu-on-dark text-[length:var(--fs-15)] leading-[1.5] mb-3">{lead.excerpt}</p>
              <span className="font-extrabold text-eu-yellow text-[length:var(--fs-14)]">{lead.cta}</span>
            </div>
          </Link>
          {rest.map((g) => (
            <Link key={g.slug} href={`/odigoi/${g.slug}`} className="border border-eu-line rounded-lg overflow-hidden flex flex-col group hover:border-eu-blue">
              <div className="relative h-[112px] @lg:h-[140px] bg-eu-placeholder">
                {g.image ? (
                  <Image src={g.image} alt="" fill sizes="(max-width: 768px) 100vw, 320px" className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-eu-placeholder-ink font-semibold text-[length:var(--fs-13-5)]">{c.eikona_arthroy}</div>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className={`font-extrabold text-[length:var(--fs-13)] tracking-wide mb-2 ${TONE[g.tone]}`}>
                  {g.kicker} · {g.minutes}′
                </div>
                <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-[1.22] mb-2 group-hover:text-eu-blue">{g.title}</h3>
                <p className="m-0 text-eu-muted text-[length:var(--fs-14)] leading-[1.5]">{g.excerpt}</p>
                <span className="font-extrabold text-eu-blue text-[length:var(--fs-14)] mt-auto pt-3">{g.cta}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
