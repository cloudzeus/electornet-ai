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

interface BlockBase {
  id: string;
  enabled?: boolean;
  schedule?: Schedule;
  /** optional editorial title/kicker override for the block */
  kicker?: string;
  title?: string;
}

export type BrandBlock =
  | (BlockBase & { type: "new-arrivals"; productIds: string[]; lead?: string })
  | (BlockBase & { type: "series"; items: { name: string; blurb: string; image: string; productIds: string[]; href?: string }[] })
  | (BlockBase & { type: "offers"; productIds: string[]; endsAt: string })
  | (BlockBase & { type: "story"; image: string; body: string; cta?: { label: string; href: string }; align?: "left" | "right" })
  | (BlockBase & { type: "tech"; items: { icon: "cpu" | "eye" | "zap" | "wifi" | "shield" | "sparkles" | "leaf" | "camera"; title: string; blurb: string }[] })
  | (BlockBase & { type: "support"; facts: string[]; askAris?: string[] })
  | (BlockBase & { type: "video"; src: string; poster: string; caption?: string });

export interface BrandStore {
  slug: string;
  name: string;
  /** wordmark shown in the hero and the strip (text until the official asset is licensed) */
  wordmark: string;
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

const BLOCK_TYPES = new Set(["new-arrivals", "series", "offers", "story", "tech", "support", "video"]);

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
