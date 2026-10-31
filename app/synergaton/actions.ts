"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { changePassword, consumeLink, finishLogin, requestReset, startLogin } from "@/lib/partner-portal/auth";
import { destroyPortalSession, getPortalUser, portalBase, type PortalUser } from "@/lib/partner-portal/session";
import { portalLog } from "@/lib/partner-portal/log";
import { adviseMapping, adviseSetup, explainTest, type SetupAdvice } from "@/lib/partner-portal/ai";
import { syncPartnerToEngine } from "@/lib/partner-portal/engine-sync";
import { engine, type UploadPreview } from "@/lib/b2b-engine/client";
import type { TestResult } from "@/lib/b2b-engine/contracts";
import { CONN_TYPES, connTypeInfo, validateFields, type ConnType, type FieldMapping } from "@/lib/partner-portal/connection-types";
import { checkProfile, hoursOf, servicesOf, STORE_SERVICES, type StoreProfile } from "@/lib/partner-portal/store-profile";
import { onboardingOf } from "@/lib/partner-portal/data";
import { resetStoresCache } from "@/lib/stores/repo";

type Fail = { ok: false; error: string; fields?: Record<string, string> };

async function me(): Promise<PortalUser> {
  const u = await getPortalUser();
  if (!u) redirect(`${await portalBase()}/eisodos`);
  return u;
}
const refresh = () => revalidatePath("/synergaton", "layout");

// ---------- Είσοδος & κωδικοί ----------

export async function loginStep1(email: string, password: string) {
  if (!email.trim() || !password) return { ok: false as const, error: "Συμπλήρωσε email και κωδικό." };
  return startLogin(email, password);
}
export async function loginStep2(challengeId: string, code: string) {
  return finishLogin(challengeId, code.replace(/\D/g, ""));
}
export async function forgotPassword(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { ok: false as const, error: "Γράψε ένα έγκυρο email." };
  await requestReset(email);
  return { ok: true as const };
}
export async function setPasswordFromLink(token: string, password: string) {
  return consumeLink(token, password);
}
export async function logout() {
  await destroyPortalSession();
  redirect(`${await portalBase()}/eisodos`);
}
export async function changeMyPassword(current: string, next: string) {
  const u = await me();
  return changePassword(u.accountId, current, next);
}

// ---------- Ερωτηματολόγιο + βοηθός ----------

export async function saveQuestionnaire(answers: Record<string, unknown>, withAi: boolean): Promise<{ ok: true; advice: SetupAdvice | null } | Fail> {
  const u = await me();
  const clean = Object.fromEntries(Object.entries(answers).filter(([k]) => /^[a-z][a-zA-Z0-9]{0,30}$/.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 500) : Array.isArray(v) ? v.slice(0, 20).map((x) => String(x).slice(0, 80)) : v]));
  const advice = withAi ? await adviseSetup(u.partner.id, clean) : null;
  const ob = onboardingOf(u.partner.onboarding);
  await db.partner.update({ where: { id: u.partner.id }, data: { onboarding: { ...ob, answers: clean, advice: advice ?? ob.advice ?? null, steps: { ...ob.steps, questions: "done" } } as Prisma.InputJsonValue } });
  await db.partnerChange.create({ data: { partnerId: u.partner.id, accountId: u.accountId, entity: "Partner", entityId: u.partner.id, field: "onboarding.answers", before: (ob.answers ?? null) as Prisma.InputJsonValue, after: clean as Prisma.InputJsonValue } });
  await portalLog(u.partner.id, "profile", true, "Συμπληρώθηκε το ερωτηματολόγιο", { accountId: u.accountId });
  refresh();
  return { ok: true, advice };
}

// ---------- Καταστήματα ----------

