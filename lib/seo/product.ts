import type { Metadata } from "next";
import type { Product } from "@/lib/data/types";
import { attributesOf } from "@/lib/data/attributes";
import { instalment, priceLong, weekday } from "@/lib/format";

/**
 * SEO · AEO · GEO per product.
 *  SEO — title/description/canonical/OG/Twitter, Product+Offer JSON-LD with
 *        Omnibus, shipping and return policy, BreadcrumbList.
 *  AEO — «Γρήγορες απαντήσεις»: five plain-language Q&As (40–70 words)
 *        rendered on the page AND emitted as FAQPage, the format answer
 *        engines (Google AI Overviews, Bing Copilot) lift verbatim.
 *  GEO — a one-sentence entity summary (brand, model, 3 attributes,
 *        price, availability, seller) marked `speakable`, so generative
 *        engines (ChatGPT, Perplexity, Gemini) cite the page as source.
 * Everything is derived from the product record — nothing is hand-written
 * per SKU, so it scales to the ERP catalogue.
 */
export const SITE = "https://www.euronics.gr";
export interface Crumb {
  label: string;
  href?: string;
}
export interface QA {
  q: string;
  a: string;
}

const availText = (p: Product) => {
  const a = p.availability;
  if (a.kind === "in-stock") return `άμεσα διαθέσιμο, με παράδοση ${weekday(new Date(a.deliveryDate))}`;
  if (a.kind === "days") return `διαθέσιμο σε ${a.min}–${a.max} εργάσιμες (${weekday(new Date(a.deliveryDate))})`;
  return "διαθέσιμο κατόπιν παραγγελίας σε 5–10 εργάσιμες";
};
const topAttrs = (p: Product, n = 4) => attributesOf(p).filter((a) => !["Μάρκα", "Χρώμα", "Κατάσταση"].includes(a.key)).slice(0, n);
const name = (p: Product) => `${p.brand} ${p.title}`;
/** Lower-case only the first letter, so abbreviations like BTU / RAM / Wi-Fi keep their case. */
const lc = (k: string) => k.charAt(0).toLowerCase() + k.slice(1);

/** GEO: one citable sentence with the entities a generative engine needs. */
export function geoSummary(p: Product) {
  const attrs = topAttrs(p, 3).map((a) => `${lc(a.key)} ${a.value}`);
  if (p.noPrice) return `${name(p)}${attrs.length ? ` με ${attrs.join(", ")}` : ""}. Τιμή και διαθεσιμότητα στο κατάστημα Euronics της περιοχής σου, με επίσημη εγγύηση και παραλαβή από 350 καταστήματα.`;
  return `${name(p)}${attrs.length ? ` με ${attrs.join(", ")}` : ""}, ${priceLong(p.price)}${p.wasPrice ? ` (από ${priceLong(p.wasPrice)})` : ""}, ${availText(p)} από τη Euronics, με εγγύηση 2 ετών και παραλαβή από 350 καταστήματα.`;
}

