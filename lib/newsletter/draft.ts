import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LISTED } from "@/lib/data/db-catalog";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { autoLabel } from "@/lib/promo/catalog";
import { promotionProductIds } from "@/lib/promo/landing";
import type { Block as LandingBlock } from "@/lib/promo/landing-blocks";
import type { PromoReward } from "@/lib/promo/engine";
import { contentHash, factCheck, isTestMode, type Block } from "./core";
import { LIMITS, type CopyField } from "./edit";
import type { NewsletterProduct } from "./render";

/**
 * Αυτόματο πρόχειρο newsletter από προσφορά ή καμπάνια: hero, εισαγωγή, προϊόντα, κουμπί.
 * Το κείμενο το γράφει το AI μόνο από τα στοιχεία της προσφοράς (`newsletterFacts`)· ό,τι αριθμό/ημερομηνία
 * δεν προκύπτει από αυτά (`factCheck`) αντικαθίσταται από σταθερό πρότυπο. Χωρίς AI → όλα πρότυπα.
 */

export type { CopyField };
export type Copy = Record<CopyField, string>;
/** Όρια χαρακτήρων ανά πεδίο (spec §4) — κοινά με τους μετρητές του editor (lib/newsletter/edit.ts). */
export { LIMITS };

const DEFAULT_PRODUCTS = 6;
/** Υποψήφια προϊόντα ανά προσφορά πριν το φιλτράρισμα ορατότητας. */
const CANDIDATES = 24;

// ---- μορφοποίηση ----

