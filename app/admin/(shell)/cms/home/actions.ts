"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { getHomeDoc, publishHome, revertHome, saveHomeDraft } from "@/lib/cms/home-store";
import { normalizeHomeDoc, type HomeDoc } from "@/lib/cms/home-sections";

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
