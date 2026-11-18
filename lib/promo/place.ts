import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { newBlock } from "@/lib/cms/blocks-catalog";
import { HOME_SECTIONS, TOP_ZONE, afterZone, defaultHomeDoc, normalizeHomeDoc, type HomeDoc } from "@/lib/cms/home-sections";
import { resetPublishedHome } from "@/lib/cms/home-store";

/**
 * «Βάλε την προσφορά στην αρχική» με ένα πάτημα, χωρίς να ανοίξει ο editor της αρχικής. Δύο είδη σημείων:
 * η ενότητα «Προσφορές της εβδομάδας» (μία προσφορά τη φορά) ή νέα σειρά «Προϊόντα προσφοράς» κάτω από μια ενότητα.
 * Η αλλαγή γράφεται ΜΟΝΟ για αυτή την προσφορά, και στο πρόχειρο και (με δικαίωμα δημοσίευσης) στη ζωντανή αρχική —
 * έτσι δεν δημοσιεύονται μαζί της άσχετες πρόχειρες αλλαγές άλλων.
 */
const where = { collection_key_locale: { collection: "home.layout", key: "home", locale: "el" } };
const DEALS = "deals";
const OWN = new Set(["promo-products", "countdown", "deal-hero"]);

export interface HomeSpot { key: string; label: string; /** η προσφορά είναι ήδη εδώ (στη ζωντανή αρχική) */ here: boolean; /** εδώ είναι τώρα άλλη προσφορά (μόνο στην ενότητα προσφορών) */ taken?: string | null }

const dealsOf = (d: HomeDoc) => (d.sections.find((s) => s.id === DEALS)?.props ?? {}) as { source?: string; promotionId?: string };
const hasBlock = (d: HomeDoc, id: string, zone: string) => d.blocks.some((b) => OWN.has(b.type) && (b as { promotionId?: string }).promotionId === id && (b.zone ?? TOP_ZONE) === zone);

async function docs() {
  const d = await db.cmsDocument.findUnique({ where });
  const published = d?.published ? normalizeHomeDoc(d.published) : defaultHomeDoc();
  return { draft: d?.data ? normalizeHomeDoc(d.data) : published, published };
}

/** Τα σημεία της αρχικής όπου μπορεί να μπει η προσφορά, με το τι υπάρχει εκεί τώρα. */
export async function homeSpots(promotionId: string): Promise<HomeSpot[]> {
  const { published } = await docs();
  const deals = dealsOf(published);
  const other = deals.source === "promotion" && deals.promotionId && deals.promotionId !== promotionId ? (await db.promotion.findUnique({ where: { id: deals.promotionId }, select: { name: true } }))?.name ?? null : null;
  return [
    { key: DEALS, label: "Ενότητα «Προσφορές της εβδομάδας»", here: deals.source === "promotion" && deals.promotionId === promotionId, taken: other },
    { key: TOP_ZONE, label: "Νέα σειρά στην κορυφή της αρχικής", here: hasBlock(published, promotionId, TOP_ZONE) },
    ...HOME_SECTIONS.map((s) => ({ key: afterZone(s.id), label: `Νέα σειρά κάτω από «${s.label}»`, here: hasBlock(published, promotionId, afterZone(s.id)) })),
  ];
}

function put(doc: HomeDoc, promotionId: string, name: string, spot: string): HomeDoc {
  if (spot === DEALS) return { ...doc, sections: doc.sections.map((s) => (s.id === DEALS ? { ...s, enabled: true, props: { ...s.props, source: "promotion", promotionId } } : s)) };
  if (hasBlock(doc, promotionId, spot)) return doc;
  return { ...doc, blocks: [...doc.blocks, { ...newBlock("promo-products", ""), zone: spot, promotionId, promotionName: name } as HomeDoc["blocks"][number]] };
}
function drop(doc: HomeDoc, promotionId: string): HomeDoc {
  return {
    sections: doc.sections.map((s) => (s.id === DEALS && dealsOf(doc).promotionId === promotionId ? { ...s, props: { ...s.props, source: "auto", promotionId: undefined } } : s)),
    blocks: doc.blocks.filter((b) => !(OWN.has(b.type) && (b as { promotionId?: string }).promotionId === promotionId)),
  };
}

async function write(change: (d: HomeDoc) => HomeDoc, by: string, publish: boolean) {
  const { draft, published } = await docs();
  const json = (d: HomeDoc) => normalizeHomeDoc(d) as unknown as Prisma.InputJsonValue;
  const data = json(change(draft));
  const live = publish ? { published: json(change(published)), publishedAt: new Date() } : {};
  await db.cmsDocument.upsert({ where, update: { data, ...live, updatedBy: by, version: { increment: 1 } }, create: { collection: "home.layout", key: "home", locale: "el", data, ...live, updatedBy: by } });
  if (publish) resetPublishedHome();
}

/** Βάζει την προσφορά στο σημείο. `publish=false` → μόνο στο πρόχειρο της αρχικής (θέλει δημοσίευση από όποιον έχει το δικαίωμα). */
export async function placeOnHome(promotionId: string, spot: string, by: string, publish: boolean) {
  const p = await db.promotion.findUnique({ where: { id: promotionId }, select: { name: true } });
  if (!p) return { ok: false as const, error: "Η προσφορά δεν βρέθηκε." };
  if (!(await homeSpots(promotionId)).some((s) => s.key === spot)) return { ok: false as const, error: "Άγνωστο σημείο της αρχικής." };
  await write((d) => put(d, promotionId, p.name, spot), by, publish);
  return { ok: true as const, live: publish };
}

/** Βγάζει την προσφορά από κάθε σημείο της αρχικής (η ενότητα προσφορών γυρίζει στο «αυτόματα»). */
export async function removeFromHome(promotionId: string, by: string, publish: boolean) {
  await write((d) => drop(d, promotionId), by, publish);
  return { ok: true as const, live: publish };
}
