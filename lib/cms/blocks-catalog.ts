import type { AutoSource, BrandBlock } from "./brand-store";

/** Κατάλογος components: περιγραφές, ομάδες, προεπιλογές νέας ενότητας. Κοινό για editor (client) και βιτρίνα (server). */
/** Περιγραφή κάθε τύπου ενότητας — εμφανίζεται στην προσθήκη και πάνω από τη φόρμα της. */
export const BLOCK_INFO: Record<BrandBlock["type"], { label: string; help: string }> = {
  "new-arrivals": { label: "Νέα προϊόντα", help: "Τα 3–4 νεότερα ή πιο εντυπωσιακά προϊόντα, σε μεγάλες κάρτες." },
  series: { label: "Σειρές", help: "Οι οικογένειες προϊόντων της μάρκας (π.χ. OLED, Galaxy, Bespoke), καθεμία με εικόνα, κείμενο και σύνδεσμο." },
  offers: { label: "Προσφορές", help: "Προϊόντα σε προσφορά με αντίστροφη μέτρηση μέχρι τη λήξη." },
  story: { label: "Ιστορία", help: "Μεγάλη εικόνα με κείμενο — για μια τεχνολογία ή καμπάνια. Προαιρετικό κουμπί." },
  tech: { label: "Τεχνολογία", help: "3–4 πλακίδια με εικονίδιο: τι κάνει τη μάρκα ξεχωριστή." },
  support: { label: "Εγγύηση & υποστήριξη", help: "Στοιχεία εγγύησης/service και έτοιμες ερωτήσεις που ανοίγουν τον Ερμή." },
  video: { label: "Βίντεο", help: "Βίντεο που παίζει αθόρυβα σε επανάληψη, με λεζάντα." },
  announcement: { label: "Ανακοίνωση", help: "Λεπτή λωρίδα στο χρώμα της μάρκας, με σύνδεσμο και προαιρετική αντίστροφη μέτρηση. Ιδανική πάνω από το hero." },
  usp: { label: "Πλεονεκτήματα", help: "Λωρίδα με 2–4 σύντομα πλεονεκτήματα και εικονίδια (εγγύηση, παράδοση, δόσεις)." },
  banner: { label: "Banner", help: "Μεγάλη εικόνα με τίτλο, κείμενο και κουμπί πάνω της. Μπορεί να έχει άλλη εικόνα για κινητό." },
  "products-auto": { label: "Προϊόντα (αυτόματα)", help: "Πλέγμα προϊόντων που ενημερώνεται μόνο του από τον κατάλογο: νεότερα, σε προσφορά, κορυφαία, οικονομικά ή διαθέσιμα — όλα ή μίας κατηγορίας." },
  categories: { label: "Κατηγορίες", help: "Πλακίδια με τις κατηγορίες της μάρκας (εικόνα + πλήθος), προς τη λίστα με φίλτρο μάρκας. Αυτόματα ή όσες διαλέξεις." },
  faq: { label: "Συχνές ερωτήσεις", help: "Ερωτήσεις που ανοίγουν με ένα πάτημα. Βοηθούν και στη Google (FAQ)." },
  text: { label: "Κείμενο", help: "Τίτλος και παράγραφοι — για ιστορία της μάρκας, οδηγίες, ανακοινώσεις." },
  gallery: { label: "Gallery", help: "2–6 εικόνες σε πλέγμα ή «mosaic» με την πρώτη μεγάλη, με λεζάντες και συνδέσμους." },
  cta: { label: "Κάλεσμα σε δράση", help: "Ζώνη στο χρώμα της μάρκας με τίτλο και 1–2 κουμπιά (π.χ. «Κλείσε επίδειξη», «Βρες κατάστημα»)." },
  ad: { label: "Διαφήμιση (Προσφορές)", help: "Banner από τις «Διαφημιστικές θέσεις» των Προσφορών: όποιο είναι ενεργό στη θέση (με προτεραιότητα και ημερομηνίες) ή ένα συγκεκριμένο. Μετρά εμφανίσεις και κλικ· κρύβεται μόνο του όταν λήξει." },
  "promo-products": { label: "Προϊόντα προσφοράς", help: "Τα προϊόντα μιας προσφοράς με αντίστροφη μέτρηση μέχρι τη λήξη της. Ενημερώνεται μόνο του και κρύβεται όταν η προσφορά λήξει." },
  "promo-landing": { label: "Σελίδα προσφοράς", help: "Κάρτα προς μια landing page προσφοράς (εικόνα, τίτλος, αντίστροφη μέτρηση). Κρύβεται όταν η προσφορά λήξει." },
  coupon: { label: "Κουπόνι", help: "Κοινό κουπόνι με κουμπί αντιγραφής και την έκπτωσή του. Κρύβεται όταν λήξει ή εξαντληθεί." },
  stores: { label: "Καταστήματα", help: "Τα πιο κοντινά καταστήματα στον επισκέπτη (από την περιοχή του) ή μιας περιοχής, με τηλέφωνο και οδηγίες." },
  "deal-hero": { label: "Προσφορά ημέρας", help: "Ένα προϊόν σε μεγάλη κάρτα με αντίστροφη μέτρηση και γρήγορη αγορά — το κορυφαίο μιας προσφοράς ή ένα που διαλέγεις." },
  "promo-grid": { label: "Ενεργές προσφορές", help: "Όλες οι προσφορές που τρέχουν τώρα (με landing page), σε κάρτες με αντίστροφη μέτρηση. Ενημερώνεται μόνο του." },
  countdown: { label: "Αντίστροφη μέτρηση", help: "Μεγάλη λωρίδα «Λήγει σε…» για μια προσφορά, με κουμπί. Κρύβεται μόλις λήξει." },
  steps: { label: "Βήματα", help: "«Πώς λειτουργεί» σε 2–5 αριθμημένα βήματα — για αποστολή, επιστροφές, εγκατάσταση." },
  contact: { label: "Επικοινωνία", help: "Τηλέφωνο και email από τις Ρυθμίσεις → Γενικά (ενημερώνονται μόνα τους), ωράριο και καταστήματα." },
  newsletter: { label: "Newsletter", help: "Εγγραφή στο newsletter με το ενεργό κείμενο συγκατάθεσης — ίδια φόρμα με την αρχική." },
  guides: { label: "Οδηγοί αγοράς", help: "Κάρτες με οδηγούς αγοράς (οι πιο πρόσφατοι ή όσοι διαλέξεις)." },
  services: { label: "Υπηρεσίες", help: "Κάρτες με υπηρεσίες Euronics (εγκατάσταση, μεταφορά, επέκταση εγγύησης…) με τιμή «από»." },
  callout: { label: "Σημαντική σημείωση", help: "Πλαίσιο πληροφορίας, προσοχής ή επιβεβαίωσης — π.χ. αλλαγές ωραρίου, καθυστερήσεις, νέες υπηρεσίες." },
};
/** σειρά στο «Προσθήκη ενότητας», ομαδοποιημένα */
export const BLOCK_GROUPS: { label: string; types: BrandBlock["type"][] }[] = [
  { label: "Από τις Προσφορές", types: ["ad", "deal-hero", "promo-products", "promo-grid", "countdown", "promo-landing", "coupon"] },
  { label: "Προϊόντα", types: ["products-auto", "new-arrivals", "offers", "series", "categories"] },
  { label: "Εικόνα & βίντεο", types: ["banner", "story", "gallery", "video"] },
  { label: "Κείμενο & πληροφορίες", types: ["text", "steps", "callout", "faq", "tech", "support"] },
  { label: "Εξυπηρέτηση", types: ["contact", "stores", "services", "guides", "newsletter"] },
  { label: "Λωρίδες & κουμπιά", types: ["announcement", "usp", "cta"] },
];

