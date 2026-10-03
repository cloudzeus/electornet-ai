"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import type { BrandBlock } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { infoPage } from "@/lib/cms/info-pages";
import { getZonesDoc, publishZones, revertZones, saveZonesDraft } from "@/lib/cms/page-zones";

const PERM = "cms.pages.write";

export async function saveZonesAction(key: string, blocks: BrandBlock[]): Promise<{ ok: boolean; at?: string; message?: string }> {
  const user = await requirePermission(PERM);
  const page = infoPage(key);
  if (!page || !Array.isArray(blocks)) return { ok: false, message: "Άγνωστη σελίδα." };
  // κάθε component σε ζώνη που υπάρχει στη σελίδα
  const fixed = blocks.map((b) => ((page.zones as string[]).includes(b.zone ?? "") ? b : { ...b, zone: page.zones[0] }));
  const r = await saveZonesDraft(key, fixed, user.id);
  return { ok: true, at: r.updatedAt.toISOString() };
}

export async function publishZonesAction(key: string): Promise<{ ok: boolean; message: string; errors?: Issue[] }> {
  const user = await requirePermission(PERM);
  const page = infoPage(key);
  const doc = await getZonesDoc(key);
  if (!page || !doc) return { ok: false, message: "Δεν υπάρχει πρόχειρο." };
  const { errors } = checkBlocks(doc.draft);
  if (errors.length) return { ok: false, message: "Διόρθωσε τα παρακάτω πριν τη δημοσίευση.", errors };
  await publishZones(key, user.id);
  await audit(user.id, "cms.pagezones.publish", "CmsDocument", `page.zones/${key}`, doc.published, doc.draft);
  revalidatePath(page.path);
  return { ok: true, message: `Δημοσιεύτηκε — οι επισκέπτες βλέπουν τώρα τις ζώνες στο ${page.path}.` };
}

export async function revertZonesAction(key: string) {
  const user = await requirePermission(PERM);
  await revertZones(key, user.id);
  await audit(user.id, "cms.pagezones.revert", "CmsDocument", `page.zones/${key}`, null, null);
  return { ok: true, message: "Το πρόχειρο επέστρεψε στη δημοσιευμένη έκδοση." };
}