/** Αποθήκευση προφίλ καταστήματος: ισχύει αμέσως, κάθε πεδίο που άλλαξε γράφεται στο ιστορικό. */
export async function saveStoreProfile(storeId: string, p: StoreProfile): Promise<{ ok: true; changed: string[] } | Fail> {
  const u = await me();
  const s = await db.store.findFirst({ where: { id: storeId, partnerId: u.partner.id } });
  if (!s) return { ok: false, error: "Το κατάστημα δεν ανήκει στον λογαριασμό σας." };
  const next: StoreProfile = { phone: p.phone.trim(), mobile: p.mobile.trim(), email: p.email.trim().toLowerCase(), hours: hoursOf(p.hours), services: servicesOf(p.services).filter((k) => STORE_SERVICES.some((x) => x.key === k)), notes: p.notes.trim() };
  const fields = checkProfile(next);
  if (Object.keys(fields).length) return { ok: false, error: "Διόρθωσε τα σημειωμένα πεδία.", fields };
  const before: StoreProfile = { phone: s.phone ?? "", mobile: s.mobile ?? "", email: s.email ?? "", hours: hoursOf(s.hours), services: servicesOf(s.services), notes: s.notes ?? "" };
  const changed = (Object.keys(next) as (keyof StoreProfile)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
  if (changed.length) {
    await db.$transaction([
      db.store.update({ where: { id: s.id }, data: { phone: next.phone || null, mobile: next.mobile || null, email: next.email || null, hours: next.hours, services: next.services, notes: next.notes || null } }),
      db.partnerChange.createMany({ data: changed.map((k) => ({ partnerId: u.partner.id, accountId: u.accountId, entity: "Store", entityId: s.id, field: k, before: before[k] as Prisma.InputJsonValue, after: next[k] as Prisma.InputJsonValue })) }),
    ]);
    resetStoresCache();
    await portalLog(u.partner.id, "profile", true, `Ενημέρωση καταστήματος «${s.name}»: ${changed.join(", ")}`, { accountId: u.accountId });
  }
  const ob = onboardingOf(u.partner.onboarding);
  if (ob.steps?.profile !== "done") await db.partner.update({ where: { id: u.partner.id }, data: { onboarding: { ...ob, steps: { ...ob.steps, profile: "done" } } as Prisma.InputJsonValue } });
  refresh();
  return { ok: true, changed };
}

// ---------- Συνδέσεις ----------

async function myConnection(u: PortalUser, id: string) {
  return db.partnerConnection.findFirst({ where: { id, partnerId: u.partner.id } });
}

export async function createConnection(type: ConnType, storeIds: string[]): Promise<{ ok: true; id: string } | Fail> {
  const u = await me();
  if (!CONN_TYPES.some((c) => c.type === type)) return { ok: false, error: "Άγνωστος τρόπος σύνδεσης." };
  const own = await db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true } });
  const ids = storeIds.filter((id) => own.some((s) => s.id === id));
  if (!ids.length) return { ok: false, error: "Διάλεξε τουλάχιστον ένα κατάστημα." };
  const c = await db.partnerConnection.create({ data: { partnerId: u.partner.id, type, label: connTypeInfo(type)!.title, config: {}, storeIds: ids, createdBy: u.accountId } });
  await portalLog(u.partner.id, "connection", true, `Νέα σύνδεση: ${connTypeInfo(type)!.title}`, { accountId: u.accountId, connectionId: c.id });
  await db.partner.update({ where: { id: u.partner.id }, data: { status: u.partner.status === "onboarding" ? "connecting" : u.partner.status } });
  refresh();
  return { ok: true, id: c.id };
}

export async function updateConnectionStores(id: string, storeIds: string[]): Promise<{ ok: true } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  const own = await db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true } });
  const ids = storeIds.filter((s) => own.some((o) => o.id === s));
  if (!ids.length) return { ok: false, error: "Διάλεξε τουλάχιστον ένα κατάστημα." };
  await db.partnerConnection.update({ where: { id }, data: { storeIds: ids } });
  refresh();
  return { ok: true };
}

