import Image from "@/components/ui/Image";
import type { Product } from "@/lib/data/types";
import { cutoutFor } from "@/lib/data/cutouts";
import { Spotlight } from "@/components/motion/Spotlight";
import { StarLight } from "@/components/motion/StarLight";
import { CountUp } from "@/components/motion/CountUp";
import { AskAris } from "@/components/advisor/AskAris";

// θέση/μέγεθος/καθυστέρηση των τριών cutouts — σταθερές κλάσεις αντί για style (το «!» στην καθυστέρηση: να μην τη
// μηδενίζει το shorthand `animation` της eu-float, όπως υπερίσχυε πριν το inline style)
const CUT_POS = [
  "left-[0%] top-[22%] w-[38%] [animation-delay:0s]! z-[1]",
  "left-[38%] top-[0%] w-[40%] [animation-delay:.7s]! z-[2]",
  "left-[66%] top-[30%] w-[34%] [animation-delay:1.4s]! z-[1]",
];

/**
 * @dynamic Category opener (v4): navy stage with the category numeral as a
 * giant watermark, title, live product count, the three top products as
 * floating cutouts (staggered float), and «Ρώτα τον Ερμή» chips with the
 * questions this category gets most (from the Demand Radar). Adaptive: the
 * cutouts move under the text below @lg; nothing overlaps the title.
 */
export function CategoryOpener({ kicker, title, no, count, lead, products, questions }: { kicker: string; title: string; no?: string; count: number; lead?: string; products: Product[]; questions: string[] }) {
  const cuts = products.map((p) => ({ id: p.id, src: cutoutFor(p.image), alt: `${p.brand} ${p.title}` })).filter((c) => c.src).slice(0, 3);
  return (
    <header className="relative bg-eu-navy text-white eu-container overflow-hidden isolate">
      <span className="eu-ambient" aria-hidden />
      <Spotlight />
      {no && (
        <span className="pointer-events-none absolute -left-3 -bottom-10 font-heading font-extrabold text-white/[.06] text-[length:var(--fs-150)] @lg:text-[length:var(--fs-150)] leading-none tracking-[-0.06em] select-none" aria-hidden>
          {no}
        </span>
      )}
      <div className="relative eu-canvas eu-gutter py-7 @lg:py-9 grid grid-cols-1 @lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6 items-center">
        <div className="min-w-0">
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase mb-2">{kicker}</div>
          <h1 className="m-0 font-heading font-extrabold text-[length:var(--fs-44)] @lg:text-[length:var(--fs-58)] leading-[1] tracking-[-0.035em]">{title}</h1>
          <p className="m-0 mt-3 text-eu-on-dark text-[length:var(--fs-16)] leading-relaxed max-w-[40em]">
            <span className="font-extrabold text-white tabular-nums">
              <CountUp value={count} />
            </span>{" "}
            προϊόντα{lead ? ` · ${lead}` : ""}
          </p>
          {questions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {questions.map((q) => (
                <AskAris key={q} q={q} />
              ))}
            </div>
          )}
        </div>
        {cuts.length > 0 && (
          <div className="relative h-[200px] @md:h-[240px] @lg:h-[280px] min-w-0">
            <StarLight size={48} className="right-[38%] top-[-2%] hidden @lg:block" />
            {cuts.map((c, i) => (
              <span key={c.id} className={`absolute eu-float ${CUT_POS[i]}`}>
                <span className="relative block aspect-square">
                  <Image src={c.src!} alt={c.alt} fill sizes="(max-width: 1024px) 40vw, 260px" className="object-contain eu-cutout-shadow-dark" />
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
