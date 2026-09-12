import Link from "next/link";
import type { Service } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { SectionHead } from "./SectionHead";
import { CountUp } from "@/components/motion/CountUp";
import { Spotlight } from "@/components/motion/Spotlight";
import { getSettings } from "@/lib/cms/settings";

/**
 * Zone 9 — twelve services, each with a price, as a numbered list on
 * deep blue. The colour stops the scroll; the absence of images puts the
 * weight on *what you gain and what it costs*.
 */
export async function ServicesBand({ services, zoneNo }: { services: Service[]; zoneNo?: number }) {
  const { site } = await getSettings();
  return (
    <section className="relative bg-eu-navy text-white eu-container overflow-hidden isolate" aria-labelledby="services-title">
      <span className="eu-ambient" aria-hidden />
      <Spotlight />
      <ZoneBadge no={zoneNo} />
      <div className="relative eu-canvas eu-gutter pt-8 @lg:pt-[38px] pb-8">
        <dl className="m-0 grid grid-cols-2 @lg:grid-cols-4 gap-x-6 gap-y-5 mb-8 @lg:mb-10 border-b border-eu-navy-line pb-6 @lg:pb-8">
          {site.facts.map((f) => ({ v: f.value, s: f.suffix, l: f.label })).map((x) => (
            <div key={x.l} data-reveal className="min-w-0">
              <dt className="m-0 font-heading font-extrabold text-eu-yellow text-[length:var(--fs-50)] @lg:text-[length:var(--fs-66)] leading-none tracking-[-0.04em]">
                <CountUp value={x.v} suffix={x.s} />
              </dt>
              <dd className="m-0 mt-2 text-eu-on-dark-2 text-[length:var(--fs-15)] leading-snug">{x.l}</dd>
            </div>
          ))}
        </dl>
        <SectionHead id="services-title" tone="dark" kicker="Υπηρεσίες Euronics" title={["Πριν, κατά και μετά την αγορά,", "είμαστε δίπλα σου"]} link={{ label: "Όλες οι υπηρεσίες →", href: "/ypiresies" }} />
        <ul className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-px bg-eu-navy-line border border-eu-navy-line rounded-lg overflow-hidden m-0 p-0 list-none">
          {services.map((s) => (
            <li key={s.slug} data-reveal className="bg-eu-navy">
              <Link href={`/ypiresies/${s.slug}`} className="group flex gap-3.5 p-4 @md:p-[18px_20px] h-full hover:bg-eu-navy-2 transition-colors">
                <span className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] w-[22px] shrink-0 pt-0.5 transition-transform group-hover:-translate-y-0.5">{s.no}</span>
                <div>
                  <div className="font-bold text-[length:var(--fs-16)] leading-[1.25]">{s.title}</div>
                  <div className="text-eu-on-dark-2 text-[length:var(--fs-14)] leading-[1.5] mt-1.5">{s.blurb}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
