"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission, requireStaff } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { getHomeDoc, publishHome, revertHome, saveHomeDraft } from "@/lib/cms/home-store";
import { normalizeHomeDoc, type HomeDoc } from "@/lib/cms/home-sections";
import { homeHealth, type HomeHealth } from "@/lib/cms/home-health";
import { updatePlans } from "@/lib/cms/home-plans";

export async function saveHomeAction(doc: HomeDoc): Promise<{ ok: boolean; at?: string; message?: string }> {
  const user = await requirePermission("cms.zones.write");
  const r = await saveHomeDraft(normalizeHomeDoc(doc), user.id);
  return { ok: true, at: r.updatedAt.toISOString() };
}

export async function publishHomeAction(): Promise<{ ok: boolean; message: string; errors?: Issue[] }> {
  const user = await requirePermission("cms.zones.publish");
  const doc = await getHomeDoc();
  const { errors } = checkBlocks(doc.draft.blocks);
  if (errors.length) return { ok: false, message: "Διόρθωσε τα παρακάτω πριν τη δημοσίευση.", errors };
  await saveHomeDraft(doc.draft, user.id); // ώστε να υπάρχει πρόχειρο ακόμη κι αν δημοσιεύεται η προεπιλογή
  await publishHome(user.id);
  await updatePlans(user.id, (p) => (p.review ? { ...p, review: null } : p)).catch(() => null);
  await audit(user.id, "cms.home.publish", "CmsDocument", "home.layout/home", doc.published, doc.draft);
  revalidatePath("/");
  return { ok: true, message: "Δημοσιεύτηκε — οι επισκέπτες βλέπουν τώρα τη νέα αρχική." };
}

export async function revertHomeAction() {
  const user = await requirePermission("cms.zones.write");
  await revertHome(user.id);
  await audit(user.id, "cms.home.revert", "CmsDocument", "home.layout/home", null, null);
  return { ok: true, message: "Το πρόχειρο επέστρεψε στη δημοσιευμένη έκδοση." };
}

/* ---------------- υγεία, ιστορικό, σενάρια, έγκριση, σύνδεσμος προεπισκόπησης ---------------- */

/** Ποιες ενότητες βγαίνουν κενές τώρα + έλεγχοι πριν τη δημοσίευση (για το πρόχειρο που βλέπει ο editor). */
export async function homeHealthAction(doc: HomeDoc): Promise<HomeHealth> {
  await requirePermission("cms.zones.read");
  return homeHealth(normalizeHomeDoc(doc));
}

/* ---------------- φωτογραφίες προϊόντων χωρίς φόντο («Προσφορές της εβδομάδας» με σχέδιο banner) ---------------- */

/** Το παράθυρο «Αφαίρεση φόντου» ανοίγει από τις Ζώνες αρχικής και από τον editor banner των Προσφορών: αρκεί ένα από τα δύο δικαιώματα. */
async function cutoutUser() {
  const user = await requireStaff();
  return hasPermission(user, "catalog.promos.write") ? user : requirePermission("cms.zones.write");
}

/** Ποια από τα προϊόντα έχουν ήδη φωτογραφία χωρίς φόντο (id → URL). */
export async function productCutoutsAction(ids: string[]): Promise<Record<string, string>> {
  await requirePermission("cms.zones.read");
  const { bannerCutouts } = await import("@/lib/promo/banner-cutouts");
  return Object.fromEntries(await bannerCutouts([...new Set(ids)].slice(0, 24)));
}

/** Προεπισκόπηση της φωτογραφίας χωρίς φόντο ενός προϊόντος. Τίποτα δεν αποθηκεύεται. `clean` = false: ίσως σβήστηκε και μέρος του προϊόντος. */
export async function cutoutPreviewAction(productId: string): Promise<{ ok: true; src: string; clean: boolean; original: string | null } | { ok: false; error: string }> {
  await cutoutUser();
  try {
    const { manualCutout } = await import("@/lib/promo/banner-cutouts");
    const c = await manualCutout(productId);
    const sharp = (await import("sharp")).default;
    const small = await sharp(c.png).resize(640, 640, { fit: "inside" }).webp({ quality: 82 }).toBuffer();
    return { ok: true, src: `data:image/webp;base64,${small.toString("base64")}`, clean: c.clean, original: c.original };
  } catch (e) { return { ok: false, error: `Η αφαίρεση φόντου δεν έγινε${e instanceof Error ? ` (${e.message})` : ""}.` }; }
}

/** Επιβεβαίωση (`keep`): η φωτογραφία χωρίς φόντο αποθηκεύεται και τη δείχνουν τα banners. Αλλιώς καταργείται και το προϊόν γυρίζει στο λευκό πλαίσιο. */
export async function cutoutDecideAction(productId: string, keep: boolean): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const user = await cutoutUser();
  try {
    const m = await import("@/lib/promo/banner-cutouts");
    const url = keep ? await m.saveManualCutout(productId, user.id) : (await m.removeCutout(productId), null);
    await audit(user.id, keep ? "catalog.product.cutout.save" : "catalog.product.cutout.remove", "Product", productId, null, { url });
    (await import("@/lib/promo/landing")).invalidateAds();
    (await import("@/lib/promo/banner-products")).resetBannerProducts();
    revalidatePath("/");
    return { ok: true, url };
  } catch (e) { return { ok: false, error: `Η αποθήκευση δεν έγινε${e instanceof Error ? ` (${e.message})` : ""}. Δοκίμασε ξανά.` }; }
}