const athens = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric" });
/** dd/mm/yyyy σε ώρα Ελλάδας. */
export function dateEl(d: Date): string {
  const p = Object.fromEntries(athens.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}`;
}
const money = (n: number) => `${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const cents = (c: number) => `${(c / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })} €`;

/** Κόψιμο στο όριο, σε όριο λέξης όπου γίνεται, χωρίς κρεμασμένη στίξη. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, "");
}

// ---- προϊόντα ----

/**
 * Κάρτες προϊόντων για το email (ίδιο σχήμα με το `products` του renderNewsletter). Μόνο ό,τι φαίνεται στο site
 * (`LISTED`), με τιμή από ProductOffer, αλλιώς Product.price· χωρίς θετική τιμή παραλείπεται. Η σειρά των ids διατηρείται.
 */
export async function productCards(ids: string[]): Promise<Map<string, NewsletterProduct>> {
  const out = new Map<string, NewsletterProduct>();
  if (!ids.length) return out;
  const rows = await db.product.findMany({
    where: { AND: [LISTED, { id: { in: ids } }] },
    select: {
      id: true, slug: true, title: true, price: true,
      brand: { select: { name: true } },
      media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } },
      offer: { select: { price: true, listPrice: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || out.has(id)) continue;
    const offer = r.offer && Number(r.offer.price) > 0 ? r.offer : null;
    const price = offer ? Number(offer.price) : r.price ?? 0;
    if (!(price > 0)) continue;
    const list = offer ? Number(offer.listPrice) : 0;
    out.set(id, { title: r.title, brand: r.brand.name, image: r.media[0]?.url ?? null, href: `/proion/${r.slug}`, price, listPrice: list > price ? list : null });
  }
  return out;
}

/** Τα πρώτα `count` ορατά προϊόντα των προσφορών, με τη σειρά τους (έκπτωση φθίνουσα ανά προσφορά), χωρίς διπλά. */
async function pickProducts(promotionIds: string[], count = DEFAULT_PRODUCTS): Promise<string[]> {
  const lists = await Promise.all(promotionIds.map((id) => promotionProductIds(id, CANDIDATES, "discount")));
  const ids = [...new Set(lists.flat())];
  if (!ids.length) return [];
  return [...(await productCards(ids)).keys()].slice(0, count);
}

// ---- προσφορές / καμπάνιες ----

const promoSelect = { id: true, code: true, name: true, mechanism: true, reward: true, rules: true, tagLabel: true, endsAt: true, termsText: true, campaignId: true, status: true } as const;
type PromoRow = Prisma.PromotionGetPayload<{ select: typeof promoSelect }>;

const labelOf = (p: PromoRow) => autoLabel({ mechanism: p.mechanism, reward: (p.reward ?? {}) as PromoReward, tagLabel: p.tagLabel, name: p.name, rules: p.rules } as Parameters<typeof autoLabel>[0]);

/** Καμπάνια: μόνο προσφορές που ισχύουν ή θα ισχύσουν (όχι πρόχειρες / σε παύση / ανενεργές) — αλλιώς το newsletter διαφημίζει έκπτωση που δεν υπάρχει. */
const LIVE_STATUSES = ["scheduled", "active"];

type Source = { kind: "promotion" | "campaign"; name: string; endsAt: Date | null; promos: PromoRow[]; campaignId: string | null; promotionId: string | null };

async function loadSource(n: { promotionId?: string | null; campaignId?: string | null }): Promise<Source | null> {
  if (n.campaignId) {
    const c = await db.campaign.findUnique({ where: { id: n.campaignId }, select: { id: true, title: true, endsAt: true, promotions: { where: { status: { in: LIVE_STATUSES }, held: false }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], select: promoSelect } } });
    return c ? { kind: "campaign", name: c.title, endsAt: c.endsAt, promos: c.promotions, campaignId: c.id, promotionId: null } : null;
  }
  if (n.promotionId) {
    const p = await db.promotion.findUnique({ where: { id: n.promotionId }, select: promoSelect });
    return p ? { kind: "promotion", name: p.name, endsAt: p.endsAt, promos: [p], campaignId: p.campaignId, promotionId: p.id } : null;
  }
  return null;
}

/**
 * Τα στοιχεία που επιτρέπεται να χρησιμοποιήσει το κείμενο: όνομα, μηχανισμός (autoLabel), ποσοστά/ποσά, λήξη dd/mm/yyyy,
 * όροι, τίτλοι και τιμές προϊόντων. Κάθε γραμμή έχει πρόθεμα (Καμπάνια / Προσφορά / Μηχανισμός / Λήξη…) που διαβάζει το `templateCopy`.
 */
export async function newsletterFacts(n: { promotionId?: string | null; campaignId?: string | null; blocks?: Block[] }): Promise<string[]> {
  const src = await loadSource(n);
  if (!src) return [];
  const facts: string[] = [];
  if (src.kind === "campaign") {
    facts.push(`Καμπάνια: ${src.name}`);
    facts.push(`Λήξη: ${dateEl(src.endsAt!)}`);
  }
  for (const p of src.promos) {
    const r = (p.reward ?? {}) as PromoReward;
    const rules = (p.rules ?? {}) as { minValue?: number; minQty?: number };
    facts.push(`Προσφορά: ${p.name}`, `Μηχανισμός: ${labelOf(p)}`);
    if (r.percent != null) facts.push(`Ποσοστό: ${r.percent}%`);
    if (r.amount != null) facts.push(`Ποσό: ${cents(r.amount)}`);
    for (const t of r.tiers ?? []) facts.push(`Ποσοστό: ${t.percent}% από ${t.minQty} τεμάχια`);
    if (r.bundlePrice != null) facts.push(`Τιμή πακέτου: ${cents(r.bundlePrice)}`);
    if (rules.minValue) facts.push(`Ελάχιστη αξία αγορών: ${cents(rules.minValue)}`);
    if (p.endsAt) facts.push(`Λήξη: ${dateEl(p.endsAt)}`);
    if (p.termsText?.trim()) facts.push(`Όροι: ${clip(p.termsText, 800)}`);
  }
  const ids = (n.blocks ?? []).flatMap((b) => (b.type === "products" ? b.ids : []));
  for (const it of (await productCards(ids)).values()) facts.push(`Προϊόν: ${it.brand} ${it.title} — ${money(it.price)}${it.listPrice ? ` (αντί ${money(it.listPrice)})` : ""}`);
  return facts;
}

// ---- κείμενα ----

const factOf = (facts: string[], prefix: string) => facts.find((f) => f.startsWith(`${prefix}: `))?.slice(prefix.length + 2).trim() ?? "";

/** Σταθερά πρότυπα (και εφεδρεία του AI). Διαβάζουν μόνο τα facts, άρα περνούν πάντα τον έλεγχο γεγονότων. */
export function templateCopy(facts: string[]): Copy {
  const campaign = factOf(facts, "Καμπάνια");
  const name = campaign || factOf(facts, "Προσφορά") || "Προσφορά euronics.gr";
  const label = factOf(facts, "Μηχανισμός");
  const head = campaign || label || name;
  const end = factOf(facts, "Λήξη").match(/^(\d{2}\/\d{2})\/\d{4}$/)?.[1] ?? "";
  const subject = end ? `${clip(head, LIMITS.subject - ` — έως ${end}`.length)} — έως ${end}` : clip(name, LIMITS.subject);
  const intro = `${campaign ? "Καμπάνια" : "Προσφορά"} «${name}»${label && label !== name && !campaign ? `: ${label}` : ""}${end ? `, έως ${end}` : ""}. Δείτε τα προϊόντα και επιλέξτε αυτό που σας ταιριάζει.`;
  return { subject, preheader: clip(`${name}: δείτε τα προϊόντα της προσφοράς.`, LIMITS.preheader), intro: clip(intro, LIMITS.intro), cta: "Δείτε την προσφορά" };
}

const SYSTEM = `Γράφεις το κείμενο ενός email προσφοράς για το euronics.gr, σοβαρού λιανέμπορου ηλεκτρικών ειδών. Ελληνικά, ουδέτερος και καθαρός τόνος, χωρίς υπερβολές, χωρίς θαυμαστικά και επιφωνήματα, χωρίς emoji, χωρίς «μοναδική ευκαιρία» και παρόμοια.
Χρησιμοποίησε ΜΟΝΟ τα στοιχεία που σου δίνονται. Μην επινοήσεις ποσοστά, τιμές, ημερομηνίες, δώρα ή όρους που δεν αναφέρονται.
Απάντησε μόνο με JSON: {"subject": θέμα email έως ${LIMITS.subject} χαρακτήρες, "preheader": έως ${LIMITS.preheader}, "intro": εισαγωγή 2-3 προτάσεις έως ${LIMITS.intro}, "cta": κείμενο κουμπιού έως ${LIMITS.cta}}.`;

/**
 * Θέμα / preheader / εισαγωγή / κουμπί από AI, με έλεγχο ορίων και γεγονότων ανά πεδίο· το πεδίο που αποτυγχάνει παίρνει το πρότυπο.
 * Με `field` ξαναγράφεται μόνο εκείνο (τα υπόλοιπα επιστρέφουν ως πρότυπα). Χωρίς AI / πάνω από το όριο / σφάλμα → όλα πρότυπα.
 */
export async function aiCopy(facts: string[], field?: CopyField): Promise<Copy> {
  const tpl = templateCopy(facts);
  try {
    const cfg = await getAi();
    if (!cfg || (await overBudget(cfg))) return tpl;
    const r = await chat({
      feature: "newsletter",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ στοιχεία: facts, ...(field ? { ζητούμενο: field } : {}) }) },
      ],
      json: true,
      reasoning: "low",
      maxTokens: 600,
    });
    const j = parseJson<Partial<Record<CopyField, unknown>>>(r.text);
    if (!j) return tpl;
    const out: Copy = { ...tpl };
    for (const k of Object.keys(LIMITS) as CopyField[]) {
      if (field && k !== field) continue;
      const raw = typeof j[k] === "string" ? clip(j[k] as string, LIMITS[k]) : "";
      if (raw && factCheck(raw, facts)) out[k] = raw;
    }
    return out;
  } catch {
    return tpl;
  }
}

