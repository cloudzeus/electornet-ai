import { MessageCircleQuestion } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { AskAris } from "@/components/advisor/AskAris";
import { answersFor, geoSummary } from "@/lib/seo/product";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("answers");

/**
 * AEO block: «Γρήγορες απαντήσεις». Five questions in the customer's
 * words with 40–70-word answers, visible on the page and mirrored in the
 * FAQPage JSON-LD. The GEO summary line above it is the sentence a
 * generative engine can quote with the source.
 */
export function Answers({ product: p }: { product: Product }) {
  const qas = answersFor(p);
  return (
    <section id="answers" className="scroll-mt-24" aria-labelledby="answers-title">
      <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">{c.grigores_apantiseis}</div>
      <h2 id="answers-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-2">
        {c.o_ti_tha_rotoyses}
      </h2>
      <p id="geo-summary" className="m-0 mb-3 rounded-xl bg-eu-chip text-eu-ink px-4 py-3 text-[length:var(--fs-16)] leading-relaxed max-w-[80ch]">
        {geoSummary(p)}
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <span className="text-eu-muted text-[length:var(--fs-14)] font-semibold mr-1">{c.rota_ton_ari}</span>
        {["Χωράει στον χώρο μου;", "Πόσο ρεύμα καίει;", "Τι διαφορά έχει από το επόμενο μοντέλο;"].map((q) => (
          <AskAris key={q} q={q} tone="light" />
        ))}
      </div>
      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
        {qas.map((x, i) => (
          <details key={x.q} open={i < 2} className="group rounded-xl border border-eu-line bg-white">
            <summary className="cursor-pointer list-none flex items-start gap-3 p-4 font-bold text-eu-ink text-[length:var(--fs-16)] leading-snug min-h-12">
              <MessageCircleQuestion className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden />
              <span className="flex-1">{x.q}</span>
              <span className="text-eu-blue group-open:rotate-45 transition-transform text-[length:var(--fs-22)] leading-none">+</span>
            </summary>
            <p className="m-0 px-4 pb-4 pl-12 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