/** AEO: the questions people (and answer engines) actually ask about a product. */
export function answersFor(p: Product): QA[] {
  const attrs = topAttrs(p, 6);
  const hl = (p.highlights ?? []).slice(0, 3);
  const n = name(p);
  return [
    {
      q: `Για ποιον είναι το ${n};`,
      a: hl.length ? `Το ${n} ταιριάζει σε όσους ζητούν ${hl.map((h) => h.replace(/\.$/, "").toLowerCase()).join(", ")}. ${attrs.length ? `Ξεχωρίζει για ${attrs.slice(0, 3).map((a) => `${lc(a.key)} ${a.value}`).join(", ")}.` : ""}` : `Το ${n} απευθύνεται σε όσους θέλουν ${attrs.slice(0, 3).map((a) => `${lc(a.key)} ${a.value}`).join(", ")}${p.rating ? `, με αξιολόγηση ${p.rating.value.toLocaleString("el-GR")}/5 από ${p.rating.count} αγοραστές` : ""}.`,
    },
    {
      q: `Πόσο κοστίζει το ${p.title} και με ποιες δόσεις;`,
      a: p.noPrice ? `Η τιμή του ${p.title} δίνεται από το κατάστημα Euronics της περιοχής σου, όπου θα βρεις και τις τρέχουσες προσφορές. Πληρώνεται σε δόσεις χωρίς κάρτα ή έως 24 άτοκες δόσεις με κάρτα.` : `Κοστίζει ${priceLong(p.price)} με ΦΠΑ 24%${p.wasPrice ? ` (προηγούμενη τιμή ${priceLong(p.wasPrice)})` : ""}${p.lowest30 ? `, χαμηλότερη τιμή 30 ημερών ${priceLong(p.lowest30)}` : ""}. Πληρώνεται σε 12 δόσεις των ${priceLong(instalment(p.price))} χωρίς κάρτα (Eurobank) ή έως 24 άτοκες δόσεις με κάρτα, ${priceLong(instalment(p.price, 24))} τον μήνα.`,
    },
    {
      q: `Πότε και πώς παραδίδεται το ${p.title};`,
      a: p.noPrice ? `Η διαθεσιμότητα επιβεβαιώνεται από το κατάστημα Euronics της περιοχής σου, που αναλαμβάνει παράδοση στη διεύθυνσή σου, εγκατάσταση όπου χρειάζεται και παραλαβή της παλιάς συσκευής για ανακύκλωση.` : `Είναι ${availText(p)}. Παράδοση στη διεύθυνσή σου ${p.price >= 100 ? "δωρεάν" : "με 4,90 €"} σε 1–3 εργάσιμες, ή δωρεάν παραλαβή από κατάστημα Euronics σε 2 ώρες όπου υπάρχει απόθεμα${p.storeStock ? ` (${p.storeStock} καταστήματα σήμερα)` : ""}.${p.installation ? " Διατίθεται παράδοση με ραντεβού και εγκατάσταση από τεχνικό του καταστήματος, από 60 €." : ""}`,
    },
    {
      q: `Ποια εγγύηση και ποια πολιτική επιστροφής έχει;`,
      a: `Επίσημη εγγύηση αντιπροσωπείας 2 ετών, με δυνατότητα επέκτασης έως 5 έτη από 19 €. Μπορείς να το επιστρέψεις μέσα σε 14 ημέρες χωρίς αιτιολογία, δωρεάν, σε οποιοδήποτε από τα 350 καταστήματα Euronics. Service με γνήσια ανταλλακτικά${p.isRenew ? ". Ως προϊόν Renew, είναι ελεγμένο και ανακατασκευασμένο με εγγύηση Euronics" : ""}.`,
    },
    {
      q: `Ποια είναι τα βασικά τεχνικά χαρακτηριστικά;`,
      a: attrs.length ? `${attrs.map((a) => `${a.key}: ${a.value}`).join(" · ")}${p.energy ? ` · Ενεργειακή ετικέτα ΕΕ κλάσης ${p.energy.cls}` : ""}. Κωδικός ${p.sku}${p.ean ? `, EAN ${p.ean}` : ""}.` : `Κωδικός ${p.sku}${p.ean ? `, EAN ${p.ean}` : ""}. Τα πλήρη χαρακτηριστικά βρίσκονται στην ενότητα «Χαρακτηριστικά».`,
    },
  ];
}

export function productMetadata(p: Product, crumbs: Crumb[]): Metadata {
  const url = `${SITE}/proion/${p.slug}`;
  const title = p.noPrice ? name(p) : `${name(p)} – ${priceLong(p.price)}`;
  const description = geoSummary(p).slice(0, 158);
  const images = (p.images?.length ? p.images : p.image ? [p.image] : []).map((i) => (i.startsWith("http") ? i : `${SITE}${i}`));
  return {
    title,
    description,
    keywords: [p.brand, p.title, p.sku, ...(p.ean ? [p.ean] : []), ...crumbs.filter((c) => c.href).map((c) => c.label), "Euronics", "δόσεις χωρίς κάρτα"],
    alternates: { canonical: url, languages: { "el-GR": url } },
    robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: { title, description, url, siteName: "Euronics", locale: "el_GR", images: images.slice(0, 1).map((i) => ({ url: i, alt: name(p) })) },
    twitter: { card: "summary_large_image", title, description, images: images.slice(0, 1) },
    other: { ...(p.noPrice ? {} : { "product:price:amount": String(p.price), "product:price:currency": "EUR" }), "product:availability": p.availability.kind === "order" ? "preorder" : "instock", "product:retailer_item_id": p.sku, "product:brand": p.brand },
  };
}

