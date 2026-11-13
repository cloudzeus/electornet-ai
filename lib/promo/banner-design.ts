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

export type PostStyle = "visual" | "podium" | "clean" | "band";
export const POST_STYLES: { key: PostStyle; label: string; help: string }[] = [
  { key: "visual", label: "Εικαστικό καμπάνιας", help: "Το προϊόν πάνω στο εικαστικό (εικόνα φόντου με το σήμα). Τιμή κάτω δεξιά." },
  { key: "podium", label: "Βάθρο", help: "Φωτεινό φόντο, προϊόν σε βάθρο, στρογγυλή τιμή, έως 4 χαρακτηριστικά με εικονίδιο. Στο «Φόντο» διάλεξε «Κίτρινο (για βάθρο)»· το σήμα μπαίνει πάνω αριστερά και το «Κείμενο» κάτω δεξιά (π.χ. «Σε 4 χρώματα»)." },
  { key: "clean", label: "Λευκή κάρτα", help: "Λευκό τετράγωνο με γραμμή στο χρώμα φόντου πάνω: το προϊόν μεγάλο, μάρκα και τίτλος κάτω αριστερά, τιμή κάτω δεξιά. Ταιριάζει με φωτογραφίες που έχουν λευκό φόντο." },
  { key: "band", label: "Ζώνη τιμής", help: "Το προϊόν πάνω στο χρώμα φόντου και από κάτω μια ζώνη στο χρώμα έμφασης με την τιμή μεγάλη. Για banners όπου η τιμή είναι το μήνυμα." },
];
/** Σχήμα πίσω από την τιμή στα τετράγωνα post (τα σχήματα των stickers), στο χρώμα έμφασης· «auto» = όπως ορίζει το στυλ. */
export type PriceShape = "auto" | "circle" | "burst" | "seal" | "hex";
export const PRICE_SHAPES: { key: PriceShape; label: string; help?: string }[] = [
  { key: "auto", label: "Απλή", help: "Όπως ορίζει το στυλ: σκέτη τιμή στο εικαστικό, δαχτυλίδι στο βάθρο." },
  { key: "circle", label: "Κύκλος" },
  { key: "burst", label: "Αστέρι", help: "Το κλασικό «σκάσιμο» των φυλλαδίων." },
  { key: "seal", label: "Σφραγίδα" },
  { key: "hex", label: "Εξάγωνο" },
];
/** Κίνηση μέσα σε κάθε τετράγωνο post. Σβήνει μόνη της όταν ο επισκέπτης έχει ζητήσει λιγότερη κίνηση. */
export type TileAnim = "none" | "float" | "pulse" | "wiggle" | "shine";
export const TILE_ANIMS: { key: TileAnim; label: string; help?: string }[] = [
  { key: "none", label: "Χωρίς" },
  { key: "float", label: "Το προϊόν αιωρείται", help: "Το προϊόν ανεβοκατεβαίνει πολύ αργά." },
  { key: "pulse", label: "Η τιμή ανασαίνει", help: "Η τιμή μεγαλώνει και μικραίνει ελαφρά." },
  { key: "wiggle", label: "Η τιμή κουνιέται", help: "Η τιμή γέρνει δεξιά-αριστερά, σαν ταμπελάκι." },
  { key: "shine", label: "Λάμψη", help: "Μια λάμψη περνά πάνω από το τετράγωνο κάθε λίγα δευτερόλεπτα." },
];
export const PER_ROW = [2, 3, 4, 5, 6] as const;

export interface BannerDesign {
  /** «strip» = λωρίδα (κείμενο + προϊόντα)· «posts» = τετράγωνα post, ένα ανά προϊόν, στη μορφή των post της καμπάνιας */
  layout: "strip" | "posts";
  /** στυλ κάθε τετραγώνου: «visual» = πάνω στο εικαστικό της καμπάνιας· «podium» = φωτεινό φόντο, προϊόν σε βάθρο, στρογγυλή τιμή, χαρακτηριστικά με εικονίδιο */
  postStyle: PostStyle;
  /** σχήμα πίσω από την τιμή, στα τετράγωνα post */
  priceShape: PriceShape;
  /** κίνηση μέσα σε κάθε τετράγωνο post */
  tileAnim: TileAnim;
  bg: { color: string; image: string | null; video: string | null; anim: BannerAnim };
  /** sticker (κλειδί του /admin/stickers) πάνω στο banner — σε κάθε τετράγωνο post ή στη γωνία της λωρίδας */
  stickerKey: string | null;
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
    /** τετράγωνα post ανά σειρά σε φαρδιά οθόνη (2–6)· σε κινητό πάντα 2 */
    perRow: number;
    /** λέξη πάνω από την τιμή, π.χ. «ΜΟΝΟ» */
    priceLabel: string;
    showBrand: boolean;
    showEnergy: boolean;
    showWas: boolean;
    /** φωτογραφία προϊόντος χωρίς φόντο (φτιάχνεται στην αποθήκευση)· false = η φωτογραφία του καταλόγου όπως είναι */
    cutout: boolean;
    /** κουκκίδες δίπλα στο προϊόν — μόνο όταν το banner δείχνει ένα προϊόν */
    bullets: string[];
  };
}
/** Ό,τι χρειάζεται το banner από ένα προϊόν του καταλόγου. */
export interface BannerProduct { id: string; brand: string; title: string; href: string; image: string | null; cutout: boolean; price: number; wasPrice: number | null; energy: EnergyClass | null }

export const MAX_BANNER_PRODUCTS = 12;
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
  layout: "strip", postStyle: "visual", priceShape: "auto", tileAnim: "none",
  bg: { color: "#122a58", image: null, video: null, anim: "ambient" },
  stickerKey: null, logo: null, ink: "light", accent: "#f1c400",
  kicker: "", title: "Τίτλος banner", body: "", cta: "Δες τις προσφορές",
  products: { source: "none", ids: [], max: 2, perRow: 4, priceLabel: "ΜΟΝΟ", showBrand: true, showEnergy: true, showWas: true, cutout: true, bullets: [] },
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
    postStyle: POST_STYLES.some((x) => x.key === d.postStyle) ? d.postStyle! : "visual",
    priceShape: PRICE_SHAPES.some((x) => x.key === d.priceShape) ? d.priceShape! : "auto",
    tileAnim: TILE_ANIMS.some((x) => x.key === d.tileAnim) ? d.tileAnim! : "none",
    bg: { color: hex(bg.color, D.bg.color), image: url(bg.image), video: url(bg.video), anim: BANNER_ANIMS.some((a) => a.key === bg.anim) ? bg.anim! : "none" },
    stickerKey: typeof d.stickerKey === "string" && /^[a-z0-9-]{1,80}$/.test(d.stickerKey) ? d.stickerKey : null,
    logo: url(d.logo), ink: d.ink === "dark" ? "dark" : "light", accent: hex(d.accent, D.accent),
    kicker: str(d.kicker, 40), title: str(d.title, 80), body: str(d.body, 160), cta: str(d.cta, 30),
    products: {
      source, ids: source === "manual" && Array.isArray(p.ids) ? [...new Set(p.ids.filter((i): i is string => typeof i === "string"))].slice(0, MAX_BANNER_PRODUCTS) : [],
      max: Math.max(1, Math.min(MAX_BANNER_PRODUCTS, Number(p.max) || 2)), perRow: Math.max(2, Math.min(6, Math.round(Number(p.perRow)) || 4)), priceLabel: str(p.priceLabel, 12),
      showBrand: p.showBrand !== false, showEnergy: p.showEnergy !== false, showWas: p.showWas !== false, cutout: p.cutout !== false,
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
