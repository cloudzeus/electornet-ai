"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { applyManual, undoManual, writeBlocked } from "@/lib/competitors/bulk";
import { checkPrice, shownCost } from "@/lib/competitors/price-core";
import { liveCosts } from "@/lib/competitors/cost-cache";
import { fetchProduct } from "@/lib/competitors/kotsovolos/client";
import { createPacer } from "@/lib/competitors/kotsovolos/pacer";
import { kotHref, modelTokens, sameEan } from "@/lib/competitors/kotsovolos/core";

const COMP = "kotsovolos";
const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

export type PriceInfo = {
  title: string; web: number; final: number; vat: number; promo: string | null;
  theirs: number | null; match: string | null; extUrl: string | null;
  cost: number | null; costSource: string | null; blocked: string | null;
};

/** Φρέσκα στοιχεία για το παράθυρο «Αλλαγή τιμής» (τιμή web από τον καθρέφτη, κόστος αποθηκευμένο ή ζωντανό). */
export async function priceInfoAction(productId: string): Promise<{ ok: true; info: PriceInfo } | { ok: false; error: string }> {
  await requirePermission("catalog.sync.run");
  if (typeof productId !== "string") return { ok: false, error: "Άγνωστο προϊόν." };
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true, erpCode: true, price: true, vatRate: true, offer: { select: { price: true, promotionId: true } }, competitorPrices: { where: { competitor: COMP }, select: { match: true, extUrl: true, listPrice: true, offerPrice: true, cost: true, costSource: true } } } });
  if (!p || p.price == null || p.price <= 0) return { ok: false, error: "Το προϊόν δεν έχει τιμή web για να αλλάξει." };
  const c = p.competitorPrices[0];
  let cost = n(c?.cost), costSource = c?.costSource ?? null;
  if (cost == null) { const x = (await liveCosts([Number(p.erpCode)])).get(Number(p.erpCode)); if (x && shownCost(x, p.price, Number(p.vatRate))) { cost = x.cost; costSource = x.source; } }
  const pair = c && ["auto", "manual", "suggested", "variant"].includes(c.match);
  return { ok: true, info: {
    title: p.title, web: p.price, final: p.offer ? Number(p.offer.price) : p.price, vat: Number(p.vatRate), promo: p.offer?.promotionId ? "ενεργή προσφορά" : null,
    theirs: pair ? n(c.offerPrice) ?? n(c.listPrice) : null, match: c?.match ?? null, extUrl: pair ? c.extUrl : null,
    cost, costSource, blocked: await writeBlocked(),
  } };
}

/** Γράφει τη νέα τιμή web στο SoftOne. Κάτω από το κόστος ή μεγάλη μείωση: μόνο με `confirmed` (δεύτερο πάτημα). */
export async function changePriceAction(productId: string, input: string, expectWeb: number, confirmed: boolean): Promise<{ ok: true; batchId: string; value: number } | { ok: false; error: string; needConfirm?: true }> {
  const user = await requirePermission("catalog.sync.run");
  if (typeof productId !== "string" || typeof input !== "string" || typeof expectWeb !== "number") return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const info = await priceInfoAction(productId);
  if (!info.ok) return info;
  if (Math.abs(info.info.web - expectWeb) >= 0.005) return { ok: false, error: "Η τιμή άλλαξε στο μεταξύ — άνοιξε ξανά το παράθυρο." };
  const c = checkPrice(input, expectWeb, info.info.vat, info.info.cost);
  if (!c.ok) return c;
  if ((c.belowCost || c.bigDrop) && !confirmed) return { ok: false, error: c.belowCost ? "Κάτω από το κόστος αγοράς." : "Μεγάλη μείωση.", needConfirm: true };
  const r = await applyManual(productId, c.value, expectWeb, user.id);
  if (!r.ok) return r;
  return { ok: true, batchId: r.batchId, value: c.value };
}

export async function undoPriceAction(batchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  if (typeof batchId !== "string") return { ok: false, error: "Άγνωστη αλλαγή." };
  const r = await undoManual(batchId, user.id);
  return r;
}

export type CheckSide = { title: string; code: string | null; ean: string | null; energy: string | null; price: number | null };
export type KotCheck = { ours: CheckSide; theirs: CheckSide & { url: string | null; art: string; available: boolean }; match: string; note: string | null; same: { code: boolean | null; ean: boolean | null; energy: boolean | null } };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** «Έλεγχος Κωτσόβολου»: τα δύο προϊόντα δίπλα-δίπλα, με μία ζωντανή ανάγνωση του είδους του Κωτσόβολου. */
export async function kotCheckAction(productId: string): Promise<{ ok: true; check: KotCheck } | { ok: false; error: string }> {
  await requirePermission("catalog.products.write");
  if (typeof productId !== "string") return { ok: false, error: "Άγνωστο προϊόν." };
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true, modelCode: true, ean: true, price: true, offer: { select: { price: true } }, energy: { select: { class: true } }, competitorPrices: { where: { competitor: COMP } } } });
  const row = p?.competitorPrices[0];
  if (!p || !row?.extId) return { ok: false, error: "Δεν υπάρχει πρόταση ζευγαριού για έλεγχο." };
  const pacer = createPacer({ budget: 1, until: new Date(Date.now() + 60_000), sleep: async () => {} });
  const r = await fetchProduct(row.extId, pacer).catch((e: Error) => ({ error: e.message }));
  const live = "error" in r ? null : r;
  const ourCodes = [p.modelCode, ...modelTokens(p.title)].filter((x): x is string => !!x).map(norm);
  const code = live?.supplierCodes.length ? live.supplierCodes.find((s) => ourCodes.includes(norm(s))) ?? live.supplierCodes[0] : null;
  const ourEnergy = p.energy?.class ?? null;
  return { ok: true, check: {
    ours: { title: p.title, code: p.modelCode, ean: p.ean, energy: ourEnergy, price: p.offer ? Number(p.offer.price) : p.price },
    theirs: {
      title: live?.title || row.extTitle || row.extId, code, ean: live?.ean ?? null, energy: live?.energyClass ?? null,
      price: live ? live.offer ?? live.list : n(row.offerPrice) ?? n(row.listPrice),
      url: kotHref(row.extUrl), art: row.extId, available: live?.buyable ?? row.available,
    },
    match: row.match, note: "error" in r ? `Ο Κωτσόβολος δεν απάντησε τώρα (${r.error}) — δείχνω τα αποθηκευμένα.` : row.lastError,
    same: {
      code: live ? (live.supplierCodes.length ? live.supplierCodes.some((s) => ourCodes.includes(norm(s))) : null) : null,
      ean: live ? sameEan(live.ean, p.ean) : null,
      energy: live?.energyClass && ourEnergy ? live.energyClass.toUpperCase() === ourEnergy.toUpperCase() : null,
    },
  } };
}
