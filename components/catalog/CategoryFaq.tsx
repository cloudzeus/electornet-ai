import { jsonLd } from "@/lib/security/json-ld";
/** SEO/FAQ accordion under every listing (FAQPage JSON-LD). */
export function CategoryFaq({ name }: { name: string }) {
  const qa = [
    { q: `Πόσες άτοκες δόσεις έχουν τα προϊόντα «${name}»;`, a: "Έως 24 άτοκες δόσεις με πιστωτική κάρτα ανάλογα με το ποσό, ή δόσεις χωρίς κάρτα μέσω Eurobank για αγορές 200–2.000 €." },
    { q: "Μπορώ να παραλάβω από κατάστημα;", a: "Ναι, από οποιοδήποτε από τα 350 καταστήματα Euronics. Όταν το προϊόν υπάρχει στο κατάστημα είναι έτοιμο σε 2 ώρες." },
    { q: "Τι σημαίνει η «χαμηλότερη τιμή 30 ημερών»;", a: "Είναι η χαμηλότερη τιμή που είχε το προϊόν τις 30 ημέρες πριν την έκπτωση, όπως απαιτεί η Οδηγία Omnibus — για να ξέρεις ότι η έκπτωση είναι πραγματική." },
    { q: "Περιλαμβάνεται εγκατάσταση;", a: "Για κλιματιστικά, λευκές συσκευές και τηλεοράσεις σε τοίχο επιλέγεις την εγκατάσταση ως υπηρεσία στο καλάθι· ο τεχνικός του καταστήματος κλείνει ραντεβού εντός 24 ωρών." },
  ];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return (
    <section className="mt-10 border-t border-eu-line pt-6" aria-labelledby="cat-faq">
      <h2 id="cat-faq" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-3">
        Συχνές ερωτήσεις · {name}
      </h2>
      <div className="grid gap-2">
        {qa.map((x) => (
          <details key={x.q} className="group rounded-lg border border-eu-line bg-white px-4">
            <summary className="cursor-pointer list-none flex justify-between items-center py-3 font-bold text-eu-ink text-[length:var(--fs-15)] min-h-11">
              {x.q}
              <span className="text-eu-blue transition-transform group-open:rotate-45 text-[length:var(--fs-19)] leading-none" aria-hidden>
                +
              </span>
            </summary>
            <p className="m-0 pb-3 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">{x.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </section>
  );
}
