/**
 * @dynamic Brand Store — a manufacturer's own page inside the shop, fully
 * described by data so the CMS can create/edit one without code.
 *
 * Shape (mirrors the home zones): a `BrandStore` has a theme (tokens only,
 * no CSS), a hero and an ordered list of `BrandBlock`s. Every block is a
 * discriminated union on `type`, carries `id`, optional `enabled` and
 * `schedule`, and references products **by id** (resolved server-side at
 * render time, never embedded). Assets are URLs from the DAM. Copy is
 * plain text. Adding a block type = one entry in the union + one renderer
 * in `brand-render.tsx`; the page never changes.
 */
export interface BrandTheme {
  /** page background and a second surface for cards */
  bg: string;
  bg2: string;
  /** main text and muted text on the background */
  ink: string;
  muted: string;
  /** brand accent and the text colour on top of it */
  accent: string;
  accentInk: string;
  /** light or dark mode decides card/ring defaults */
  mode: "light" | "dark";
}

export interface Schedule {
  from?: string;
  to?: string;
}

/** Ζώνες της σελίδας: top = πάνω από το hero · main = κάτω από το hero · bottom = πριν τον κατάλογο της μάρκας */
export type Zone = "top" | "main" | "bottom";
export const ZONES: { key: Zone; label: string; help: string }[] = [
  { key: "top", label: "Πάνω από το hero", help: "Λεπτές λωρίδες: ανακοίνωση, αντίστροφη μέτρηση, πλεονεκτήματα." },
  { key: "main", label: "Κύρια ροή", help: "Ακριβώς κάτω από το hero — το κυρίως περιεχόμενο." },
  { key: "bottom", label: "Πριν τον κατάλογο", help: "Στο τέλος, πριν το «Όλα τα προϊόντα» — FAQ, εγγύηση, κάλεσμα σε δράση." },
];
export type TechIcon = "cpu" | "eye" | "zap" | "wifi" | "shield" | "sparkles" | "leaf" | "camera";
export type Cta = { label: string; href: string };
export type AutoSource = "newest" | "offers" | "top" | "value" | "in-stock";

interface BlockBase {
  id: string;
  enabled?: boolean;
  schedule?: Schedule;
  /** σε ποια ζώνη της σελίδας (προεπιλογή: main) */
  zone?: Zone;
  /** optional editorial title/kicker override for the block */
  kicker?: string;
  title?: string;
}

export type BrandBlock =
  | (BlockBase & { type: "new-arrivals"; productIds: string[]; lead?: string })
  | (BlockBase & { type: "series"; items: { name: string; blurb: string; image: string; productIds: string[]; href?: string }[] })
  | (BlockBase & { type: "offers"; productIds: string[]; endsAt: string })
  | (BlockBase & { type: "story"; image: string; body: string; cta?: { label: string; href: string }; align?: "left" | "right" })
  | (BlockBase & { type: "tech"; items: { icon: TechIcon; title: string; blurb: string }[] })
  | (BlockBase & { type: "support"; facts: string[]; askAris?: string[] })
  | (BlockBase & { type: "video"; src: string; poster: string; caption?: string })
  // ---- δυναμικά components (Περιεχόμενο → Σελίδες μαρκών) ----
  | (BlockBase & { type: "announcement"; text: string; href?: string; endsAt?: string })
  | (BlockBase & { type: "usp"; items: { icon: TechIcon; text: string }[] })
  | (BlockBase & { type: "banner"; image: string; imageMobile?: string; body?: string; cta?: Cta; align?: "left" | "center" | "right"; overlay?: "dark" | "light" | "none"; height?: "s" | "m" | "l" })
  | (BlockBase & { type: "products-auto"; source: AutoSource; categoryId?: string; categoryName?: string; limit: number; cta?: Cta })
  | (BlockBase & { type: "categories"; mode: "auto" | "manual"; items?: { id: string; name: string; image?: string }[]; limit?: number })
  | (BlockBase & { type: "faq"; items: { q: string; a: string }[] })
  | (BlockBase & { type: "text"; body: string; align?: "left" | "center" })
  | (BlockBase & { type: "gallery"; images: { src: string; caption?: string; href?: string }[]; layout?: "grid" | "mosaic" })
  | (BlockBase & { type: "cta"; body?: string; primary: Cta; secondary?: Cta });

export interface BrandStore {
  slug: string;
  name: string;
  /** wordmark shown in the hero and the strip (text until the official asset is licensed) */
  wordmark: string;
  /** optional official logo (Media library ή hotlink Brandfetch) — αν υπάρχει, αντικαθιστά το wordmark κειμένου */
  logo?: string;
  /** επίσημο site της μάρκας — από εκεί προτείνεται το στυλ (Περιεχόμενο → Brand stores) */
  website?: string;
  tagline: string;
  theme: BrandTheme;
  hero: {
    kicker: string;
    title: string[];
    body: string;
    cta: { label: string; href: string };
    /** product whose cutout floats in the hero */
    productId: string;
    /** optional key visual behind everything (dimmed) */
    image?: string;
    video?: string;
  };
  blocks: BrandBlock[];
  /** SEO */
  seo: { title: string; description: string };
}

const BLOCK_TYPES = new Set(["new-arrivals", "series", "offers", "story", "tech", "support", "video", "announcement", "usp", "banner", "products-auto", "categories", "faq", "text", "gallery", "cta"]);

/** Cheap structural validation for CMS payloads: returns a list of problems (empty = ok). */
export function validateBrandStore(s: BrandStore): string[] {
  const errs: string[] = [];
  if (!s.slug) errs.push("slug missing");
  if (!s.hero?.productId) errs.push("hero.productId missing");
  for (const k of ["bg", "bg2", "ink", "muted", "accent", "accentInk"] as const) if (!/^#([0-9a-f]{3}){1,2}$/i.test(s.theme?.[k] ?? "")) errs.push(`theme.${k} must be a hex colour`);
  s.blocks?.forEach((b, i) => {
    if (!BLOCK_TYPES.has(b.type)) errs.push(`blocks[${i}]: unknown type ${String((b as { type: string }).type)}`);
    if (!b.id) errs.push(`blocks[${i}]: id missing`);
    if ("productIds" in b && !Array.isArray(b.productIds)) errs.push(`blocks[${i}]: productIds must be an array`);
  });
  return errs;
}

export function blockActive(b: BrandBlock, now = new Date()): boolean {
  if (b.enabled === false) return false;
  if (b.schedule?.from && new Date(b.schedule.from) > now) return false;
  if (b.schedule?.to && new Date(b.schedule.to) < now) return false;
  return true;
}
