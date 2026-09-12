import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { GUIDES } from "@/lib/guides/smart";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("smartGuidesBand");

/**
 * Zone 11a — the smart buying guides. Three tiles on a navy band: the
 * customer states the use, the guide returns a justified pick. This is
 * the early-intent entry point that marketplaces don't have.
 */
export function SmartGuidesBand({ zoneNo }: { zoneNo?: number }) {
  return (
    <section className="relative bg-eu-navy text-white eu-container" aria-labelledby="smart-guides-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter py-8 @lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide mb-1.5 flex items-center gap-1.5">
              <Sparkles className="size-4" aria-hidden /> {c.exypnos_odigos_agoras}
            </div>
            <h2 id="smart-guides-title" className="m-0 font-heading font-bold text-[length:var(--fs-26)] leading-tight tracking-[-0.01em]">
              {c.pes_mas_pos_tha}
            </h2>
          </div>
          <Link href="/odigos-agoras" className="font-extrabold text-eu-yellow text-[length:var(--fs-15)] hover:underline">
            {c.pos_doyleyei}
          </Link>
        </div>
        <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-3 gap-4">
          {Object.values(GUIDES).map((g) => (
            <li key={g.kind}>
              <Link href={`/odigos-agoras/${g.kind}`} className="group flex @md:flex-col gap-4 rounded-2xl bg-white/[.06] border border-white/10 p-4 hover:bg-white/10 transition-colors h-full">
                <div className="relative size-24 @md:size-auto @md:aspect-[16/9] shrink-0 rounded-xl overflow-hidden">
                  <Image src={g.image} alt="" fill sizes="(max-width: 768px) 96px, 400px" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                </div>
                <div className="min-w-0">
                  <h3 className="m-0 font-bold text-[length:var(--fs-19)] leading-tight">{g.title}</h3>
                  <p className="m-0 mt-1.5 text-eu-on-dark text-[length:var(--fs-14)] leading-relaxed line-clamp-2">{g.intro}</p>
                  <span className="inline-flex items-center gap-1 mt-3 font-extrabold text-eu-yellow text-[length:var(--fs-15)]">
                    {g.questions.length} ερωτήσεις <ArrowRight className="size-4" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
