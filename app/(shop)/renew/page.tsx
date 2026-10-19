import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { listProducts } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Euronics Renew — refurbished", description: "Ανακατασκευασμένες συσκευές με έλεγχο 60 σημείων, μπαταρία ≥85% και 2 έτη εγγύηση." };

/** Renew as a first-class category (today it is a search for «Refurbished» and a blog post). */
export default async function RenewPage() {
  const result = await listProducts({ renew: true, perPage: 48 });
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Euronics Renew" }]} />
      <section className="relative bg-eu-navy text-white overflow-hidden">
        <Image src="/img/hero-renew.jpg" alt="" fill className="object-cover opacity-40" sizes="100vw" />
        <div className="relative eu-canvas eu-gutter py-10 @lg:py-14 max-w-[40em]">
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide mb-2">Euronics Renew</div>
          <h1 className="m-0 font-heading font-bold text-[length:var(--fs-38)] leading-[1.05] tracking-[-0.02em] mb-3">Refurbished με 2 χρόνια εγγύηση</h1>
          <p className="m-0 text-eu-on-dark text-[length:var(--fs-16)] leading-relaxed">Έλεγχος 60 σημείων, μπαταρία τουλάχιστον 85%, σαφής βαθμολόγηση Grade A/B και δικαίωμα υπαναχώρησης 14 ημερών — όπως στο καινούργιο.</p>
          <Link href="/odigoi/ti-einai-to-renew" className="inline-flex mt-4 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 py-3 min-h-11 items-center hover:bg-eu-yellow-dark">
            Τι σημαίνει Grade A και B
          </Link>
        </div>
      </section>
      <div className="eu-canvas eu-gutter py-8">
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 mb-8">
          {[
            ["Grade A", "Ελάχιστα ή καθόλου σημάδια χρήσης. Πλήρης λειτουργία, μπαταρία ≥ 85%."],
            ["Grade B", "Εμφανή αλλά επιφανειακά σημάδια. Πλήρης λειτουργία, μπαταρία ≥ 85%."],
            ["Εγγύηση 2 έτη", "Ίδια με το καινούργιο, από το δίκτυο service της Euronics."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-lg bg-eu-surface p-4">
              <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] mb-1">{t}</div>
              <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">{b}</p>
            </div>
          ))}
        </div>
        <ProductGrid products={result.items} />
      </div>
    </div>
  );
}