export function productJsonLd(p: Product, crumbs: Crumb[]) {
  const url = `${SITE}/proion/${p.slug}`;
  const images = (p.images?.length ? p.images : p.image ? [p.image] : []).map((i) => (i.startsWith("http") ? i : `${SITE}${i}`));
  const a = p.availability;
  const priceValidUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const org = { "@type": "Organization", "@id": `${SITE}/#org`, name: "Euronics", url: SITE, logo: `${SITE}/design/logo-on-blue.svg`, telephone: "+302104835143" };
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: name(p),
        sku: p.sku,
        ...(p.ean ? { gtin13: p.ean } : {}),
        mpn: p.title.split(" ")[0],
        brand: { "@type": "Brand", name: p.brand },
        image: images,
        description: geoSummary(p),
        category: crumbs.filter((c) => c.href).map((c) => c.label).join(" > "),
        url,
        ...(p.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.value, reviewCount: p.rating.count, bestRating: 5 } } : {}),
        additionalProperty: attributesOf(p).map((x) => ({ "@type": "PropertyValue", name: x.key, value: x.value })),
        ...(p.energy ? { hasEnergyConsumptionDetails: { "@type": "EnergyConsumptionDetails", hasEnergyEfficiencyCategory: `https://schema.org/EUEnergyEfficiencyCategory${p.energy.cls.replace(/\+/g, "Plus")}` } } : {}),
        // Χωρίς τιμή δεν δηλώνεται προσφορά: «0 €» στα δομημένα δεδομένα είναι ψευδής τιμή για τη Google
        ...(p.noPrice ? {} : { offers: {
          "@type": "Offer",
          url,
          price: p.price,
          priceCurrency: "EUR",
          priceValidUntil,
          availability: a.kind === "order" ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
          itemCondition: p.isRenew ? "https://schema.org/RefurbishedCondition" : "https://schema.org/NewCondition",
          seller: { "@id": `${SITE}/#org` },
          ...(p.lowest30 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: p.lowest30, priceCurrency: "EUR", priceType: "https://schema.org/StrikethroughPrice", name: "Χαμηλότερη τιμή 30 ημερών (Omnibus)" } } : {}),
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: { "@type": "MonetaryAmount", value: p.price >= 100 ? 0 : 4.9, currency: "EUR" },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "GR" },
            deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: a.kind === "order" ? 10 : 3, unitCode: "DAY" } },
          },
          hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "GR", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 14, returnMethod: ["https://schema.org/ReturnInStore", "https://schema.org/ReturnByMail"], returnFees: "https://schema.org/FreeReturn" },
        } }),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [{ label: "Αρχική", href: "/" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...(c.href ? { item: `${SITE}${c.href}` } : {}) })),
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: answersFor(p).map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
      },
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: name(p),
        inLanguage: "el-GR",
        isPartOf: { "@type": "WebSite", url: SITE, name: "Euronics" },
        primaryImageOfPage: images[0],
        speakable: { "@type": "SpeakableSpecification", cssSelector: ["#geo-summary", "#answers"] },
        mainEntity: { "@id": `${url}#product` },
      },
    ],
  };
}

/** What the demo panel shows the client: the exact signals emitted for this SKU. */
export function seoAudit(p: Product, crumbs: Crumb[]) {
  const m = productMetadata(p, crumbs);
  const ld = productJsonLd(p, crumbs);
  return {
    title: String(m.title),
    description: String(m.description),
    canonical: `${SITE}/proion/${p.slug}`,
    ogImage: (m.openGraph?.images as { url: string }[] | undefined)?.[0]?.url ?? "—",
    types: (ld["@graph"] as { "@type": string }[]).map((x) => x["@type"]),
    properties: attributesOf(p).length,
    answers: answersFor(p).length,
    speakable: ["#geo-summary", "#answers"],
    omnibus: !!p.lowest30,
    energy: p.energy?.cls ?? null,
  };
}
