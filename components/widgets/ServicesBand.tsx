import Link from "next/link";
import type { Service } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { SectionHead } from "./SectionHead";
import { CountUp } from "@/components/motion/CountUp";
import { Spotlight } from "@/components/motion/Spotlight";
import type { HomeFact } from "@/lib/cms/home-sections";

/**
 * Zone 9 — twelve services, each with a price, as a numbered list on
 * deep blue. The colour stops the scroll; the absence of images puts the
 * weight on *what you gain and what it costs*.
 */
export function ServicesBand({ services, facts, kicker, title, link, zoneNo }: { services: Service[]; facts: HomeFact[]; kicker: string; title: string | [string, string]; link?: { label: string; href: string }; zoneNo?: number }) {
  return (
    <section className="relative bg-eu-navy text-white eu-container overflow-hidden isolate" aria-labelledby="services-title">
      <span className="eu-ambient" aria-hidden />
      <Spotlight />
      <ZoneBadge no={zoneNo} />
      <div className="relative eu-canvas eu-gutter pt-8 @lg:pt-[38px] pb-8">
        {/* οι αριθμοί παίρνουν μέγεθος από το πλάτος του χώρου (cqw), ώστε και το πιο μακρύ («24 δόσεις») να χωρά στη στήλη του */}
        {facts.length > 0 && <dl className="m-0 grid grid-cols-2 @lg:grid-cols-4 gap-x-6 gap-y-5 mb-8 @lg:mb-10 border-b border-eu-navy-line pb-6 @lg:pb-8">
          {facts.map((f) => ({ v: f.value, s: f.suffix, l: f.label })).map((x, i) => (
            <div key={i} data-reveal className="min-w-0">
              <dt className="m-0 font-heading font-extrabold text-eu-yellow text-[length:clamp(1.75rem,9cqw,3.125rem)] @lg:text-[length:clamp(1.75rem,4.6cqw,4.125rem)] leading-none tracking-[-0.04em]">
                <CountUp value={x.v} suffix={x.s} />
              </dt>
              <dd className="m-0 mt-2 text-eu-on-dark-2 text-[length:var(--fs-15)] leading-snug">{x.l}</dd>
            </div>
          ))}
        </dl>}
        <SectionHead id="services-title" tone="dark" kicker={kicker} title={title} link={link} />
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