/** Βήμα «Στοιχεία»: config εδώ + στη μηχανή, secrets μόνο στη μηχανή (κρυπτογραφημένα). */
export async function saveConnectionSettings(id: string, values: Record<string, string>): Promise<{ ok: true; secretKeys: string[] } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  const info = connTypeInfo(c.type);
  if (!info) return { ok: false, error: "Ο τρόπος σύνδεσης δεν υποστηρίζεται ακόμη." };
  const fields = validateFields(info.type, values, { secretsSet: c.secretKeys });
  if (Object.keys(fields).length) return { ok: false, error: "Διόρθωσε τα σημειωμένα πεδία.", fields };
  const prev = (c.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = { ...(prev.map ? { map: prev.map } : {}) };
  const secrets: Record<string, string> = {};
  for (const f of info.fields) {
    const v = (values[f.key] ?? "").trim() || f.defaultValue || "";
    if (!v) continue;
    if (f.kind === "config") config[f.key] = v; else secrets[f.key] = v;
  }
  await db.partnerConnection.update({ where: { id }, data: { config: config as Prisma.InputJsonValue, status: c.status === "active" ? "active" : "draft" } });
  const sync = await syncPartnerToEngine(u.partner.id, { accountId: u.accountId, reason: "στοιχεία σύνδεσης" });
  if (!sync.ok) return { ok: false, error: `Τα στοιχεία αποθηκεύτηκαν, αλλά η μηχανή δεν τα παρέλαβε: ${sync.error}` };
  let secretKeys = c.secretKeys;
  if (Object.keys(secrets).length) {
    const r = await engine.putSecrets(id, secrets);
    if (!r.ok) return { ok: false, error: `Τα στοιχεία πρόσβασης δεν αποθηκεύτηκαν: ${r.error}` };
    secretKeys = r.data.secretKeys;
    await db.partnerConnection.update({ where: { id }, data: { secretKeys } });
  }
  await portalLog(u.partner.id, "connection", true, `Αποθήκευση στοιχείων σύνδεσης${Object.keys(secrets).length ? " (και στοιχείων πρόσβασης, κρυπτογραφημένα)" : ""}`, { accountId: u.accountId, connectionId: id });
  refresh();
  return { ok: true, secretKeys };
}

export type TestOut = { ok: true; result: TestResult; explain: Awaited<ReturnType<typeof explainTest>> } | Fail;

/** Έλεγχος τώρα (έως 90″). Σε αποτυχία ο βοηθός εξηγεί τι να γίνει. */
export async function runConnectionTest(id: string, withAi = true): Promise<TestOut> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  const r = await engine.test(id, u.accountId);
  if (!r.ok) {
    await portalLog(u.partner.id, "test", false, `Ο έλεγχος δεν έτρεξε: ${r.error}`, { accountId: u.accountId, connectionId: id, ms: r.ms });
    return { ok: false, error: r.error };
  }
  const t = r.data;
  const lastTest = { outcome: t.outcome, steps: t.steps, sample: t.sample, locations: t.locations, total: t.total, fieldHints: t.fieldHints ?? null, startedAt: t.startedAt, durationMs: t.durationMs };
  const status = c.status === "active" || c.status === "paused" ? c.status : t.outcome === "ok" ? "ok" : t.outcome === "review" ? "review" : "failed";
  await db.partnerConnection.update({ where: { id }, data: { lastTest: lastTest as Prisma.InputJsonValue, lastTestAt: new Date(t.startedAt), status, ...(t.outcome === "ok" ? { lastOkAt: new Date(t.startedAt) } : {}) } });
  await portalLog(u.partner.id, "test", t.outcome !== "failed", `Έλεγχος σύνδεσης: ${t.outcome === "ok" ? "επιτυχής" : t.outcome === "review" ? "για έλεγχο από την Euronics" : "απέτυχε"}${t.total !== null ? ` · ${t.total} γραμμές` : ""}`, { accountId: u.accountId, connectionId: id, ms: t.durationMs, detail: { steps: t.steps.map((s) => ({ key: s.key, ok: s.ok, message: s.message })) } });
  const explain = t.outcome === "failed" && withAi ? await explainTest(u.partner.id, c.type, t.steps) : null;
  refresh();
  return { ok: true, result: t, explain };
}

