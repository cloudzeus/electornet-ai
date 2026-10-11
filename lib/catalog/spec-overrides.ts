import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Αλλαγές χαρακτηριστικών που ισχύουν ΜΟΝΟ στο νέο e-shop (δεν αγγίζουν SoftOne ούτε το παλιό site): όνομα φίλτρου,
 * φίλτρο ναι/όχι και σειρά, ανά (ομάδα SoftOne, κωδικός χαρακτηριστικού). Αποθηκεύονται σε μία εγγραφή ρυθμίσεων
 * (χωρίς νέο πίνακα) και τις εφαρμόζει η προβολή των φίλτρων (projectFacets). Ό,τι δεν έχει αλλαγή ακολουθεί το SoftOne.
 */
export const SECTION = "spec-overrides";
export type SpecOverride = { label?: string | null; filter?: boolean | null; sort?: number | null };
export type SpecOverrides = Record<string, SpecOverride>;
export const okey = (groupS1Id: number, code: number) => `${groupS1Id}:${code}`;
/** Αλλαγή «περιεχομένου» (όνομα ή φίλτρο) — η σειρά μόνη της δεν μετρά ως αλλαγή χαρακτηριστικού. */
export const changesContent = (o: SpecOverride | null | undefined) => !!o && (!!o.label || typeof o.filter === "boolean");

export async function getSpecOverrides(): Promise<SpecOverrides> {
  const s = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  return ((s?.data ?? {}) as { overrides?: SpecOverrides }).overrides ?? {};
}

/** Αλλάζει (ή, με null σε όλα, καθαρίζει) την αλλαγή ενός χαρακτηριστικού. Επιστρέφει την προηγούμενη για το audit. */
export async function setSpecOverride(groupS1Id: number, code: number, next: SpecOverride, staffId: string | null) {
  const all = await getSpecOverrides();
  const k = okey(groupS1Id, code);
  const prev = all[k] ?? null;
  const merged: SpecOverride = { ...prev, ...next };
  const label = merged.label?.replace(/\s+/g, " ").trim() || null;
  const clean: SpecOverride = { label: label ? label.slice(0, 80) : null, filter: typeof merged.filter === "boolean" ? merged.filter : null, sort: Number.isFinite(merged.sort as number) ? Math.max(0, Math.min(9999, Math.round(merged.sort as number))) : null };
  if (clean.label == null && clean.filter == null && clean.sort == null) delete all[k];
  else all[k] = clean;
  const data = { overrides: all } as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data, updatedById: staffId }, update: { data, updatedById: staffId } });
  return { prev, next: all[k] ?? null };
}

/**
 * Σειρά φίλτρων ενός τύπου στο e-shop (drag & drop): οι κωδικοί με τη νέα τους σειρά → sort 1, 2, 3… (ίδια κλίμακα με τους κωδικούς του SoftOne, που είναι η προεπιλεγμένη σειρά) Με κενή λίστα
 * καθαρίζει τη σειρά όλων (ξανά όπως το SoftOne). Οι υπόλοιπες αλλαγές (όνομα, φίλτρο) μένουν.
 */
export async function setSpecOrder(groupS1Id: number, codes: number[], staffId: string | null) {
  const all = await getSpecOverrides();
  const prev = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(`${groupS1Id}:`)));
  for (const k of Object.keys(prev)) { const o = { ...all[k], sort: null }; if (o.label == null && o.filter == null) delete all[k]; else all[k] = o; }
  codes.slice(0, 500).forEach((code, i) => { const k = okey(groupS1Id, code); all[k] = { label: all[k]?.label ?? null, filter: all[k]?.filter ?? null, sort: i + 1 }; });
  const data = { overrides: all } as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data, updatedById: staffId }, update: { data, updatedById: staffId } });
  return { prev };
}
