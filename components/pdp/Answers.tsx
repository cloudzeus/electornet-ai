import { Bot, MessageCircleQuestion, Search, Sparkles } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { AskAris } from "@/components/advisor/AskAris";
import { answersFor, geoSummary, seoAudit, type Crumb } from "@/lib/seo/product";
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

/** Demo-only panel for the client: the SEO · AEO · GEO signals this SKU emits. Collapsed by default. */
export function SeoPanel({ product: p, crumbs }: { product: Product; crumbs: Crumb[] }) {
  const s = seoAudit(p, crumbs);
  const cols: { icon: typeof Search; t: string; rows: [string, string][] }[] = [
    { icon: Search, t: "SEO", rows: [["Title", s.title], ["Meta description", s.description], ["Canonical", s.canonical], ["OG image", s.ogImage.replace("https://www.euronics.gr", "")], ["JSON-LD", s.types.join(" · ")], ["Omnibus 30 ημερών", s.omnibus ? "priceSpecification ✓" : "—"], ["Ενεργειακή ετικέτα", s.energy ? `EUEnergyEfficiencyCategory ${s.energy}` : "—"]] },
    { icon: MessageCircleQuestion, t: "AEO", rows: [["FAQPage", `${s.answers} ερωτήσεις με απαντήσεις 40–70 λέξεων`], ["Ορατές στη σελίδα", "ναι — ίδιο κείμενο με το JSON-LD"], ["Χαρακτηριστικά", `${s.properties} PropertyValue`], ["Παράδοση / επιστροφή", "OfferShippingDetails · MerchantReturnPolicy 14 ημ."]] },
    { icon: Bot, t: "GEO", rows: [["Σύνοψη οντότητας", "1 πρόταση: μάρκα, μοντέλο, 3 χαρακτηριστικά, τιμή, διαθεσιμότητα, πωλητής"], ["Speakable", s.speakable.join(", ")], ["Οντότητες", "Organization · Brand · Product · Offer συνδεδεμένα με @id"], ["Ανανέωση", "priceValidUntil 30 ημέρες, ημερομηνίες παράδοσης live"]] },
  ];
  return (
    <details className="rounded-2xl bg-eu-navy text-white overflow-hidden group">
      <summary className="cursor-pointer list-none flex items-center gap-3 px-5 py-4 min-h-14">
        <Sparkles className="size-5 text-eu-yellow shrink-0" aria-hidden />
        <span className="flex-1 font-extrabold text-[length:var(--fs-16)]">
          {c.seo_aeo_geo_gia} <span className="font-normal text-eu-on-dark text-[length:var(--fs-14)]">{c.ti_ekpempei_i_selida}</span>
        </span>
        <span className="text-eu-yellow group-open:rotate-45 transition-transform text-[length:var(--fs-22)] leading-none">+</span>
      </summary>
      <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-4 px-5 pb-5">
        {cols.map((c) => (
          <div key={c.t} className="rounded-xl bg-white/[.06] border border-white/10 p-4">
            <div className="flex items-center gap-2 font-extrabold text-eu-yellow text-[length:var(--fs-15)] mb-3">
              <c.icon className="size-4" aria-hidden /> {c.t}
            </div>
            <dl className="m-0 grid gap-2">
              {c.rows.map(([k, v]) => (
                <div key={k} className="text-[length:var(--fs-14)]">
                  <dt className="text-eu-on-dark-2">{k}</dt>
                  <dd className="m-0 text-white break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}
