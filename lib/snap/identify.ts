import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { identifyAppliance, type ApplianceId } from "@/lib/ai/tasks";
import { products } from "@/lib/data/fixtures/products";
import { estimateKwh, OLD_APPLIANCE_KWH } from "@/lib/energy/estimate";
import { getGridFactor } from "@/lib/energy/emissions";
import { dimsFor } from "@/lib/data/dims";
import { getSettings } from "@/lib/cms/settings";
import { captureEvidence } from "@/lib/gdpr/evidence";
import { getCustomerSession } from "@/lib/account/session";

export interface Replacement { id: string; slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null; energy: string | null; kwh: number | null; savingEur: number | null; savingCo2Kg: number | null; dims: { w: number; h: number; d: number } | null; fit: { ok: boolean; note: string } | null; href: string; why: string }
export interface SnapResult { scanId: string; appliance: ApplianceId; matched: { id: string; slug: string; brand: string; title: string; price: number; image: string | null } | null; replacements: Replacement[]; oldKwh: number | null; kwhPrice: number; co2GPerKwh: number | null; categoryHref: string | null; aiAvailable: boolean }

/** Does the new appliance fit where the old one stood? Compares against the old dims read from the photo/plate (±1 cm tolerance). */
function fitAgainstOld(newD: { w: number; h: number; d: number } | null, old: ApplianceId["dims"]): { ok: boolean; note: string } | null {
  if (!newD || !old || !old.w || !old.h) return null;
  const over: string[] = [];
  if (newD.w > old.w + 1) over.push(`+${Math.round(newD.w - old.w)} cm πλάτος`);
  if (newD.h > old.h + 1) over.push(`+${Math.round(newD.h - old.h)} cm ύψος`);
  if (old.d && newD.d > old.d + 1) over.push(`+${Math.round(newD.d - old.d)} cm βάθος`);
  return over.length ? { ok: false, note: over.join(", ") } : { ok: true, note: "Χωράει στη θέση της παλιάς" };
}

const normModel = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Snap & Find, server side: downscale the photo (never stored unless the
 * customer keeps it), ask the vision model, match the catalogue by model /
 * brand, propose replacements of the same category with energy savings
 * versus a typical old appliance, and log an anonymous SnapScan for the radar.
 */
export async function identifyFromPhoto(imageBase64: string, hint?: string): Promise<SnapResult | { error: string; aiAvailable: false }> {
  const buf = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buf.length > 12 * 1024 * 1024) return { error: "Η φωτογραφία είναι πολύ μεγάλη (μέγιστο 12 MB).", aiAvailable: false };
  const small = await sharp(buf).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const ai = await identifyAppliance(`data:image/jpeg;base64,${small.toString("base64")}`, hint);
  const [ev, me] = await Promise.all([captureEvidence(), getCustomerSession()]);
  if (!ai) {
    await db.snapScan.create({ data: { customerId: me?.id ?? null, method: "ai", confidence: 0, ipHash: ev.ipHash, action: null } }).catch(() => null);
    return { error: "Η αναγνώριση με AI δεν είναι διαθέσιμη αυτή τη στιγμή. Γράψε το μοντέλο από την πινακίδα.", aiAvailable: false };
  }
  return composeResult(ai.result, ai.costUsd, me?.id ?? null, ev.ipHash);
}

/** Catalogue matching + replacements for a recognised appliance (pure apart from the SnapScan log). */
export async function composeResult(a: ApplianceId, costUsd: number, customerId: string | null, ipHash: string | null): Promise<SnapResult> {
  const settings = await getSettings();
  const kind = a.kind && a.kind !== "other" ? a.kind : null;
  const nm = a.model ? normModel(a.model) : "";
  const matched = nm.length >= 4 ? products.find((p) => normModel(p.title).includes(nm) || (p.sku ? normModel(String(p.sku)).includes(nm) : false)) ?? null : null;
  const pool = products.filter((p) => (kind ? p.subcategory === kind : matched ? p.subcategory === matched.subcategory : false));
  const oldKwh = kind ? (OLD_APPLIANCE_KWH[kind] ?? null) : null;
  const ageFactor = a.ageYears && a.ageYears > 12 ? 1.15 : 1;
  const kwhPrice = settings.site.commerce.kwhPrice;
  const grid = await getGridFactor().catch(() => null);
  const replacements: Replacement[] = pool
    .filter((p) => p.id !== matched?.id)
    .map((p) => { const e = estimateKwh(p); const d = dimsFor(p); const kwh = e?.kwh ?? null; const saving = oldKwh && kwh ? Math.round((oldKwh * ageFactor - kwh) * kwhPrice) : null; const co2 = oldKwh && kwh && grid ? Math.round(((oldKwh * ageFactor - kwh) * grid.gPerKwh) / 1000) : null; return { p, e, d, kwh, saving, co2 }; })
    .sort((x, y) => (y.p.rating?.value ?? 0) + (y.p.badge?.kind === "discount" ? 1 : 0) - ((x.p.rating?.value ?? 0) + (x.p.badge?.kind === "discount" ? 1 : 0)))
    .slice(0, 4)
    .map(({ p, kwh, saving, co2, d }) => ({ id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, image: p.image ?? null, energy: p.energy?.cls ?? null, kwh, savingEur: saving, savingCo2Kg: co2, dims: d ? { w: d.w, h: d.h, d: d.d } : null, fit: fitAgainstOld(d ? { w: d.w, h: d.h, d: d.d } : null, a.dims), href: `/k/${p.category}/${p.subcategory}`, why: [p.energy ? `κλάση ${p.energy.cls}` : null, kwh ? `${kwh} kWh/έτος` : null, p.badge?.kind === "discount" && p.wasPrice ? `−${Math.round(p.wasPrice - p.price)} € τώρα` : null].filter(Boolean).join(" · ") || "ίδια κατηγορία" }));
  const scan = await db.snapScan.create({ data: { customerId, method: "ai", kind, brand: a.brand, model: a.model, serial: a.serial, energyClass: a.energyClass, ageYears: a.ageYears, condition: a.condition, confidence: a.confidence, matchedProductId: matched?.id ?? null, suggested: replacements.map((r) => r.id), costUsd, ipHash } });
  return { scanId: scan.id, appliance: a, matched: matched ? { id: matched.id, slug: matched.slug, brand: matched.brand, title: matched.title, price: matched.price, image: matched.image ?? null } : null, replacements, oldKwh: oldKwh ? Math.round(oldKwh * ageFactor) : null, kwhPrice, co2GPerKwh: grid?.gPerKwh ?? null, categoryHref: pool[0] ? `/k/${pool[0].category}/${pool[0].subcategory}` : null, aiAvailable: true };
}

export async function recordSnapAction(scanId: string, action: string, imageUrl?: string | null) {
  await db.snapScan.update({ where: { id: scanId }, data: { action, ...(imageUrl ? { imageUrl } : {}) } }).catch(() => null);
}
