"use server";

import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { DEFAULT_BANNER_DESIGN, applyLook, lookOf, normalizeBannerDesign, type BannerDesign, type BannerProduct, type BannerTemplate, type BannerTemplateLook } from "@/lib/promo/banner-design";
import { bannerProductsFresh } from "@/lib/promo/banner-products";

/** Τα προϊόντα ενός σχεδιασμένου banner για την προεπισκόπηση του editor (ίδια λογική με τη βιτρίνα). */
export async function bannerPreviewProductsAction(design: BannerDesign, promotionId: string | null): Promise<BannerProduct[]> {
  await requirePermission("catalog.promos.write");
  const d = normalizeBannerDesign(design);
  return d ? bannerProductsFresh(d, promotionId) : [];
}

/**
 * Δείγμα προϊόντων για την προεπισκόπηση του editor, όταν το banner δεν έχει δικά του να δείξει (η προσφορά του έληξε, δεν
 * έχει προϊόντα ή δεν έχει οριστεί): τα πρώτα προϊόντα που είναι τώρα σε προσφορά. Μόνο στη διαχείριση — το site δεν τα δείχνει.
 */
export async function bannerSampleProductsAction(design: BannerDesign): Promise<BannerProduct[]> {
  await requirePermission("catalog.promos.write");
  const d = normalizeBannerDesign(design);
  if (!d) return [];
  const rows = await db.productOffer.findMany({ where: { promotionId: { not: null } }, orderBy: { price: "desc" }, take: Math.max(4, Math.min(9, d.products.max)), select: { productId: true } });
  return rows.length ? bannerProductsFresh({ ...d, products: { ...d.products, source: "manual", ids: rows.map((r) => r.productId) } }, null) : [];
}

/**
 * «Αφαίρεση φόντου τώρα»: φτιάχνει τις φωτογραφίες χωρίς φόντο για τα προϊόντα που δείχνει η προεπισκόπηση (έως 6 τη φορά,
 * ~2″ το καθένα), χωρίς να περιμένει την αποθήκευση του banner. Οι φωτογραφίες μένουν στη βιβλιοθήκη και ξαναχρησιμοποιούνται.
 */
export async function bannerCutoutsNowAction(ids: string[]): Promise<{ made: number; failed: number }> {
  const user = await requirePermission("catalog.promos.write");
  const { ensureBannerCutouts } = await import("@/lib/promo/banner-cutouts");
  const r = await ensureBannerCutouts([...new Set(ids)].slice(0, 6), user.id);
  return { made: r.made, failed: r.failed.length };
}

const TPL = "banner.templates";
const PERM = "catalog.promos.write";
/** Ό,τι είναι αποθηκευμένο → έγκυρη εμφάνιση (περνά από τον ίδιο έλεγχο με ένα σχέδιο· ποτέ ό,τι να 'ναι από τη βάση στον editor). */
const cleanLook = (x: unknown): BannerTemplateLook => lookOf(applyLook(DEFAULT_BANNER_DESIGN, x as BannerTemplateLook));

/** Τα πρότυπα banner που έχει αποθηκεύσει το προσωπικό (τα έτοιμα είναι στον κώδικα). */
export async function bannerTemplatesAction(): Promise<BannerTemplate[]> {
  await requirePermission(PERM);
  const rows = await db.cmsDocument.findMany({ where: { collection: TPL, locale: "el" }, orderBy: { updatedAt: "desc" }, select: { key: true, data: true } });
  return rows.map((r) => { const d = r.data as { name?: unknown; look?: unknown }; return { key: r.key, name: typeof d.name === "string" ? d.name : r.key, look: cleanLook(d.look) }; });
}

/** «Αποθήκευση ως πρότυπο»: κρατά την εμφάνιση του banner (όχι κείμενα και προϊόντα) με ένα όνομα· ίδιο όνομα = ενημέρωση. */
export async function saveBannerTemplateAction(name: string, design: BannerDesign): Promise<{ ok: true; template: BannerTemplate } | { ok: false; error: string }> {
  const user = await requirePermission(PERM);
  const n = name.trim().slice(0, 60), d = normalizeBannerDesign(design);
  if (n.length < 2) return { ok: false, error: "Δώσε όνομα στο πρότυπο (τουλάχιστον 2 χαρακτήρες)." };
  if (!d) return { ok: false, error: "Το banner δεν είναι σχεδιασμένο." };
  const key = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9α-ω]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `t-${Date.now()}`;
  const data = { name: n, look: lookOf(d) };
  await db.cmsDocument.upsert({ where: { collection_key_locale: { collection: TPL, key, locale: "el" } }, update: { data, updatedBy: user.id }, create: { collection: TPL, key, locale: "el", data, updatedBy: user.id } });
  return { ok: true, template: { key, name: n, look: data.look } };
}

export async function deleteBannerTemplateAction(key: string): Promise<{ ok: boolean }> {
  await requirePermission(PERM);
  await db.cmsDocument.deleteMany({ where: { collection: TPL, key, locale: "el" } });
  return { ok: true };
}
