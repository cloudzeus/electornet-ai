import "server-only";
import { db } from "@/lib/db";
import { BLOCK_INFO } from "@/lib/cms/blocks-catalog";
import { SLOTS } from "@/lib/promo/landing-blocks";

/**
 * «Πού εμφανίζεται» μια προσφορά: αντίστροφη αναζήτηση σε όσα την αναφέρουν ρητά —
 *  - blocks στις ζώνες της αρχικής, των σελίδων μαρκών και των πληροφοριακών σελίδων (CmsDocument, δημοσιευμένο και πρόχειρο)
 *  - landing pages (LandingPage.promotionId) και διαφημιστικές θέσεις (AdPlacement.promotionId)
 * Τα αυτόματα σημεία (κάρτες προϊόντων, /prosfores, «Προϊόντα σε προσφορά») δεν χρειάζονται αναφορά και δεν είναι εδώ.
 */
export type Appearance = {
  kind: "zone" | "landing" | "ad";
  /** πού (π.χ. «Αρχική», «Σελίδα μάρκας samsung») */
  place: string;
  /** τι (π.χ. «Προϊόντα προσφοράς», «Banner · Αρχική λωρίδα») */
  what: string;
  /** φαίνεται τώρα στους πελάτες (δημοσιευμένο / ενεργό) */
  live: boolean;
  /** πού το αλλάζεις στη διαχείριση */
  href: string;
};

const COLLECTIONS = ["home.layout", "brand.stores", "page.zones"] as const;
const SECTION_LABEL: Record<string, string> = { "deals-rail": "Προσφορές της εβδομάδας", "hero-slides": "Hero" };

function placeOf(collection: string, key: string): { place: string; href: string } {
  if (collection === "home.layout") return { place: "Αρχική", href: "/admin/cms/home" };
  if (collection === "brand.stores") return { place: `Σελίδα μάρκας · ${key}`, href: `/admin/cms/brand-stores/${key}` };
  return { place: `Σελίδα · ${key}`, href: `/admin/cms/pages/${key}` };
}

/** Κάθε αναφορά σε promotionId μέσα σε ένα JSON, με τον τύπο του κοντινότερου block/ενότητας. */
function scan(node: unknown, out: Map<string, string>, type = "") {
  if (Array.isArray(node)) { for (const x of node) scan(x, out, type); return; }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const t = typeof o.type === "string" ? o.type : type;
  const id = o.promotionId;
  // πηγή άλλη από «προσφορά» (π.χ. αυτόματα / συγκεκριμένο προϊόν): το promotionId είναι υπόλειμμα, όχι εμφάνιση
  if (typeof id === "string" && id && (o.source === undefined || o.source === "promotion")) {
    if (!out.has(id)) out.set(id, BLOCK_INFO[t as keyof typeof BLOCK_INFO]?.label ?? SECTION_LABEL[t] ?? "Block");
  }
  for (const [k, v] of Object.entries(o)) if (k !== "promotionId" && v && typeof v === "object") scan(v, out, t);
}

/** Όλες οι εμφανίσεις όλων των προσφορών (ή μόνο των `ids`). */
export async function promoAppearances(ids?: string[]): Promise<Map<string, Appearance[]>> {
  const only = ids ? new Set(ids) : null;
  const [docs, landings, ads] = await Promise.all([
    db.cmsDocument.findMany({ where: { collection: { in: [...COLLECTIONS] }, NOT: { key: "plans" } }, select: { collection: true, key: true, data: true, published: true } }),
    db.landingPage.findMany({ where: { promotionId: ids ? { in: ids } : { not: null }, status: { not: "archived" } }, select: { id: true, title: true, slug: true, status: true, promotionId: true } }),
    db.adPlacement.findMany({ where: { promotionId: ids ? { in: ids } : { not: null }, status: { not: "archived" } }, select: { id: true, title: true, slot: true, status: true, promotionId: true } }),
  ]);
  const map = new Map<string, Appearance[]>();
  const push = (id: string, a: Appearance) => { if (only && !only.has(id)) return; map.set(id, [...(map.get(id) ?? []), a]); };

  for (const d of docs) {
    const pub = new Map<string, string>(), draft = new Map<string, string>();
    scan(d.published, pub);
    scan(d.data, draft);
    const { place, href } = placeOf(d.collection, d.key);
    for (const [id, what] of pub) push(id, { kind: "zone", place, what, live: true, href });
    for (const [id, what] of draft) if (!pub.has(id)) push(id, { kind: "zone", place, what: `${what} (πρόχειρο)`, live: false, href });
  }
  for (const l of landings) push(l.promotionId!, { kind: "landing", place: `Landing page · /prosfores/${l.slug}`, what: l.title, live: l.status === "published", href: `/admin/prosfores/selides/${l.id}` });
  for (const a of ads) push(a.promotionId!, { kind: "ad", place: SLOTS.find((s) => s.key === a.slot)?.label ?? a.slot, what: `Banner · ${a.title}`, live: a.status === "active", href: "/admin/prosfores/theseis" });
  return map;
}