// ---- hero / σύνδεσμοι ----

const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);

/** Εικόνα + σύνδεσμος: πρώτα η published landing (εικόνα από το hero της), αλλιώς ενεργή διαφημιστική θέση με εικόνα. */
async function heroTarget(src: Source): Promise<{ image: string | null; href: string }> {
  const promoIds = src.promos.map((p) => p.id);
  // η landing της ίδιας της προσφοράς/καμπάνιας προηγείται, μετά του «γονιού» ή των παιδιών της
  const scopes: Prisma.LandingPageWhereInput[] = src.kind === "campaign"
    ? [{ campaignId: src.campaignId }, { promotionId: { in: promoIds } }]
    : [{ promotionId: src.promotionId }, ...(src.campaignId ? [{ campaignId: src.campaignId }] : [])];
  let href = "/prosfores", image: string | null = null;
  for (const where of scopes) {
    const page = await db.landingPage.findFirst({ where: { ...where, status: "published" }, orderBy: { createdAt: "asc" }, select: { slug: true, blocks: true } });
    if (!page) continue;
    href = `/prosfores/${page.slug}`;
    const hero = ((page.blocks as unknown as LandingBlock[]) ?? []).find((b) => b.type === "hero");
    image = hero && hero.type === "hero" ? clean(hero.props.image) : null;
    break;
  }
  if (!image) {
    const now = new Date();
    const ad = await db.adPlacement.findFirst({
      where: {
        status: "active", image: { not: null }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        OR: [...(src.campaignId ? [{ campaignId: src.campaignId }] : []), { promotionId: { in: promoIds } }],
      },
      orderBy: { priority: "asc" }, select: { image: true },
    });
    image = clean(ad?.image);
  }
  return { image, href };
}

