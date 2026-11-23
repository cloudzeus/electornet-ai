import type { Metadata } from "next";
import { ORG, SITE } from "./product";

/**
 * Τα meta που ισχύουν σε ΟΛΕΣ τις σελίδες και οι τίτλοι / περιγραφές των σελίδων-λιστών (κατηγορία, μάρκα).
 *
 * Πώς φτάνουν σε κάθε σελίδα χωρίς να τα δηλώνει η ίδια (Next: lib/metadata/metadata-resolution-primitives):
 * - `alternates.canonical: "./"` και `openGraph.url: "./"` λύνονται ως προς τη διαδρομή του αιτήματος → κάθε σελίδα
 *   παίρνει canonical και og:url τη δική της διεύθυνση, χωρίς παραμέτρους (φίλτρα, ταξινόμηση, utm).
 * - og:title / og:description / twitter:* συμπληρώνονται από τον τίτλο και την περιγραφή της σελίδας.
 * Σελίδα που δηλώνει δικό της `openGraph` (προϊόν, νέα) το αντικαθιστά ολόκληρο: πρέπει να ξαναδώσει siteName / locale.
 */
export const SITE_NAME = "Euronics";
export const DEFAULT_TITLE = "Euronics | Ηλεκτρικές συσκευές, τηλεοράσεις, κλιματιστικά";
export const DEFAULT_DESCRIPTION = "Ηλεκτρικές συσκευές, τηλεοράσεις, κλιματιστικά, υπολογιστές και μικροσυσκευές στη Euronics. Προσφορές, δόσεις χωρίς κάρτα, παράδοση ή παραλαβή από κατάστημα.";
/** Εικόνα κοινοποίησης για όσες σελίδες δεν έχουν δική τους (1200 × 630, public/design/og-default.png). */
export const OG_IMAGE = { url: "/design/og-default.png", width: 1200, height: 630, alt: "Euronics — ηλεκτρικές συσκευές και τεχνολογία" };

export const BASE_SEO: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: DEFAULT_TITLE, template: "%s · euronics" },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "./" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "el_GR", url: "./", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
};

/** Όριο τίτλου πριν από το « · euronics»: η Google δείχνει περίπου 60 χαρακτήρες συνολικά. */
const TITLE_MAX = 49;
const cap = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/**
 * Κατηγορία: «<Κατηγορία> – τιμές & προσφορές», με τη γονική μόνο όταν χωράει και διαφέρει. Το δέντρο του SoftOne έχει
 * συχνά ίδιο όνομα σε δύο επίπεδα («Ιονιστές · Ιονιστές · Κλιματισμός»): τα ίδια διαδοχικά ονόματα μετρούν μία φορά.
 */
export function categoryMeta(path: { name: string; slug: string }[]): Metadata {
  const names = path.map((p) => p.name.trim()).filter((n, i, a) => n && n.toLowerCase() !== a[i - 1]?.toLowerCase());
  const leaf = names[names.length - 1] ?? "", parent = names.length > 1 ? names[names.length - 2] : null;
  const full = `${leaf} – τιμές & προσφορές`, withParent = parent ? `${full} · ${parent}` : full;
  return {
    title: withParent.length <= TITLE_MAX ? withParent : full.length <= TITLE_MAX ? full : cap(leaf, TITLE_MAX),
    description: cap(`${leaf}${parent ? ` (${parent})` : ""} στη Euronics: τιμές, προσφορές και διαθεσιμότητα. Δόσεις χωρίς κάρτα, παράδοση στο σπίτι ή παραλαβή από κατάστημα.`, 160),
    alternates: { canonical: `/k/${path.map((p) => p.slug).join("/")}` },
  };
}

/** Μάρκα χωρίς δική της σελίδα-κατάστημα: «<Μάρκα> – συσκευές, τιμές & προσφορές». */
export function brandMeta(name: string): Metadata {
  const full = `${name} – συσκευές, τιμές & προσφορές`;
  return {
    title: full.length <= TITLE_MAX ? full : cap(`${name} – τιμές & προσφορές`, TITLE_MAX),
    description: cap(`Προϊόντα ${name} στη Euronics: τιμές, προσφορές και διαθεσιμότητα, με εργοστασιακή εγγύηση. Δόσεις χωρίς κάρτα, παράδοση στο σπίτι ή παραλαβή από κατάστημα.`, 160),
  };
}

/** Πληροφοριακή σελίδα (όροι, απόρρητο, αποστολή…): χωρίς εισαγωγή στο CMS η περιγραφή δεν μένει κενή. */
export function infoMeta(p: { title: string; intro?: string | null }): Metadata {
  return { title: p.title, description: cap(p.intro?.trim() || `${p.title}: τι ισχύει για τις αγορές σου από τη Euronics, στο euronics.gr και στα καταστήματα.`, 160) };
}

/** Αρχική: η επιχείρηση και το site, ώστε η Google να δείχνει σωστό όνομα, λογότυπο και στοιχεία επικοινωνίας. */
export function homeJsonLd(sameAs: string[] = []) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...ORG, legalName: "MEGA ELECTRICS ΑΕΒΕ", email: "info@euronics.gr", address: { "@type": "PostalAddress", streetAddress: "Δαμάσκου Σταμάτη 12", addressLocality: "Αχαρνές", postalCode: "136 71", addressCountry: "GR" }, contactPoint: { "@type": "ContactPoint", telephone: ORG.telephone, contactType: "customer service", areaServed: "GR", availableLanguage: "el" }, ...(sameAs.length ? { sameAs } : {}) },
      { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: SITE_NAME, alternateName: "euronics.gr", inLanguage: "el-GR", publisher: { "@id": ORG["@id"] } },
    ],
  };
}
