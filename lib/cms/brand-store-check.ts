import type { BrandBlock, BrandStore } from "./brand-store";

/**
 * Έλεγχος μιας σελίδας μάρκας πριν τη δημοσίευση, με ελληνικά μηνύματα που λένε ΠΟΥ είναι το πρόβλημα.
 * errors = μπλοκάρουν τη δημοσίευση · warnings = δημοσιεύεται, αλλά αξίζει διόρθωση.
 * Κοινό για τον editor (ζωντανά, καθώς γράφεις) και τον server (πριν τη δημοσίευση).
 */
export type Issue = { where: string; msg: string; anchor?: string };

const HEX = /^#([0-9a-f]{3}){1,2}$/i;
const toRgb = (h: string) => { const x = h.replace("#", ""); const f = x.length === 3 ? x.split("").map((c) => c + c).join("") : x; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); };
const lum = (h: string) => { const [r, g, b] = toRgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** λόγος αντίθεσης WCAG (1–21) */
export function contrast(a: string, b: string): number | null {
  if (!HEX.test(a) || !HEX.test(b)) return null;
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export const BLOCK_LABEL: Record<BrandBlock["type"], string> = {
  "new-arrivals": "Νέα προϊόντα",
  series: "Σειρές",
  offers: "Προσφορές",
  story: "Ιστορία",
  tech: "Τεχνολογία",
  support: "Εγγύηση & υποστήριξη",
  video: "Βίντεο",
  announcement: "Ανακοίνωση",
  usp: "Πλεονεκτήματα",
  banner: "Banner",
  "products-auto": "Προϊόντα (αυτόματα)",
  categories: "Κατηγορίες",
  faq: "Συχνές ερωτήσεις",
  text: "Κείμενο",
  gallery: "Gallery",
  cta: "Κάλεσμα σε δράση",
  ad: "Διαφήμιση",
  "promo-products": "Προϊόντα προσφοράς",
  "promo-landing": "Σελίδα προσφοράς",
  coupon: "Κουπόνι",
  stores: "Καταστήματα",
  "deal-hero": "Προσφορά ημέρας",
  "promo-grid": "Ενεργές προσφορές",
  countdown: "Αντίστροφη μέτρηση",
  steps: "Βήματα",
  contact: "Επικοινωνία",
  newsletter: "Newsletter",
  guides: "Οδηγοί αγοράς",
  services: "Υπηρεσίες",
  callout: "Σημαντική σημείωση",
};

const okHref = (h: string | undefined) => !!h && (/^\/[^\s]*$/.test(h) || /^https:\/\/[^\s]+$/.test(h));

export function checkStore(s: BrandStore, now = new Date()): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const E = (where: string, msg: string, anchor?: string) => errors.push({ where, msg, anchor });
  const W = (where: string, msg: string, anchor?: string) => warnings.push({ where, msg, anchor });

  if (!s.wordmark?.trim()) E("Ταυτότητα", "Λείπει το όνομα/λογότυπο κειμένου (wordmark).", "sec-identity");
  if (s.logo && !s.logoAspect) {
    // λογότυπο της δικής μας βιβλιοθήκης χωρίς περικοπή = πιθανότατα κενό περιθώριο/φόντο → δεν δημοσιεύεται έτσι
    if (/^https:\/\/euronics\.b-cdn\.net\//.test(s.logo)) E("Ταυτότητα", "Το λογότυπο δεν έχει περάσει από «Περικοπή & ομοιομορφία» — θα φαινόταν μικρό ή με φόντο. Πάτα το κουμπί στο πεδίο «Λογότυπο».", "sec-identity");
    else W("Ταυτότητα", "Το λογότυπο (εξωτερικό) δεν έχει μετρηθεί — μπορεί να μη βγαίνει ίδιο σε μέγεθος με τις άλλες μάρκες.", "sec-identity");
  }
  for (const k of ["bg", "bg2", "ink", "muted", "accent", "accentInk"] as const) if (!HEX.test(s.theme?.[k] ?? "")) E("Χρώματα", `Μη έγκυρο χρώμα «${k}» — γράψε το σε μορφή #RRGGBB.`, "sec-theme");
  const c1 = contrast(s.theme.ink, s.theme.bg);
  const c2 = contrast(s.theme.muted, s.theme.bg);
  const c3 = contrast(s.theme.accentInk, s.theme.accent);
  if (c1 !== null && c1 < 4.5) W("Χρώματα", `Το κείμενο διαβάζεται δύσκολα πάνω στο φόντο (αντίθεση ${c1.toFixed(1)}:1, χρειάζεται ≥ 4,5).`, "sec-theme");
  if (c2 !== null && c2 < 3) W("Χρώματα", `Το δευτερεύον κείμενο είναι πολύ αχνό (αντίθεση ${c2.toFixed(1)}:1, χρειάζεται ≥ 3).`, "sec-theme");
  if (c3 !== null && c3 < 4.5) W("Χρώματα", `Το κείμενο των κουμπιών δεν ξεχωρίζει από το χρώμα της μάρκας (αντίθεση ${c3.toFixed(1)}:1).`, "sec-theme");

  const h = s.hero;
  if (!h.title?.some((l) => l.trim())) E("Hero", "Ο τίτλος είναι κενός.", "sec-hero");
  if (!h.productId) E("Hero", "Διάλεξε το προϊόν που «αιωρείται» στο hero.", "sec-hero");
  if (!h.cta?.label?.trim()) E("Hero", "Λείπει το κείμενο του κουμπιού.", "sec-hero");
  if (!okHref(h.cta?.href)) E("Hero", "Ο σύνδεσμος του κουμπιού πρέπει να ξεκινά με / (σελίδα του site) ή https://.", "sec-hero");
  if (!h.body?.trim()) W("Hero", "Χωρίς κείμενο κάτω από τον τίτλο η σελίδα λέει λίγα.", "sec-hero");

  if (!s.seo?.title?.trim()) E("SEO", "Λείπει ο τίτλος για Google.", "sec-identity");
  else if (s.seo.title.length > 65) W("SEO", `Ο τίτλος για Google έχει ${s.seo.title.length} χαρακτήρες — η Google κόβει μετά τους ~60.`, "sec-identity");
  if (!s.seo?.description?.trim()) W("SEO", "Λείπει η περιγραφή για Google.", "sec-identity");
  else if (s.seo.description.length > 165) W("SEO", `Η περιγραφή έχει ${s.seo.description.length} χαρακτήρες — η Google δείχνει ~155.`, "sec-identity");

  const active = s.blocks.filter((b) => b.enabled !== false);
  if (!active.length) W("Ενότητες", "Δεν υπάρχει καμία ενεργή ενότητα κάτω από το hero.", "sec-blocks");
  const r = checkBlocks(s.blocks, now);
  return { errors: [...errors, ...r.errors], warnings: [...warnings, ...r.warnings] };
}

/** Έλεγχος των ενοτήτων (κοινός για σελίδες μαρκών και ζώνες πληροφοριακών σελίδων). */
export function checkBlocks(blocks: BrandBlock[], now = new Date()): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const E = (where: string, msg: string, anchor?: string) => errors.push({ where, msg, anchor });
  const W = (where: string, msg: string, anchor?: string) => warnings.push({ where, msg, anchor });
  blocks.forEach((b, i) => {
    const w = `Ενότητα ${i + 1} · ${BLOCK_LABEL[b.type] ?? b.type}`;
    const a = `blk-${b.id}`;
    if (b.enabled === false) return;
    if (b.hideOn && b.hideOn.length >= 3) E(w, "Είναι κρυφό σε όλες τις συσκευές — άφησε τουλάχιστον μία ή απόκρυψέ το με το μάτι.", a);
    if (b.schedule?.from && b.schedule?.to && new Date(b.schedule.to) <= new Date(b.schedule.from)) E(w, "Η λήξη είναι πριν από την έναρξη.", a);
    if (b.schedule?.to && new Date(b.schedule.to) < now) W(w, "Η περίοδος προβολής έχει λήξει — δεν εμφανίζεται.", a);
    switch (b.type) {
      case "new-arrivals":
        if (!b.productIds.length) E(w, "Πρόσθεσε τουλάχιστον ένα προϊόν.", a);
        break;
      case "offers":
        if (!b.productIds.length) E(w, "Πρόσθεσε τουλάχιστον ένα προϊόν.", a);
        if (!b.endsAt || Number.isNaN(Date.parse(b.endsAt))) E(w, "Βάλε ημερομηνία λήξης της προσφοράς.", a);
        else if (new Date(b.endsAt) < now) W(w, "Η αντίστροφη μέτρηση έχει ήδη τελειώσει.", a);
        break;
      case "series":
        if (!b.items.length) E(w, "Πρόσθεσε τουλάχιστον μία σειρά.", a);
        b.items.forEach((it, k) => { if (!it.name.trim()) E(w, `Η σειρά ${k + 1} δεν έχει όνομα.`, a); if (!it.image) W(w, `Η σειρά «${it.name || k + 1}» δεν έχει εικόνα.`, a); if (it.href && !okHref(it.href)) E(w, `Μη έγκυρος σύνδεσμος στη σειρά «${it.name || k + 1}».`, a); });
        break;
      case "story":
        if (!b.image) E(w, "Λείπει η εικόνα.", a);
        if (!b.body?.trim()) E(w, "Λείπει το κείμενο.", a);
        if (b.cta && (!b.cta.label.trim() || !okHref(b.cta.href))) E(w, "Το κουμπί θέλει κείμενο και σύνδεσμο (/… ή https://).", a);
        break;
      case "tech":
        if (!b.items.length) E(w, "Πρόσθεσε τουλάχιστον ένα χαρακτηριστικό.", a);
        b.items.forEach((it, k) => { if (!it.title.trim()) E(w, `Το χαρακτηριστικό ${k + 1} δεν έχει τίτλο.`, a); });
        break;
      case "support":
        if (!b.facts.filter((f) => f.trim()).length) E(w, "Γράψε τουλάχιστον ένα στοιχείο εγγύησης/υποστήριξης.", a);
        break;
      case "video":
        if (!/^https?:\/\/|^\//.test(b.src ?? "")) E(w, "Λείπει το βίντεο (URL από τη βιβλιοθήκη media).", a);
        if (!b.poster) W(w, "Χωρίς εικόνα εξωφύλλου το βίντεο δείχνει μαύρο μέχρι να φορτώσει.", a);
        break;
      case "announcement":
        if (!b.text?.trim()) E(w, "Γράψε το κείμενο της ανακοίνωσης.", a);
        if (b.href && !okHref(b.href)) E(w, "Μη έγκυρος σύνδεσμος.", a);
        if (b.endsAt && new Date(b.endsAt) < now) W(w, "Η αντίστροφη μέτρηση έχει τελειώσει.", a);
        break;
      case "usp":
        if (!b.items.filter((x) => x.text.trim()).length) E(w, "Πρόσθεσε τουλάχιστον ένα πλεονέκτημα.", a);
        break;
      case "banner":
        if (!b.image) E(w, "Λείπει η εικόνα του banner.", a);
        if (b.cta && (!b.cta.label.trim() || !okHref(b.cta.href))) E(w, "Το κουμπί θέλει κείμενο και σύνδεσμο (/… ή https://).", a);
        if (!b.title && !b.body) W(w, "Banner χωρίς τίτλο ή κείμενο — βεβαιώσου ότι η εικόνα λέει από μόνη της το μήνυμα.", a);
        break;
      case "products-auto":
        if (!(b.limit >= 2 && b.limit <= 12)) E(w, "Πλήθος προϊόντων από 2 έως 12.", a);
        if (b.cta && (!b.cta.label.trim() || !okHref(b.cta.href))) E(w, "Το κουμπί θέλει κείμενο και σύνδεσμο.", a);
        break;
      case "categories":
        if (b.mode === "manual" && !b.items?.length) E(w, "Διάλεξε κατηγορίες ή γύρνα σε «Αυτόματα».", a);
        break;
      case "faq":
        if (!b.items.length) E(w, "Πρόσθεσε τουλάχιστον μία ερώτηση.", a);
        b.items.forEach((x, k) => { if (!x.q.trim() || !x.a.trim()) E(w, `Η ερώτηση ${k + 1} θέλει και ερώτηση και απάντηση.`, a); });
        break;
      case "text":
        if (!b.body?.trim() && !b.title?.trim()) E(w, "Το κείμενο είναι κενό.", a);
        break;
      case "gallery":
        if (b.images.filter((x) => x.src).length < 2) E(w, "Βάλε τουλάχιστον 2 εικόνες.", a);
        b.images.forEach((x, k) => { if (x.href && !okHref(x.href)) E(w, `Μη έγκυρος σύνδεσμος στην εικόνα ${k + 1}.`, a); });
        break;
      case "cta":
        if (!b.title?.trim()) E(w, "Γράψε τίτλο.", a);
        if (!b.primary?.label.trim() || !okHref(b.primary?.href)) E(w, "Το κύριο κουμπί θέλει κείμενο και σύνδεσμο.", a);
        if (b.secondary && (!b.secondary.label.trim() || !okHref(b.secondary.href))) E(w, "Το δεύτερο κουμπί θέλει κείμενο και σύνδεσμο (ή αφαίρεσέ το).", a);
        break;
      case "ad":
        if (b.mode === "slot" && !b.slot) E(w, "Διάλεξε θέση διαφήμισης.", a);
        if (b.mode === "placement" && !b.placementId) E(w, "Διάλεξε banner από τις Διαφημιστικές θέσεις.", a);
        break;
      case "promo-products":
        if (!b.promotionId) E(w, "Διάλεξε προσφορά.", a);
        break;
      case "promo-landing":
        if (!b.landingId) E(w, "Διάλεξε σελίδα προσφοράς.", a);
        break;
      case "coupon":
        if (!b.code.trim()) E(w, "Διάλεξε κουπόνι.", a);
        break;
      case "stores":
        if (b.mode === "region" && !b.region) E(w, "Διάλεξε περιοχή.", a);
        break;
      case "deal-hero":
        if (b.source === "promotion" && !b.promotionId) E(w, "Διάλεξε προσφορά.", a);
        if (b.source === "product" && !b.productId) E(w, "Διάλεξε προϊόν.", a);
        break;
      case "countdown":
        if (!b.promotionId) E(w, "Διάλεξε προσφορά.", a);
        if (b.cta && (!b.cta.label.trim() || !okHref(b.cta.href))) E(w, "Το κουμπί θέλει κείμενο και σύνδεσμο.", a);
        break;
      case "steps":
        if (b.items.filter((x) => x.title.trim()).length < 2) E(w, "Βάλε τουλάχιστον 2 βήματα με τίτλο.", a);
        break;
      case "contact":
        if (!b.phone && !b.email && !b.stores && !b.hours?.trim()) E(w, "Διάλεξε τι θα δείχνει (τηλέφωνο, email, καταστήματα ή ωράριο).", a);
        break;
      case "guides":
      case "services":
        if (b.mode === "manual" && !b.slugs?.length) E(w, "Διάλεξε τουλάχιστον ένα ή γύρνα σε «Αυτόματα».", a);
        break;
      case "callout":
        if (!b.body?.trim()) E(w, "Γράψε το κείμενο της σημείωσης.", a);
        if (b.cta && (!b.cta.label.trim() || !okHref(b.cta.href))) E(w, "Το κουμπί θέλει κείμενο και σύνδεσμο.", a);
        break;
    }
  });
  return { errors, warnings };
}
