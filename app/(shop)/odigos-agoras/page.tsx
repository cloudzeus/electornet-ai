import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { ArrowRight, Sparkles, ListChecks, Scale, MessageSquareText } from "lucide-react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { GUIDES } from "@/lib/guides/smart";

export const metadata: Metadata = { title: "Έξυπνος οδηγός αγοράς", description: "Απάντησε σε 5–6 ερωτήσεις και πάρε αιτιολογημένη πρόταση για τηλεόραση, υπολογιστή ή κλιματιστικό." };

/** Hub of the smart buying guides. Three today; the definitions in lib/guides/smart add more without new UI. */
export default function SmartGuidesHub() {
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Έξυπνος οδηγός αγοράς" }]} />
      <PageIntro tone="dark" kicker="Έξυπνος οδηγός αγοράς" title="Πες μας πώς θα το χρησιμοποιείς. Θα σου πούμε ποιο και γιατί." lead="Πέντε-έξι ερωτήσεις με απλά λόγια — απόσταση, τετραγωνικά, χρήση, προϋπολογισμός. Ο οδηγός μετρά τα πραγματικά χαρακτηριστικά κάθε μοντέλου και εξηγεί την πρότασή του." />
      <div className="eu-canvas eu-gutter py-8 grid gap-8">
        <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-3 gap-4">
          {Object.values(GUIDES).map((g) => (
            <li key={g.kind}>
              <Link href={`/odigos-agoras/${g.kind}`} className="group block bg-white rounded-2xl border border-eu-line overflow-hidden hover:shadow-[var(--shadow-raised)] transition-shadow h-full">
                <div className="relative aspect-[16/10]">
                  <Image src={g.image} alt="" fill sizes="400px" className="object-cover" />
                  <span className="absolute top-3 left-3 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 py-1 inline-flex items-center gap-1">
                    <Sparkles className="size-3.5" aria-hidden /> {g.questions.length} ερωτήσεις
                  </span>
                </div>
                <div className="p-5">
                  <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-21)] leading-tight group-hover:text-eu-blue">{g.title}</h2>
                  <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-15)] leading-relaxed">{g.intro}</p>
                  <span className="inline-flex items-center gap-1 mt-4 font-extrabold text-eu-blue text-[length:var(--fs-15)]">
                    Ξεκίνα <ArrowRight className="size-4" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-4">
          {[
            { icon: ListChecks, t: "Μετράει, δεν μαντεύει", s: "Διαγώνιος από την απόσταση, BTU από τα τετραγωνικά και τον ήλιο, RAM από τη χρήση. Κάθε κριτήριο έχει βάρος." },
            { icon: MessageSquareText, t: "Αιτιολογεί την πρόταση", s: "«Οι 55\" είναι σωστές για 2,5–3 m», «12.000 BTU για 25 m² με νότιο προσανατολισμό». Και τι να έχεις υπόψη." },
            { icon: Scale, t: "Συνεχίζεις όπως θες", s: "Σύγκριση των 3 προτάσεων, λίστα με τα φίλτρα του οδηγού, ή αγορά με 1 κλικ." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl bg-eu-surface p-5 flex gap-3">
              <x.icon className="size-7 text-eu-blue shrink-0" aria-hidden />
              <div>
                <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">{x.t}</div>
                <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)] leading-relaxed">{x.s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
