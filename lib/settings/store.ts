import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { SECTIONS, isSecret, sectionByKey } from "./schema";
import { decryptJson, encryptJson } from "./crypto";
import { swr } from "@/lib/cache/swr";

export type SettingValues = Record<string, string | number | boolean>;

/**
 * Όλες οι ρυθμίσεις σε μία κοινή μνήμη: τις διαβάζει ΚΑΘΕ αίτημα (layouts shop και διαχείρισης, features, couriers) και
 * αλλάζουν σπάνια — 30″ φρέσκες, έως 2′ με ανανέωση στο παρασκήνιο. Η αποθήκευση από τη διαχείριση τη σβήνει (saveSetting),
 * ώστε η αλλαγή να φαίνεται στο επόμενο αίτημα. Οι ενότητες που γράφονται αλλού απευθείας (κλειδώματα προσφορών, session
 * SoftOne…) διαβάζονται και από εκεί απευθείας — όχι από εδώ.
 */
const allSettings = swr(async () => {
  const rows = await db.setting.findMany({ select: { section: true, data: true, secrets: true } });
  return new Map(rows.map((r) => [r.section, { data: (r.data as SettingValues) ?? {}, secrets: decryptJson(r.secrets) }]));
}, 30_000, { maxStaleMs: 120_000 });
/** Μετά από εγγραφή ρυθμίσεων εκτός saveSetting (π.χ. script): ο επόμενος διαβάζει φρέσκα. */
export const resetSettingsCache = () => allSettings.reset();

/** Full section values (secrets decrypted) — server-side use only (integrations). */
export const getSetting = cache(async (section: string): Promise<{ data: SettingValues; secrets: Record<string, string> }> => {
  const row = (await allSettings()).get(section);
  return { data: { ...(row?.data ?? {}) }, secrets: { ...(row?.secrets ?? {}) } };
});

/** Which secret fields are set (for the admin form: show «•••• αποθηκευμένο»). */
export async function getSettingForForm(section: string) {
  const { data, secrets } = await getSetting(section);
  return { data, secretSet: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, !!v])) };
}

/** Save: plain fields replace `data`; secret fields merge (empty = keep, "__clear__" = remove). */
export async function saveSetting(section: string, values: SettingValues, secretInput: Record<string, string>, updatedById: string | null) {
  const def = sectionByKey(section);
  if (!def) throw new Error("unknown section");
  const prev = await db.setting.findUnique({ where: { section } });
  const secrets = decryptJson(prev?.secrets);
  for (const f of def.fields) {
    if (!isSecret(f)) continue;
    const v = secretInput[f.key];
    if (v === "__clear__") delete secrets[f.key];
    else if (v) secrets[f.key] = v;
  }
  const data: SettingValues = {};
  for (const f of def.fields) {
    if (f.type === "softone-objs") {
      for (const k of ["company", "branch", "module", "refid"]) if (values[k] !== undefined) data[k] = values[k];
    } else if (!isSecret(f) && values[f.key] !== undefined) data[f.key] = values[f.key];
  }
  await db.setting.upsert({
    where: { section },
    update: { data, secrets: encryptJson(secrets), updatedById },
    create: { section, data, secrets: encryptJson(secrets), updatedById },
  });
  allSettings.reset();
  return { before: (prev?.data as SettingValues) ?? {}, after: data, secretKeys: Object.keys(secrets) };
}

/** Storefront-safe view: only fields marked `public`, all sections, no secrets. */
export const getPublicSettings = cache(async (): Promise<Record<string, SettingValues>> => {
  const rows = await allSettings().catch(() => new Map<string, { data: SettingValues }>());
  const out: Record<string, SettingValues> = {};
  for (const s of SECTIONS) {
    const data = rows.get(s.key)?.data ?? {};
    out[s.key] = Object.fromEntries(s.fields.filter((f) => f.public && data[f.key] !== undefined && data[f.key] !== "").map((f) => [f.key, data[f.key]]));
  }
  return out;
});
