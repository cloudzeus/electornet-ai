"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { syncLookup, syncAllLookups, updateLookupRow, createLookupRow, lookupByKind } from "@/lib/softone/lookups";
import { resolveBrandLogos, setBrandDomain, approveBrandLogo, rejectBrandLogo, resetBrandLogo } from "@/lib/brandfetch/brands";
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
  if (kind === "brand" && "domain" in patch) { await setBrandDomain(id, String(patch.domain ?? ""), user.id); delete patch.domain; }
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

/** Μαζική αναζήτηση λογοτύπων μαρκών στο Brandfetch — γεμίζει την ουρά εγκρίσεων. */
export async function findBrandLogos(force = false) {
  const user = await requirePermission("settings.integrations.write");
  const r = await resolveBrandLogos({ force });
  await audit(user.id, "brand.logos.resolve", "Brand", "*", null, { scanned: r.scanned, matched: r.matched, unmatched: r.unmatched, force });
  revalidatePath("/admin/softone/brand");
  return r;
}

/**
 * Απόφαση του διαχειριστή για ένα λογότυπο που βρήκε το API.
 *
 * «Έγκριση» σημαίνει ότι κατεβάζουμε το αρχείο και το ανεβάζουμε στο **δικό
 * μας** Bunny CDN μέσω της βιβλιοθήκης πολυμέσων, ώστε το κατάστημα να μην
 * εξαρτάται από ξένο CDN. Καμία εικόνα δεν αποθηκεύεται χωρίς αυτή την
 * επιβεβαίωση.
 */
export async function decideSuggestion(id: string, accept: boolean) {
  const user = await requirePermission("settings.integrations.write");
  const b = await db.brand.findUnique({ where: { id }, select: { domainSuggest: true, domain: true, name: true } });
  const r = accept ? await approveBrandLogo(id, user.id) : (await rejectBrandLogo(id), { ok: true as const, saved: false, error: undefined });
  await audit(user.id, accept ? "brand.logo.approve" : "brand.logo.reject", "Brand", id, null, { name: b?.name, domain: b?.domainSuggest ?? b?.domain, saved: r.saved });
  revalidatePath("/admin/softone/brand");
  revalidatePath("/admin/softone/brand/logos");
  return r;
}

/** Μαζική απόφαση για όσα βλέπει ο διαχειριστής στη σελίδα ελέγχου. */
export async function decideMany(ids: string[], accept: boolean) {
  const user = await requirePermission("settings.integrations.write");
  let saved = 0, failed = 0;
  for (const id of ids.slice(0, 60)) {
    if (!accept) { await rejectBrandLogo(id); continue; }
    const r = await approveBrandLogo(id, user.id);
    if (r.saved) saved++; else failed++;
  }
  await audit(user.id, accept ? "brand.logo.approve-many" : "brand.logo.reject-many", "Brand", "*", null, { count: ids.length, saved, failed });
  revalidatePath("/admin/softone/brand");
  revalidatePath("/admin/softone/brand/logos");
  return { ok: true as const, count: ids.length, saved, failed };
}

/** Επαναφορά μιας μάρκας στην ουρά ελέγχου. */
export async function resetLogo(id: string) {
  const user = await requirePermission("settings.integrations.write");
  await resetBrandLogo(id);
  await audit(user.id, "brand.logo.reset", "Brand", id, null, null);
  revalidatePath("/admin/softone/brand/logos");
  return { ok: true as const };
}
