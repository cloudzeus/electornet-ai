import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { GiftCardBuilder } from "@/components/commerce/GiftCardBuilder";

export const metadata: Metadata = { title: "Κάρτες δώρου", description: "Ψηφιακή ή φυσική κάρτα δώρου Euronics 20–500 €, εξαργύρωση online και στα καταστήματα Euronics." };

export default function GiftCardPage() {
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Κάρτες δώρου" }]} />
      <PageIntro tone="dark" kicker="Υπηρεσία 12" title="Κάρτα δώρου Euronics" lead="Από 20 έως 500 €. Ψηφιακή με email ή SMS σε λίγα λεπτά, ή φυσική σε κατάστημα. Εξαργύρωση online και στα καταστήματα Euronics, ισχύς 2 έτη." />
      <div className="eu-canvas eu-gutter py-8">
        <GiftCardBuilder />
      </div>
    </div>
  );
}
