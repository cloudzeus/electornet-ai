/**
 * Πρότυπα προσφορών για τον οδηγό του διαχειριστικού και ετικέτες κατάστασης. Χωρίς βάση — χρησιμοποιείται και στον browser.
 * Τα «held» πρότυπα φαίνονται κλειδωμένα: η υποδομή υπάρχει, αλλά δεν ενεργοποιούνται μέχρι να διευκρινιστούν με τον πελάτη.
 */
import type { PromoReward, PromoRules, Stacking } from "./engine";

const eurc = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export type PromoStatus = "draft" | "pending" | "scheduled" | "active" | "paused" | "ended" | "archived";

export const STATUS_LABEL: Record<PromoStatus, { label: string; tone: string }> = {
  draft: { label: "Πρόχειρο", tone: "bg-eu-surface text-eu-ink-3" },
  pending: { label: "Αναμένει έγκριση", tone: "bg-eu-yellow/30 text-eu-navy" },
  scheduled: { label: "Προγραμματισμένη", tone: "bg-eu-chip text-eu-blue" },
  active: { label: "Ενεργή", tone: "bg-eu-green/15 text-eu-green" },
  paused: { label: "Σε παύση", tone: "bg-eu-amber/15 text-eu-amber" },
  ended: { label: "Έληξε", tone: "bg-eu-surface text-eu-muted" },
  archived: { label: "Αρχείο", tone: "bg-eu-surface text-eu-muted" },
};

export const STACKING_LABEL: Record<Stacking, { label: string; help: string }> = {
  "no-price": { label: "Όχι μαζί με άλλη έκπτωση τιμής", help: "Σε κάθε προϊόν μένει η καλύτερη έκπτωση τιμής για τον πελάτη. Τα κουπόνια δεν πέφτουν σε προϊόντα ήδη σε προσφορά." },
  combine: { label: "Συνδυάζεται", help: "Μπαίνει πάνω από άλλες εκπτώσεις (π.χ. κουπόνι πάνω σε προσφορά), πάντα μέσα στις δικλείδες." },
  exclusive: { label: "Αποκλειστική", help: "Κερδίζει πάντα στα προϊόντα της και μπλοκάρει κουπόνια σε αυτά." },
};

export interface PromoTemplate {
  key: string;
  mechanism: string;
  group: "price" | "qty" | "extra" | "coupon" | "payment" | "held";
  title: string;
  blurb: string;
  example: string;
  reward: PromoReward;
  rules?: PromoRules;
  stacking: Stacking;
  /** κλειδωμένο μέχρι διευκρίνιση */
  held?: string;
}

