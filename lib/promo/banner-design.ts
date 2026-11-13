import type { EnergyClass } from "@/lib/data/types";

/**
 * Σχεδιασμένο banner (AdPlacement.design): αντί για έτοιμη εικόνα, το banner στήνεται από φόντο (χρώμα / εικόνα /
 * video, με κίνηση), σήμα καμπάνιας, κείμενα και προϊόντα του καταλόγου. Φωτογραφία και τιμή των προϊόντων διαβάζονται
 * τη στιγμή της προβολής. Καθαρό αρχείο (χωρίς βάση): τρέχει στον editor, στη βιτρίνα και στα tests.
 */
export type BannerAnim = "none" | "spotlight" | "ambient" | "rays" | "sweep" | "zoom";
export const BANNER_ANIMS: { key: BannerAnim; label: string; help: string }[] = [
  { key: "none", label: "Χωρίς", help: "Ακίνητο φόντο." },
  { key: "spotlight", label: "Προβολέας", help: "Φωτεινή κηλίδα που ανασαίνει — για σκούρο φόντο." },
  { key: "ambient", label: "Απαλό φως", help: "Μπλε και κίτρινες ανταύγειες που κινούνται αργά." },
  { key: "rays", label: "Ακτίνες", help: "Κίτρινες ακτίνες που γυρίζουν αργά πίσω από το προϊόν." },
  { key: "sweep", label: "Λάμψη", help: "Μια λάμψη περνά κάθε λίγα δευτερόλεπτα." },
  { key: "zoom", label: "Αργό zoom", help: "Η εικόνα φόντου μεγαλώνει πολύ αργά. Θέλει εικόνα φόντου." },
];

export interface BannerDesign {
  /** «strip» = λωρίδα (κείμενο + προϊόντα)· «posts» = τετράγωνα post, ένα ανά προϊόν, στη μορφή των post της καμπάνιας */
  layout: "strip" | "posts";
  /** στυλ κάθε τετραγώνου: «visual» = πάνω στο εικαστικό της καμπάνιας· «podium» = φωτεινό φόντο, προϊόν σε βάθρο, στρογγυλή τιμή, χαρακτηριστικά με εικονίδιο */
  postStyle: "visual" | "podium";
  bg: { color: string; image: string | null; video: string | null; anim: BannerAnim };
  /** σήμα καμπάνιας πάνω αριστερά (π.χ. το «Black Friday»), προαιρετικό */
  logo: string | null;
  /** χρώμα κειμένων: ανοιχτά (για σκούρο φόντο) ή σκούρα */
  ink: "light" | "dark";
  /** χρώμα τιμής και κουμπιού */
  accent: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  products: {
    source: "none" | "manual" | "promotion";
    ids: string[];
    max: number;
    /** λέξη πάνω από την τιμή, π.χ. «ΜΟΝΟ» */
    priceLabel: string;
    showBrand: boolean;
    showEnergy: boolean;
    showWas: boolean;
    /** κουκκίδες δίπλα στο προϊόν — μόνο όταν το banner δείχνει ένα προϊόν */
    bullets: string[];
  };
}
/** Ό,τι χρειάζεται το banner από ένα προϊόν του καταλόγου. */
export interface BannerProduct { id: string; brand: string; title: string; href: string; image: string | null; cutout: boolean; price: number; wasPrice: number | null; energy: EnergyClass | null }

export const MAX_BANNER_PRODUCTS = 4;
const HEX = /^#[0-9a-f]{6}$/i;
const URL_OK = /^(\/(?!\/)|https:\/\/)/;

export const BANNER_PRESETS: { key: string; label: string; apply: Pick<BannerDesign, "ink" | "accent"> & { bg: Pick<BannerDesign["bg"], "color" | "anim"> } }[] = [
  { key: "night", label: "Σκούρο με προβολέα", apply: { ink: "light", accent: "#22e06b", bg: { color: "#05060f", anim: "spotlight" } } },
  { key: "navy", label: "Μπλε Euronics", apply: { ink: "light", accent: "#f1c400", bg: { color: "#122a58", anim: "ambient" } } },
  { key: "yellow", label: "Κίτρινο με ακτίνες", apply: { ink: "dark", accent: "#122a58", bg: { color: "#f1c400", anim: "rays" } } },
  { key: "podium", label: "Κίτρινο (για βάθρο)", apply: { ink: "dark", accent: "#122a58", bg: { color: "#ffd400", anim: "none" } } },
  { key: "white", label: "Λευκό ήσυχο", apply: { ink: "dark", accent: "#d62828", bg: { color: "#ffffff", anim: "none" } } },
];

