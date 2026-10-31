"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { projectPublishReady, savePublishGate, tallyPublish } from "@/lib/catalog/publish-ready-server";
import { resetCatalogCache } from "@/lib/data/db-catalog";

/** Πόσα θα κρύβονταν με αυτά τα κριτήρια (πριν την αποθήκευση). */
export async function previewGateAction(raw: unknown) {
  await requirePermission("catalog.products.read");
  return tallyPublish(raw);
}

/** Διακόπτης + κριτήρια: αποθήκευση και άμεση εφαρμογή στη βιτρίνα. */
export async function saveGateAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await savePublishGate(raw, user.id);
  await audit(user.id, "catalog.publish-gate.save", "Setting", "catalog.publish", before, after);
  const changed = await projectPublishReady();
  resetCatalogCache();
  revalidatePath("/admin/catalog/completeness");
  return { ok: true as const, changed, enabled: after.enabled };
}

/** Ξαναμέτρημα όλου του καταλόγου (π.χ. μετά από μαζικό ανέβασμα φωτογραφιών). */
export async function recomputePublishAction() {
  await requirePermission("catalog.products.write");
  const changed = await projectPublishReady();
  resetCatalogCache();
  revalidatePath("/admin/catalog/completeness");
  return { changed };
}