export const TEMPLATES: PromoTemplate[] = [
  { key: "percent", mechanism: "price-percent", group: "price", title: "Έκπτωση %", blurb: "Ποσοστό σε προϊόντα, μάρκα ή κατηγορία.", example: "−20 % σε όλα τα Philips Airfryer", reward: { percent: 15 }, stacking: "no-price" },
  { key: "amount", mechanism: "price-amount", group: "price", title: "Έκπτωση σε €", blurb: "Σταθερό ποσό ανά τεμάχιο.", example: "−50 € σε τηλεοράσεις 55\"", reward: { amount: 5000 }, stacking: "no-price" },
  { key: "special", mechanism: "special-price", group: "price", title: "Ειδική τιμή ανά κωδικό", blurb: "Τελική τιμή για κάθε προϊόν — και από Excel.", example: "LG OLED55C4 στα 1.199 €", reward: { price: {} }, stacking: "no-price" },
  { key: "nplusm", mechanism: "n-plus-m", group: "qty", title: "1+1 / 2+1", blurb: "Το φθηνότερο της ομάδας δωρεάν.", example: "2+1 σε όλα τα μικροέπιπλα κουζίνας", reward: { buy: 2, get: 1 }, stacking: "no-price" },
  { key: "nth", mechanism: "nth-discount", group: "qty", title: "2ο −Χ %", blurb: "Έκπτωση στο δεύτερο (ή τρίτο) τεμάχιο.", example: "2ο τεμάχιο −50 %", reward: { nth: 2, percent: 50 }, stacking: "no-price" },
  { key: "tiers", mechanism: "qty-tiers", group: "qty", title: "Κλιμακωτή ποσότητα", blurb: "Περισσότερα τεμάχια, μεγαλύτερη έκπτωση.", example: "−5 % από 2, −10 % από 4 τεμάχια", reward: { tiers: [{ minQty: 2, percent: 5 }, { minQty: 4, percent: 10 }] }, stacking: "no-price" },
  { key: "together", mechanism: "together", group: "qty", title: "Μαζί φθηνότερα", blurb: "Με το βασικό, το συνοδευτικό με έκπτωση.", example: "Τηλεόραση + soundbar: −30 % στο soundbar", reward: { percent: 30, with: [] }, stacking: "no-price" },
  { key: "bundle", mechanism: "bundle", group: "qty", title: "Πακέτο σε σταθερή τιμή", blurb: "Συγκεκριμένα προϊόντα μαζί, μία τιμή.", example: "Πλυντήριο + στεγνωτήριο στα 999 €", reward: { bundle: [], bundlePrice: 0 }, stacking: "no-price" },
  { key: "gift", mechanism: "gift", group: "extra", title: "Δώρο με αγορά", blurb: "Προϊόν-δώρο στο καλάθι, με αξία και 0 €.", example: "Δώρο ηχείο με κάθε τηλεόραση από 699 €", reward: { giftQty: 1 }, stacking: "combine" },
  { key: "service", mechanism: "service", group: "extra", title: "Δωρεάν υπηρεσία", blurb: "Επέκταση εγγύησης, ανακύκλωση, φύλαξη…", example: "Δωρεάν επέκταση εγγύησης σε πλυντήρια", reward: { serviceSlug: "epektasi-eggyisis" }, stacking: "combine" },
  { key: "shipping", mechanism: "shipping", group: "extra", title: "Δωρεάν μεταφορικά", blurb: "Για συγκεκριμένα προϊόντα ή από ένα ποσό.", example: "Δωρεάν μεταφορικά σε όλα τα ψυγεία", reward: {}, stacking: "combine" },
  { key: "coupon-amount", mechanism: "coupon-amount", group: "coupon", title: "Κουπόνι σε €", blurb: "Κοινός ή μοναδικοί κωδικοί, στο καλάθι.", example: "WELCOME10: −10 € από 99 €", reward: { amount: 1000 }, rules: { minValue: 9900 }, stacking: "no-price" },
  { key: "coupon-percent", mechanism: "coupon-percent", group: "coupon", title: "Κουπόνι %", blurb: "Ποσοστό στο καλάθι.", example: "NEWS5: −5 % στην επόμενη αγορά", reward: { percent: 5 }, stacking: "no-price" },
  { key: "pay-percent", mechanism: "payment-percent", group: "payment", title: "Έκπτωση τρόπου πληρωμής %", blurb: "Για συγκεκριμένο τρόπο πληρωμής, στο checkout.", example: "−3 % με IRIS ή τραπεζική κατάθεση", reward: { percent: 3 }, rules: { payment: ["iris"] }, stacking: "combine" },
  { key: "pay-amount", mechanism: "payment-amount", group: "payment", title: "Έκπτωση τρόπου πληρωμής €", blurb: "Σταθερό ποσό για τρόπο πληρωμής.", example: "−10 € με πληρωμή στο κατάστημα", reward: { amount: 1000 }, rules: { payment: ["store"] }, stacking: "combine" },
  { key: "installation", mechanism: "service", group: "held", title: "Δωρεάν εγκατάσταση", blurb: "Υποδομή έτοιμη — εξαρτάται από τα συνεργεία και τον τρόπο χρέωσης.", example: "Δωρεάν εγκατάσταση κλιματιστικού", reward: { serviceSlug: "paradosi-egkatastasi" }, stacking: "combine", held: "Αναμένονται οδηγίες για συνεργεία, ζώνες και χρέωση." },
  { key: "voucher", mechanism: "coupon-amount", group: "held", title: "Δωροεπιταγή", blurb: "Αγορά και εξαργύρωση δωροεπιταγών.", example: "Δωροεπιταγή 50 €", reward: { amount: 5000 }, stacking: "combine", held: "Χρειάζεται διευκρίνιση λογιστικού χειρισμού (έσοδο / προκαταβολή)." },
  { key: "giveaway", mechanism: "gift", group: "held", title: "Giveaway", blurb: "Δωρεάν συμμετοχή χωρίς αγορά (social / site).", example: "Κέρδισε μια τηλεόραση — δήλωσε συμμετοχή", reward: {}, stacking: "combine", held: "Χρειάζεται νομικό έλεγχο (όροι διαγωνισμού, GDPR, ανάδειξη νικητή)." },
  { key: "raffle", mechanism: "gift", group: "held", title: "Κλήρωση / διαγωνισμός", blurb: "Συμμετοχή με αγορά.", example: "Κλήρωση για ταξίδι με κάθε αγορά από 300 €", reward: {}, stacking: "combine", held: "Χρειάζεται νομικό έλεγχο (όροι, άδεια, GDPR)." },
  { key: "bank", mechanism: "price-percent", group: "held", title: "Προσφορές τραπεζών / άτοκες / cashback", blurb: "Έκπτωση ή άτοκες με συγκεκριμένη κάρτα.", example: "−10 % με κάρτα της τράπεζας Χ", reward: { percent: 10 }, rules: { payment: ["card"] }, stacking: "combine", held: "Αναμένονται συμφωνίες με τις τράπεζες και ο τρόπος αναγνώρισης κάρτας (BIN)." },
];