export const AUTO_SOURCES: { value: AutoSource; label: string; help: string }[] = [
  { value: "newest", label: "Νεότερα", help: "Τα πιο πρόσφατα στον κατάλογο." },
  { value: "offers", label: "Σε προσφορά", help: "Με ενεργή προσφορά τιμής, μεγαλύτερη έκπτωση πρώτα." },
  { value: "top", label: "Κορυφαία", help: "Τα ακριβότερα — συνήθως οι ναυαρχίδες." },
  { value: "value", label: "Οικονομικά", help: "Από τη χαμηλότερη τιμή." },
  { value: "in-stock", label: "Διαθέσιμα τώρα", help: "Με απόθεμα στην κεντρική αποθήκη." },
];

const newId = () => `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function newBlock(type: BrandBlock["type"], brand: string): BrandBlock {
  const id = newId();
  const ends = new Date(Date.now() + 14 * 86_400_000); ends.setHours(23, 59, 0, 0);
  switch (type) {
    case "new-arrivals": return { id, type, kicker: "Νέα προϊόντα", title: "Μόλις έφτασαν", productIds: [] };
    case "series": return { id, type, kicker: "Σειρές", title: "Διάλεξε τη σειρά σου", items: [{ name: "", blurb: "", image: "", productIds: [] }] };
    case "offers": return { id, type, kicker: `Προσφορές ${brand}`, title: "Για λίγες μέρες", productIds: [], endsAt: ends.toISOString() };
    case "story": return { id, type, kicker: "", title: "", image: "", body: "", align: "right" };
    case "tech": return { id, type, kicker: "Τεχνολογία", title: `Γιατί ${brand}`, items: [{ icon: "sparkles", title: "", blurb: "" }] };
    case "support": return { id, type, facts: [`Επίσημη εγγύηση ${brand}`], askAris: [] };
    case "video": return { id, type, src: "", poster: "", caption: "" };
    case "announcement": return { id, type, zone: "top", text: `Νέα σειρά ${brand} — δες τη πρώτος στα καταστήματα Euronics`, href: "" };
    case "usp": return { id, type, zone: "top", items: [{ icon: "shield", text: `Επίσημη εγγύηση ${brand}` }, { icon: "zap", text: "Παράδοση σε 1–3 ημέρες" }, { icon: "sparkles", text: "Έως 24 άτοκες δόσεις" }] };
    case "banner": return { id, type, kicker: "", title: "", body: "", image: "", align: "left", overlay: "dark", height: "m" };
    case "products-auto": return { id, type, kicker: brand, title: "Τα νεότερα", source: "newest", limit: 8 };
    case "categories": return { id, type, kicker: "Κατηγορίες", title: `Όλος ο κόσμος της ${brand}`, mode: "auto", limit: 6 };
    case "faq": return { id, type, zone: "bottom", kicker: "Ερωτήσεις", title: "Συχνές ερωτήσεις", items: [{ q: "", a: "" }] };
    case "text": return { id, type, kicker: "", title: "", body: "", align: "left" };
    case "gallery": return { id, type, kicker: "", title: "", images: [{ src: "" }, { src: "" }, { src: "" }], layout: "grid" };
    case "ad": return { id, type, mode: "slot", slot: "info-top" };
    case "promo-products": return { id, type, promotionId: "", limit: 8, countdown: true };
    case "promo-landing": return { id, type, landingId: "" };
    case "coupon": return { id, type, code: "" };
    case "stores": return { id, type, kicker: "Καταστήματα", title: "Κοντά σου", mode: "near", limit: 3 };
    case "deal-hero": return { id, type, kicker: "Προσφορά ημέρας", title: "", source: "promotion", promotionId: "" };
    case "promo-grid": return { id, type, kicker: "Προσφορές", title: "Τρέχουν τώρα", limit: 6 };
    case "countdown": return { id, type, kicker: "Λήγει σύντομα", title: "", promotionId: "" };
    case "steps": return { id, type, kicker: "Πώς λειτουργεί", title: "Σε τρία βήματα", items: [{ title: "Παραγγέλνεις", text: "" }, { title: "Επιβεβαιώνουμε", text: "" }, { title: "Παραλαμβάνεις", text: "" }] };
    case "contact": return { id, type, kicker: "Επικοινωνία", title: "Είμαστε εδώ", phone: true, email: true, stores: true, hours: "Δευτέρα–Παρασκευή 09:00–17:00" };
    case "newsletter": return { id, type, kicker: "Newsletter", title: "Μάθε πρώτος τις προσφορές", body: "Ένα email την εβδομάδα, μόνο με πραγματικές προσφορές." };
    case "guides": return { id, type, kicker: "Οδηγοί αγοράς", title: "Διάλεξε σωστά", mode: "auto", limit: 3 };
    case "services": return { id, type, kicker: "Υπηρεσίες", title: "Σε βοηθάμε σε όλα", mode: "auto", limit: 4 };
    case "callout": return { id, type, tone: "info", title: "", body: "" };
    case "cta": return { id, type, zone: "bottom", title: `Δες τα ${brand} από κοντά`, body: "Σε κάθε κατάστημα Euronics, με επίδειξη και συμβουλή.", primary: { label: "Βρες κατάστημα", href: "/katastimata" } };
  }
}
