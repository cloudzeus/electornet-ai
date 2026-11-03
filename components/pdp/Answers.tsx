import type { ReactNode } from "react";
import { fitMattersFor } from "@/lib/data/dims";
import { Plus } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { AskAris } from "@/components/advisor/AskAris";
import { answersFor, geoSummary } from "@/lib/seo/product";
import { copyOf } from "@/lib/cms/copy";
import type { WarrantyInfo } from "@/lib/warranty/policy";

const c = copyOf("answers");

/**
 * «Ερωτήσεις»: η μία ενότητα ερωτήσεων της σελίδας. Πρώτα οι πέντε απαντήσεις που ξέρουμε ήδη (AEO: ίδιες με το
 * FAQPage JSON-LD, εκεί με το όνομα του προϊόντος· εδώ χωρίς, γιατί ο τίτλος είναι από πάνω), μετά οι ερωτήσεις των
 * πελατών και η φόρμα (`children`). Η πρόταση-σύνοψη GEO (`#geo-summary`, speakable) κλείνει την ενότητα ήσυχα.
 */
export function Answers({ product: p, warranty, children }: { product: Product; warranty?: WarrantyInfo; children?: ReactNode }) {
  const qas = answersFor(p, warranty);
  return (
    <section id="qa" className="scroll-mt-24" aria-labelledby="qa-title">
      <h2 id="qa-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-3">
        Ερωτήσεις
      </h2>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-eu-muted text-[length:var(--fs-14)] mr-1">{c.rota_ton_ari}</span>
        {/* «Πόσο ρεύμα καίει;» μόνο όπου υπάρχει ενεργειακή πληροφόρηση· «χωράει;» μόνο όπου ο χώρος είναι κριτήριο */}
        {[...(fitMattersFor(p) ? ["Χωράει στον χώρο μου;"] : []), ...(p.fromDb && !p.energy ? [] : ["Πόσο ρεύμα καίει;"]), "Τι διαφορά έχει από το επόμενο μοντέλο;"].map((q) => (
          <AskAris key={q} q={q} tone="light" />
        ))}
      </div>
      <div className="rounded-xl border border-eu-line divide-y divide-eu-line-2 bg-white">
        {qas.map((x, i) => (
          <details key={x.q} open={i < 2} className="group">
            <summary className="cursor-pointer list-none flex items-center gap-3 px-4 py-3 min-h-12 font-bold text-eu-ink text-[length:var(--fs-16)] leading-snug hover:bg-eu-surface transition-colors">
              <span className="flex-1">{x.label}</span>
              <Plus className="size-5 shrink-0 text-eu-blue transition-transform group-open:rotate-45" aria-hidden />
            </summary>
            <p className="m-0 px-4 pb-4 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed max-w-[75ch]">{x.a}</p>
          </details>
        ))}
      </div>
      {children}
      <p id="geo-summary" className="m-0 mt-6 text-eu-muted text-[length:var(--fs-14)] leading-relaxed max-w-[80ch]">
        {geoSummary(p, warranty)}
      </p>
    </section>
  );
}
