import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { SECTIONS, isSecret, sectionByKey } from "./schema";
import { decryptJson, encryptJson } from "./crypto";

export type SettingValues = Record<string, string | number | boolean>;

/** Full section values (secrets decrypted) — server-side use only (integrations). */
export const getSetting = cache(async (section: string): Promise<{ data: SettingValues; secrets: Record<string, string> }> => {
  const row = await db.setting.findUnique({ where: { section } });
  return { data: ((row?.data as SettingValues) ?? {}), secrets: decryptJson(row?.secrets) };
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
  for (const f of def.fields) if (!isSecret(f) && values[f.key] !== undefined) data[f.key] = values[f.key];
  await db.setting.upsert({
    where: { section },
    update: { data, secrets: encryptJson(secrets), updatedById },
    create: { section, data, secrets: encryptJson(secrets), updatedById },
  });
  return { before: (prev?.data as SettingValues) ?? {}, after: data, secretKeys: Object.keys(secrets) };
}

/** Storefront-safe view: only fields marked `public`, all sections, no secrets. */
export const getPublicSettings = cache(async (): Promise<Record<string, SettingValues>> => {
  const rows = await db.setting.findMany().catch(() => []);
  const out: Record<string, SettingValues> = {};
  for (const s of SECTIONS) {
    const row = rows.find((r) => r.section === s.key);
    const data = (row?.data as SettingValues) ?? {};
    out[s.key] = Object.fromEntries(s.fields.filter((f) => f.public && data[f.key] !== undefined && data[f.key] !== "").map((f) => [f.key, data[f.key]]));
  }
  return out;
});