/** Αντιστοίχιση στηλών (feed): αποθήκευση στο config.map και αμέσως νέος έλεγχος. */
export async function saveFieldMap(id: string, map: FieldMapping): Promise<{ ok: true } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  if (!map.qty || (!map.sku && !map.ean)) return { ok: false, error: "Χρειάζονται στήλη ποσότητας και στήλη κωδικού ή EAN." };
  const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === "string" && v.length > 0 && v.length <= 200));
  const before = ((c.config ?? {}) as Record<string, unknown>).map ?? null;
  await db.partnerConnection.update({ where: { id }, data: { config: { ...((c.config ?? {}) as object), map: clean } as Prisma.InputJsonValue } });
  await db.partnerChange.create({ data: { partnerId: u.partner.id, accountId: u.accountId, entity: "PartnerConnection", entityId: id, field: "config.map", before: before as Prisma.InputJsonValue, after: clean as Prisma.InputJsonValue } });
  const sync = await syncPartnerToEngine(u.partner.id, { accountId: u.accountId, reason: "αντιστοίχιση στηλών" });
  await portalLog(u.partner.id, "mapping", sync.ok, `Αντιστοίχιση στηλών: ${Object.entries(clean).map(([k, v]) => `${k} → ${v}`).join(", ")}`, { accountId: u.accountId, connectionId: id });
  if (!sync.ok) return { ok: false, error: `Η αντιστοίχιση αποθηκεύτηκε, αλλά η μηχανή δεν την παρέλαβε: ${sync.error}` };
  refresh();
  return { ok: true };
}

export async function suggestFieldMap(columns: string[], preview: Record<string, string>[]) {
  const u = await me();
  const r = await adviseMapping(u.partner.id, columns.slice(0, 200), preview.slice(0, 5));
  return r ? { ok: true as const, ...r } : { ok: false as const, error: "Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή — η αυτόματη αναγνώριση και οι έλεγχοι λειτουργούν κανονικά." };
}

/** Ανέβασμα αρχείου (σύνδεση «Ανέβασμα»): πρώτα προεπισκόπηση (τίποτα δεν αποθηκεύεται), μετά επιβεβαίωση με την αντιστοίχιση. */
export async function uploadStock(id: string, file: { name: string; base64: string; mode: "full" | "delta" }, map: FieldMapping | null, dryRun: boolean): Promise<{ ok: true; data: UploadPreview | { accepted: number; rejected: number; lines: number; batchId: string } } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c || c.type !== "manual") return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  if (!/\.(xlsx|csv|txt|xml|json)$/i.test(file.name)) return { ok: false, error: /\.xls$/i.test(file.name) ? "Το παλιό .xls δεν υποστηρίζεται — αποθήκευσέ το ως .xlsx (Excel → Αποθήκευση ως)." : "Δεκτά αρχεία: .xlsx, .csv, .xml, .json" };
  if (file.base64.length > 4 * 1024 * 1024) return { ok: false, error: "Το αρχείο ξεπερνά τα 3 MB. Κράτα μόνο τις στήλες κωδικού, ποσότητας και καταστήματος." };
  const sync = await syncPartnerToEngine(u.partner.id, { accountId: u.accountId, reason: "ανέβασμα αρχείου" });
  if (!sync.ok) return { ok: false, error: sync.error };
  const r = await engine.upload(id, { filename: file.name.slice(0, 200), mode: file.mode, contentBase64: file.base64, ...(map ? { map } : {}), dryRun });
  if (!r.ok) {
    await portalLog(u.partner.id, "upload", false, `Ανέβασμα «${file.name}»: ${r.error}`, { accountId: u.accountId, connectionId: id, ms: r.ms });
    return { ok: false, error: r.error };
  }
  if (!dryRun) {
    const d = r.data as { accepted: number; rejected: number; lines: number; batchId: string; map: FieldMapping };
    await db.partnerConnection.update({ where: { id }, data: { config: { ...((c.config ?? {}) as object), map: d.map } as Prisma.InputJsonValue, lastOkAt: d.accepted ? new Date() : c.lastOkAt } });
    await portalLog(u.partner.id, "upload", d.accepted > 0, `Ανέβασμα «${file.name}» (${file.mode === "full" ? "πλήρες" : "μόνο αλλαγές"}): ${d.accepted} δεκτές, ${d.rejected} απορρίφθηκαν`, { accountId: u.accountId, connectionId: id, ms: r.ms, detail: { batchId: d.batchId } });
    refresh();
  }
  return { ok: true, data: r.data as never };
}

