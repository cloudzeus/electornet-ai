"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { friendlyError } from "@/lib/softone/lookups";
import { partnerDocSummary, partnerDocYear } from "@/lib/b2b/partner-docs";
import { geocodeEntity, geocodeMissing, setManualPoint, type GeoEntity } from "@/lib/geo/entity-geo";
import { cleanValue, fieldKey, FIELD_TYPES, type ExtraValues, type FieldEntity, type FieldType } from "@/lib/custom-fields";

/** Ποιο δικαίωμα γράφει σε κάθε καρτέλα (ίδιο με τις υπόλοιπες ενέργειες της): συνεργάτες → stores.partners.write, μεταφορείς → settings.write. */
const writePerm = (e: GeoEntity | FieldEntity) => (e === "partner" ? "stores.partners.write" : "settings.write");
const cardPath = (e: GeoEntity | FieldEntity, id: string) => (e === "partner" ? `/admin/synergates/${id}` : `/admin/apostoles/praktoreia/${id}`);

async function docs<T>(partnerId: string, fn: (trdr: number) => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  await requirePermission("stores.partners.read");
  const p = await db.partner.findUnique({ where: { id: partnerId }, select: { s1Trdr: true } });
  if (!p?.s1Trdr) return { ok: false, error: "Ο συνεργάτης δεν έχει κωδικό SoftOne (TRDR)." };
  try { return { ok: true, data: await fn(p.s1Trdr) }; } catch (e) {
    const msg = friendlyError(e);
    return { ok: false, error: /404|fetch failed|ECONN|timeout/i.test(msg) ? "Το SoftOne δεν απαντά αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο." : msg };
  }
}
/** Παραστατικά συνεργάτη από το SoftOne: σύνοψη όλων των ετών. */
export async function partnerDocSummaryAction(partnerId: string, force = false) { return docs(partnerId, (t) => partnerDocSummary(t, force)); }
/** Λεπτομέρειες ενός έτους (σχόλια, μεταφορέας). */
export async function partnerDocYearAction(partnerId: string, year: number, force = false) { return docs(partnerId, (t) => partnerDocYear(t, year, force)); }

export async function geocodeAction(entity: GeoEntity, id: string, force = true) {
  const user = await requirePermission(writePerm(entity));
  const r = await geocodeEntity(entity, id, force);
  await audit(user.id, `${entity}.geocode`, entity === "partner" ? "Partner" : "Carrier", id, null, r);
  revalidatePath(cardPath(entity, id));
  return r;
}

export async function setPointAction(entity: GeoEntity, id: string, lat: number, lng: number) {
  const user = await requirePermission(writePerm(entity));
  await setManualPoint(entity, id, lat, lng);
  await audit(user.id, `${entity}.geo.manual`, entity === "partner" ? "Partner" : "Carrier", id, null, { lat, lng });
  revalidatePath(cardPath(entity, id));
  revalidatePath("/admin/apostoles/xartis");
  return { ok: true as const };
}

/** «Εντοπισμός θέσεων»: όσοι δεν έχουν θέση, λίγοι κάθε φορά (Nominatim 1/δευτ.). */
export async function geocodeMissingAction(entity: GeoEntity) {
  const user = await requirePermission(writePerm(entity));
  const r = await geocodeMissing(entity);
  await audit(user.id, `${entity}.geocode.bulk`, entity === "partner" ? "Partner" : "Carrier", "*", null, r);
  revalidatePath("/admin/apostoles/xartis");
  return r;
}

/** Νέο ή αλλαγμένο πρόσθετο πεδίο. Το κλειδί βγαίνει από το όνομα και δεν αλλάζει μετά (οι τιμές είναι αποθηκευμένες με αυτό). */
export async function saveFieldDefAction(entity: FieldEntity, f: { id?: string; label: string; type: FieldType; options: string[]; groupName: string; help: string; active?: boolean }) {
  const user = await requirePermission(writePerm(entity));
  const label = f.label.trim();
  if (label.length < 2) return { ok: false as const, error: "Γράψε όνομα πεδίου." };
  if (!(f.type in FIELD_TYPES)) return { ok: false as const, error: "Άγνωστος τύπος πεδίου." };
  const options = f.type === "select" ? [...new Set(f.options.map((o) => o.trim()).filter(Boolean))] : [];
  if (f.type === "select" && options.length < 2) return { ok: false as const, error: "Η λίστα θέλει τουλάχιστον δύο επιλογές." };
  const data = { label, type: f.type, options, groupName: f.groupName.trim() || null, help: f.help.trim() || null, active: f.active ?? true };
  if (f.id) {
    const before = await db.customField.findUnique({ where: { id: f.id } });
    if (!before || before.entity !== entity) return { ok: false as const, error: "Το πεδίο δεν βρέθηκε." };
    await db.customField.update({ where: { id: f.id }, data });
    await audit(user.id, "customField.update", "CustomField", f.id, before, data);
  } else {
    let key = fieldKey(label);
    for (let i = 2; await db.customField.findUnique({ where: { entity_key: { entity, key } } }); i++) key = `${fieldKey(label)}_${i}`;
    const sort = await db.customField.count({ where: { entity } });
    const row = await db.customField.create({ data: { ...data, entity, key, sort } });
    await audit(user.id, "customField.create", "CustomField", row.id, null, row);
  }
  revalidatePath(entity === "partner" ? "/admin/synergates" : "/admin/apostoles/praktoreia", "layout");
  return { ok: true as const };
}

/** Τιμές πρόσθετων πεδίων μιας καρτέλας. Ελέγχεται κάθε τιμή με τον τύπο του πεδίου· ό,τι δεν έχει ορισμό αγνοείται. */
export async function saveExtraAction(entity: FieldEntity, id: string, values: ExtraValues) {
  const user = await requirePermission(writePerm(entity));
  const defs = await db.customField.findMany({ where: { entity } });
  const rec = entity === "partner" ? await db.partner.findUnique({ where: { id }, select: { extra: true } }) : await db.carrier.findUnique({ where: { id }, select: { extra: true } });
  if (!rec) return { ok: false as const, error: "Η εγγραφή δεν βρέθηκε." };
  const before = (rec.extra ?? {}) as ExtraValues;
  const next: ExtraValues = { ...before };
  for (const d of defs) {
    if (!(d.key in values)) continue;
    const c = cleanValue({ type: d.type as FieldType, options: (d.options as string[] | null) ?? [], label: d.label }, values[d.key]);
    if (!c.ok) return { ok: false as const, error: c.error };
    if (c.value == null) delete next[d.key]; else next[d.key] = c.value;
  }
  if (entity === "partner") await db.partner.update({ where: { id }, data: { extra: next } });
  else await db.carrier.update({ where: { id }, data: { extra: next } });
  await audit(user.id, `${entity}.extra`, entity === "partner" ? "Partner" : "Carrier", id, before, next);
  revalidatePath(cardPath(entity, id));
  return { ok: true as const };
}