// ---- πρόχειρο ----

async function createDraft(src: Source, staffId: string): Promise<{ id: string }> {
  const [productIds, hero] = await Promise.all([pickProducts(src.promos.map((p) => p.id)), heroTarget(src)]);
  const blocks0: Block[] = [{ type: "products", ids: productIds }];
  const facts = await newsletterFacts({ promotionId: src.promotionId, campaignId: src.campaignId && src.kind === "campaign" ? src.campaignId : null, blocks: blocks0 });
  const copy = await aiCopy(facts);
  const label = factOf(facts, "Μηχανισμός");
  const end = src.endsAt ? `Ισχύει έως ${dateEl(src.endsAt)}` : "";
  const sub = [src.kind === "promotion" && label && label !== src.name ? label : "", end].filter(Boolean).join(" · ");
  const blocks: Block[] = [
    { type: "hero", image: hero.image, alt: src.name, href: hero.href, headline: src.name, sub },
    { type: "text", body: copy.intro },
    ...(productIds.length ? [blocks0[0]] : []),
    { type: "cta", label: copy.cta, href: hero.href },
  ];
  const n = await db.newsletter.create({
    data: {
      title: `Newsletter · ${src.name}`,
      promotionId: src.kind === "promotion" ? src.promotionId : null,
      campaignId: src.kind === "campaign" ? src.campaignId : null,
      subject: copy.subject,
      preheader: copy.preheader,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      audience: {},
      status: "draft",
      contentHash: contentHash({ subject: copy.subject, preheader: copy.preheader, blocks }),
      createdById: staffId,
      testMode: isTestMode(null), // φτιάχτηκε σε λειτουργία δοκιμής → κάθε αποστολή του μόνο με o:testmode
      log: [],
    },
    select: { id: true },
  });
  return { id: n.id };
}

export async function draftFromPromotion(promotionId: string, staffId: string): Promise<{ id: string }> {
  const src = await loadSource({ promotionId });
  if (!src) throw new Error("Η προσφορά δεν βρέθηκε.");
  return createDraft(src, staffId);
}

export async function draftFromCampaign(campaignId: string, staffId: string): Promise<{ id: string }> {
  const src = await loadSource({ campaignId });
  if (!src) throw new Error("Η καμπάνια δεν βρέθηκε.");
  return createDraft(src, staffId);
}