export const MECHANISM_LABEL: Record<string, string> = Object.fromEntries(TEMPLATES.filter((t) => t.group !== "held").map((t) => [t.mechanism, t.title]));

const PAY: Record<string, string> = { card: "κάρτα", "no-card": "δόσεις χωρίς κάρτα", iris: "IRIS", bank: "τραπεζική κατάθεση", cod: "αντικαταβολή", store: "πληρωμή στο κατάστημα", apple: "Apple Pay", google: "Google Pay", revolut: "Revolut" };
export const PAYMENT_OPTIONS = Object.entries(PAY).map(([value, label]) => ({ value, label }));
const payNames = (codes: string[] = []) => codes.map((c) => PAY[c] ?? c).join(" ή ") || "—";

/** Η προσφορά σε μία πρόταση, όπως τη διαβάζει ο άνθρωπος (λίστα, αναφορές, οδηγός). */
export function describePromo(p: { mechanism: string; reward: PromoReward; rules?: PromoRules | null }, names: { gift?: string; service?: string } = {}) {
  const r = p.reward ?? {}, rules = p.rules ?? {};
  const eur = (c?: number) => `${((c ?? 0) / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })} €`;
  const base = (() => {
    switch (p.mechanism) {
      case "price-percent": return `−${r.percent ?? 0} %`;
      case "price-amount": return `−${eur(r.amount)} ανά τεμάχιο`;
      case "special-price": return `ειδική τιμή σε ${Object.keys(r.price ?? {}).length} κωδικούς`;
      case "n-plus-m": return `${r.buy ?? 1}+${r.get ?? 1}: το φθηνότερο δωρεάν`;
      case "nth-discount": return `${r.nth ?? 2}ο τεμάχιο −${r.percent ?? 0} %`;
      case "qty-tiers": return (r.tiers ?? []).map((t) => `−${t.percent} % από ${t.minQty} τεμ.`).join(", ");
      case "gift": return `δώρο${names.gift ? ` «${names.gift}»` : ""}${(r.giftQty ?? 1) > 1 ? ` × ${r.giftQty}` : ""}`;
      case "service": return `δωρεάν ${names.service ?? r.serviceSlug ?? "υπηρεσία"}`;
      case "shipping": return "δωρεάν μεταφορικά";
      case "coupon-percent": return `κουπόνι −${r.percent ?? 0} %`;
      case "coupon-amount": return `κουπόνι −${eur(r.amount)}`;
      case "together": return `μαζί φθηνότερα: ${r.percent != null ? `−${r.percent} %` : `−${eur(r.amount)}`} στο συνοδευτικό`;
      case "bundle": return `πακέτο ${(r.bundle ?? []).reduce((a, i) => a + i.qty, 0)} τεμ. στα ${eur(r.bundlePrice)}`;
      case "payment-percent": return `−${r.percent ?? 0} % με ${payNames(rules.payment)}`;
      case "payment-amount": return `−${eur(r.amount)} με ${payNames(rules.payment)}`;
      default: return p.mechanism;
    }
  })();
  const cond = [
    rules.minValue ? `από ${eur(rules.minValue)}` : "",
    rules.minQty ? `από ${rules.minQty} τεμ.` : "",
    rules.customers === "new" ? "μόνο πρώτη αγορά" : rules.customers === "registered" ? "μόνο μέλη" : "",
    rules.channels?.length === 1 ? (rules.channels[0] === "online" ? "μόνο με αποστολή" : "μόνο παραλαβή από κατάστημα") : "",
    rules.zips?.length ? `ΤΚ ${rules.zips.slice(0, 3).join(", ")}${rules.zips.length > 3 ? "…" : ""}` : "",
    rules.payment?.length && !p.mechanism.startsWith("payment") ? `πληρωμή: ${payNames(rules.payment)}` : "",
    rules.segments?.length ? `κοινό: ${rules.segments.length}` : "",
    rules.earlyAccess?.segments.length ? `early access ${rules.earlyAccess.hours} ώρες` : "",
  ].filter(Boolean);
  return cond.length ? `${base} · ${cond.join(" · ")}` : base;
}