/** Αντιστοίχιση «αποθήκη τους → κατάστημά μας». Αποθηκεύεται και στη μηχανή (αντικαθίσταται ολόκληρη). */
export async function saveLocationMap(id: string, map: { externalRef: string; name: string; storeId: string | null }[]): Promise<{ ok: true; mapped: number } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  const own = new Set((await db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true } })).map((s) => s.id));
  if (map.some((m) => m.storeId && !own.has(m.storeId))) return { ok: false, error: "Κάποιο κατάστημα δεν ανήκει στον λογαριασμό σας." };
  if (!map.some((m) => m.storeId)) return { ok: false, error: "Αντιστοίχισε τουλάχιστον μία αποθήκη σε κατάστημα." };
  const used = [...new Set(map.map((m) => m.storeId).filter((s): s is string => !!s))];
  // η σύνδεση πρέπει να καλύπτει όσα καταστήματα αντιστοιχίστηκαν
  const storeIds = [...new Set([...c.storeIds, ...used])];
  await db.partnerConnection.update({ where: { id }, data: { storeIds } });
  const sync = await syncPartnerToEngine(u.partner.id, { accountId: u.accountId, reason: "αντιστοίχιση καταστημάτων" });
  if (!sync.ok) return { ok: false, error: sync.error };
  const r = await engine.putLocations(id, map.map((m) => ({ externalRef: m.externalRef.slice(0, 100), storeId: m.storeId })));
  if (!r.ok) { await portalLog(u.partner.id, "mapping", false, `Αντιστοίχιση καταστημάτων: ${r.error}`, { accountId: u.accountId, connectionId: id }); return { ok: false, error: r.error }; }
  await db.partnerConnection.update({ where: { id }, data: { locationMap: map as Prisma.InputJsonValue } });
  await db.partnerChange.create({ data: { partnerId: u.partner.id, accountId: u.accountId, entity: "PartnerConnection", entityId: id, field: "locationMap", before: (c.locationMap ?? null) as Prisma.InputJsonValue, after: map as Prisma.InputJsonValue } });
  await portalLog(u.partner.id, "mapping", true, `Αντιστοίχιση καταστημάτων: ${r.data.mapped} συνδέθηκαν, ${r.data.ignored} αγνοούνται`, { accountId: u.accountId, connectionId: id });
  refresh();
  return { ok: true, mapped: r.data.mapped };
}

/** Ενεργοποίηση: μόνο με επιτυχή έλεγχο (ή ανέβασμα) και τουλάχιστον μία αντιστοιχισμένη αποθήκη. */
export async function setConnectionActive(id: string, active: boolean): Promise<{ ok: true } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  if (active) {
    const mapped = Array.isArray(c.locationMap) && (c.locationMap as { storeId: string | null }[]).some((m) => m.storeId);
    if (!c.lastOkAt) return { ok: false, error: "Χρειάζεται πρώτα επιτυχής έλεγχος σύνδεσης." };
    if (!mapped) return { ok: false, error: "Αντιστοίχισε πρώτα τις αποθήκες σας στα καταστήματα." };
  }
  await db.partnerConnection.update({ where: { id }, data: { status: active ? "active" : "paused", active } });
  if (active) await db.partner.update({ where: { id: u.partner.id }, data: { status: "live" } });
  await syncPartnerToEngine(u.partner.id, { accountId: u.accountId, reason: active ? "ενεργοποίηση" : "παύση" });
  await portalLog(u.partner.id, "connection", true, active ? "Η σύνδεση ενεργοποιήθηκε" : "Η σύνδεση τέθηκε σε παύση", { accountId: u.accountId, connectionId: id });
  refresh();
  return { ok: true };
}

export async function deleteDraftConnection(id: string): Promise<{ ok: true } | Fail> {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false, error: "Η σύνδεση δεν βρέθηκε." };
  if (c.status === "active") return { ok: false, error: "Θέσε πρώτα τη σύνδεση σε παύση." };
  await db.partnerConnection.delete({ where: { id } });
  const { randomUUID } = await import("node:crypto");
  await engine.events([{ type: "connection.deleted", id: randomUUID(), at: new Date().toISOString(), data: { id } }]);
  await portalLog(u.partner.id, "connection", true, `Διαγράφηκε η σύνδεση «${c.label ?? c.type}»`, { accountId: u.accountId });
  refresh();
  return { ok: true };
}

/** Ιστορικό συγχρονισμών μιας σύνδεσης από τη μηχανή (σελίδες). */
export async function connectionBatches(id: string, before?: string) {
  const u = await me();
  const c = await myConnection(u, id);
  if (!c) return { ok: false as const, error: "Η σύνδεση δεν βρέθηκε." };
  return engine.batches(id, 50, before);
}
