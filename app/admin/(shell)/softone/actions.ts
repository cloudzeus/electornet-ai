"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { syncLookup, syncAllLookups, updateLookupRow, createLookupRow, lookupByKind } from "@/lib/softone/lookups";
import { resolveBrandLogos, setBrandDomain } from "@/lib/brandfetch/brands";
import { db } from "@/lib/db";

export async function syncKind(kind: string) {
  const user = await requirePermission("settings.integrations.write");
  const r = await syncLookup(kind, "manual");
  await audit(user.id, "softone.lookup.sync", "S1SyncRun", kind, null, r);
  revalidatePath("/admin/softone");
  revalidatePath(`/admin/softone/${kind}`);
  return r;
}

export async function syncAll() {
  const user = await requirePermission("settings.integrations.write");
  const r = await syncAllLookups("manual");
  await audit(user.id, "softone.lookup.sync-all", "S1SyncRun", "*", null, { ok: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).map((x) => x.kind) });
  revalidatePath("/admin/softone");
  return r;
}

export async function saveRow(kind: string, id: string, patch: Record<string, unknown>) {
  const user = await requirePermission("settings.integrations.write");
  // Το domain μιας μάρκας ξαναφτιάχνει τον σύνδεσμο λογοτύπου
  if (kind === "brand" && "domain" in patch) { await setBrandDomain(id, String(patch.domain ?? "")); delete patch.domain; }
  const row = await updateLookupRow(kind, id, patch);
  await audit(user.id, "softone.lookup.edit", lookupByKind(kind)?.model ?? kind, id, null, patch);
  revalidatePath(`/admin/softone/${kind}`);
  return { ok: true, row: JSON.parse(JSON.stringify(row)) as Record<string, unknown> };
}

export async function addRow(kind: string, input: { code: string; name: string } & Record<string, unknown>) {
  const user = await requirePermission("settings.integrations.write");
  try {
    const row = await createLookupRow(kind, input);
    await audit(user.id, "softone.lookup.create", lookupByKind(kind)?.model ?? kind, String(row.id), null, input);
    revalidatePath(`/admin/softone/${kind}`);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message.includes("Unique") ? "Ο κωδικός υπάρχει ήδη." : (e as Error).message }; }
}

/** Καθαρισμός ιστορικού: είτε μόνο τα αποτυχημένα, είτε ό,τι είναι παλαιότερο από Χ ημέρες. */
export async function clearRuns(mode: "failed" | "old", days = 30) {
  const user = await requirePermission("settings.integrations.write");
  const where = mode === "failed" ? { ok: false } : { at: { lt: new Date(Date.now() - days * 86400000) } };
  const { count } = await db.s1SyncRun.deleteMany({ where });
  await audit(user.id, "softone.runs.clear", "S1SyncRun", mode, null, { deleted: count, days: mode === "old" ? days : undefined });
  revalidatePath("/admin/softone/sync");
  revalidatePath("/admin/softone");
  return { ok: true as const, deleted: count };
}

/** Μαζική αναζήτηση λογοτύπων μαρκών στο Brandfetch (hotlink, χωρίς λήψη αρχείων). */
export async function findBrandLogos(force = false) {
  const user = await requirePermission("settings.integrations.write");
  const r = await resolveBrandLogos({ force });
  await audit(user.id, "brand.logos.resolve", "Brand", "*", null, { scanned: r.scanned, matched: r.matched, unmatched: r.unmatched, force });
  revalidatePath("/admin/softone/brand");
  return r;
}

/** Αποδοχή ή απόρριψη πρότασης domain για μία μάρκα. */
export async function decideSuggestion(id: string, accept: boolean) {
  const user = await requirePermission("settings.integrations.write");
  const b = await db.brand.findUnique({ where: { id }, select: { domainSuggest: true, name: true } });
  if (accept && b?.domainSuggest) await setBrandDomain(id, b.domainSuggest);
  await db.brand.update({ where: { id }, data: { domainSuggest: null } });
  await audit(user.id, accept ? "brand.domain.accept" : "brand.domain.reject", "Brand", id, null, { name: b?.name, domain: b?.domainSuggest });
  revalidatePath("/admin/softone/brand");
  return { ok: true as const };
}