export const DEFAULT_BANNER_DESIGN: BannerDesign = {
  layout: "strip", postStyle: "visual",
  bg: { color: "#122a58", image: null, video: null, anim: "ambient" },
  logo: null, ink: "light", accent: "#f1c400",
  kicker: "", title: "Τίτλος banner", body: "", cta: "Δες τις προσφορές",
  products: { source: "none", ids: [], max: 2, priceLabel: "ΜΟΝΟ", showBrand: true, showEnergy: true, showWas: true, bullets: [] },
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const url = (v: unknown) => { const s = str(v, 500); return s && URL_OK.test(s) ? s : null; };
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);

/** Ό,τι έρχεται από τον browser ή τη βάση → έγκυρο σχέδιο (ή null όταν δεν είναι σχέδιο). Δεν εμπιστεύεται τίποτα. */
export function normalizeBannerDesign(x: unknown): BannerDesign | null {
  if (!x || typeof x !== "object") return null;
  const d = x as Partial<BannerDesign>, bg = (d.bg ?? {}) as Partial<BannerDesign["bg"]>, p = (d.products ?? {}) as Partial<BannerDesign["products"]>, D = DEFAULT_BANNER_DESIGN;
  const source = p.source === "manual" || p.source === "promotion" ? p.source : "none";
  return {
    layout: d.layout === "posts" ? "posts" : "strip",
    postStyle: d.postStyle === "podium" ? "podium" : "visual",
    bg: { color: hex(bg.color, D.bg.color), image: url(bg.image), video: url(bg.video), anim: BANNER_ANIMS.some((a) => a.key === bg.anim) ? bg.anim! : "none" },
    logo: url(d.logo), ink: d.ink === "dark" ? "dark" : "light", accent: hex(d.accent, D.accent),
    kicker: str(d.kicker, 40), title: str(d.title, 80), body: str(d.body, 160), cta: str(d.cta, 30),
    products: {
      source, ids: source === "manual" && Array.isArray(p.ids) ? [...new Set(p.ids.filter((i): i is string => typeof i === "string"))].slice(0, MAX_BANNER_PRODUCTS) : [],
      max: Math.max(1, Math.min(MAX_BANNER_PRODUCTS, Number(p.max) || 2)), priceLabel: str(p.priceLabel, 12),
      showBrand: p.showBrand !== false, showEnergy: p.showEnergy !== false, showWas: p.showWas !== false,
      bullets: Array.isArray(p.bullets) ? p.bullets.map((b) => str(b, 40)).filter(Boolean).slice(0, 5) : [],
    },
  };
}

/** Τι λείπει για να μπορεί να φανεί: χρειάζεται κάτι να δείξει (τίτλο, σήμα ή προϊόντα). */
export function bannerDesignIssue(d: BannerDesign, promotionId: string | null): string | null {
  if (d.layout === "posts" && d.products.source === "none") return "Τα τετράγωνα post θέλουν προϊόντα: διάλεξε προϊόντα ή προσφορά.";
  if (!d.title && !d.logo && d.products.source === "none") return "Γράψε τίτλο, βάλε σήμα καμπάνιας ή διάλεξε προϊόντα.";
  if (d.products.source === "manual" && !d.products.ids.length) return "Διάλεξε τουλάχιστον ένα προϊόν ή άλλαξε σε «Χωρίς προϊόντα».";
  if (d.products.source === "promotion" && !promotionId) return "Για «Προϊόντα της προσφοράς» διάλεξε προσφορά στο «Πού και πότε».";
  if (d.bg.anim === "zoom" && !d.bg.image) return "Το «Αργό zoom» θέλει εικόνα φόντου.";
  return null;
}