/** Αυτόματη ετικέτα όταν ο διαχειριστής δεν έγραψε δική του. */
export function autoLabel(p: { mechanism: string; reward: PromoReward; tagLabel?: string | null; name: string }, serviceTitle?: string): string {
  if (p.tagLabel) return p.tagLabel;
  const r = p.reward ?? {};
  switch (p.mechanism) {
    case "price-percent": return `−${r.percent ?? 0} %`;
    case "price-amount": return `−${eurc(r.amount ?? 0)}`;
    case "n-plus-m": return `${r.buy ?? 1}+${r.get ?? 1}`;
    case "nth-discount": return `${r.nth ?? 2}ο −${r.percent ?? 0} %`;
    case "qty-tiers": { const t = [...(r.tiers ?? [])].sort((a, b) => b.percent - a.percent)[0]; return t ? `−${t.percent} % από ${t.minQty} τεμ.` : p.name; }
    case "gift": return "Δώρο με αγορά";
    case "service": return `Δωρεάν ${serviceTitle?.toLocaleLowerCase("el-GR") ?? "υπηρεσία"}`;
    case "shipping": return "Δωρεάν μεταφορικά";
    case "together": return "Μαζί φθηνότερα";
    case "bundle": return `Πακέτο ${eurc(r.bundlePrice ?? 0)}`;
    case "payment-percent": return `−${r.percent ?? 0} % με ${payNames((p as { rules?: PromoRules }).rules?.payment)}`;
    case "payment-amount": return `−${eurc(r.amount ?? 0)} με ${payNames((p as { rules?: PromoRules }).rules?.payment)}`;
    default: return p.name;
  }
}

