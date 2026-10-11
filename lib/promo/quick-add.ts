import "server-only";
import { db } from "@/lib/db";
import { matches } from "./engine";
import { nextTargets } from "./targets";
import { draftOf, savePromotion } from "./admin";
import { STATUS_LABEL, describePromo, type PromoStatus } from "./catalog";

/**
 * Γρήγορη προσθήκη / αφαίρεση ενός προϊόντος σε υπάρχουσα προσφορά (από το μενού Ενέργειες του καταλόγου). Περνά από
 * την ίδια αποθήκευση με τον οδηγό (savePromotion): επικύρωση, εκδόσεις, έγκριση όπου χρειάζεται, ανανέωση βιτρίνας.
 */
const OPEN: PromoStatus[] = ["active", "scheduled", "paused", "pending", "draft"];

async function lineOf(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true, price: true, brandId: true, categoryId: true, variants: { select: { id: true }, take: 1 } } });
  if (!p) return null;
  const cats = await db.category.findMany({ select: { id: true, parentId: true } });
  const parent = new Map(cats.map((c) => [c.id, c.parentId]));
  const chain: string[] = [];
  for (let c: string | null | undefined = p.categoryId, g = 0; c && g < 8; c = parent.get(c), g++) chain.push(c);
  return { p, line: { productId: p.id, variantId: p.variants[0]?.id ?? "", brandId: p.brandId, categoryIds: chain } };
}

export type PromoChoice = {
  id: string; code: string; name: string; status: string; statusLabel: string; tone: string; mechanism: string; text: string;
  startsAt: string | null; endsAt: string | null;
  /** ήδη ισχύει για το προϊόν */
  inScope: boolean;
  /** όλα τα προϊόντα (χωρίς στόχους) */
  all: boolean;
  /** ειδική τιμή: χρειάζεται τιμή για το προϊόν (σε €) */
  needsPrice: boolean; price: number | null;
  /** δεν αλλάζει από εδώ (πακέτο κ.λπ.) */
  locked: string | null;
};

/** Οι ανοιχτές προσφορές με το αν ισχύουν ήδη για το προϊόν — ενεργές πρώτα. */
export async function promoChoices(productId: string): Promise<{ product: { title: string; price: number | null }; promos: PromoChoice[] } | null> {
  const l = await lineOf(productId);
  if (!l) return null;
  const rows = await db.promotion.findMany({ where: { status: { in: OPEN } }, include: { targets: true }, orderBy: [{ updatedAt: "desc" }], take: 300 });
  const rank: Record<string, number> = { active: 0, scheduled: 1, pending: 2, paused: 3, draft: 4 };
  const promos = rows.map((x): PromoChoice => {
    const reward = (x.reward ?? {}) as { price?: Record<string, number> };
    const special = x.mechanism === "special-price";
    const sp = special ? reward.price?.[l.p.id] ?? reward.price?.[l.line.variantId] ?? null : null;
    const t = x.targets.map((y) => ({ kind: y.kind as "product", refId: y.refId, exclude: y.exclude }));
    const all = !special && !t.some((y) => !y.exclude);
    const st = STATUS_LABEL[x.status as PromoStatus];
    return {
      id: x.id, code: x.code, name: x.name, status: x.status, statusLabel: st?.label ?? x.status, tone: st?.tone ?? "", mechanism: x.mechanism,
      text: describePromo({ mechanism: x.mechanism, reward: x.reward as never, rules: x.rules as never }),
      startsAt: x.startsAt?.toISOString() ?? null, endsAt: x.endsAt?.toISOString() ?? null,
      inScope: special ? sp != null : matches({ targets: t }, l.line), all,
      needsPrice: special, price: sp != null ? sp / 100 : null,
      locked: x.mechanism === "bundle" ? "Πακέτο: τα προϊόντα αλλάζουν στον οδηγό." : null,
    };
  }).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  return { product: { title: l.p.title, price: l.p.price }, promos };
}

/** Προσθήκη (ή, με remove, αφαίρεση) του προϊόντος σε προσφορά. Η τιμή για ειδική τιμή σε € με ΦΠΑ. */
export async function setProductInPromo(productId: string, promoId: string, opts: { remove?: boolean; price?: number | null }, staff: { id: string; canApprove: boolean }) {
  const l = await lineOf(productId);
  if (!l) return { ok: false as const, error: "Το προϊόν δεν βρέθηκε." };
  const row = await db.promotion.findUnique({ where: { id: promoId }, include: { targets: true, coupons: true } });
  if (!row || !OPEN.includes(row.status as PromoStatus)) return { ok: false as const, error: "Η προσφορά δεν είναι ανοιχτή για αλλαγές." };
  if (row.mechanism === "bundle") return { ok: false as const, error: "Τα προϊόντα ενός πακέτου αλλάζουν από τον οδηγό." };
  const d = draftOf(row);
  const pid = l.p.id;
  if (row.mechanism === "special-price") {
    const prices = { ...(d.reward.price ?? {}) };
    delete prices[l.line.variantId];
    if (opts.remove) delete prices[pid];
    else {
      const eur = Number(opts.price);
      if (!Number.isFinite(eur) || eur <= 0) return { ok: false as const, error: "Γράψε την ειδική τιμή (με ΦΠΑ)." };
      if (l.p.price != null && eur >= l.p.price) return { ok: false as const, error: `Η ειδική τιμή πρέπει να είναι κάτω από την τρέχουσα (${l.p.price.toLocaleString("el-GR")} €).` };
      prices[pid] = Math.round(eur * 100);
    }
    d.reward = { ...d.reward, price: prices };
  } else {
    d.targets = nextTargets(d.targets, l.line, !!opts.remove);
  }
  const intent = row.status === "draft" ? "draft" : "publish";
  const r = await savePromotion(d, staff, intent);
  if (!r.ok) return { ok: false as const, error: (r.errors ?? ["Η αποθήκευση απέτυχε."]).join(" ") };
  const pending = "pendingChange" in r && r.pendingChange;
  return { ok: true as const, status: r.status, pending: !!pending || r.status === "pending", message: `${opts.remove ? "Αφαιρέθηκε από" : "Μπήκε στην"} «${row.name}»${pending ? ": η αλλαγή περιμένει έγκριση από δεύτερο πρόσωπο" : r.status === "draft" ? " (προσχέδιο)" : ""}.` };
}
