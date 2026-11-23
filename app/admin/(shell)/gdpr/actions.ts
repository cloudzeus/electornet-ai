"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { captureEvidence, sha256 } from "@/lib/gdpr/evidence";
import { recordConsent } from "@/lib/gdpr/consent";
import { STAFF_METHODS, STAFF_TOPICS, inForce } from "@/lib/gdpr/topics";
import { isEmail } from "@/lib/newsletter/core";

export async function createGdprRequest(input: { email: string; type: string; channel: string; description: string; identityMethod: string }) {
  const user = await requirePermission("customers.write");
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false as const, error: "Δώσε email." };
  const customer = await db.customer.findUnique({ where: { email } });
  const n = await db.gdprRequest.count();
  const ev = await captureEvidence();
  const requestedAt = new Date();
  const row = await db.gdprRequest.create({ data: { number: `GDPR-${String(n + 1).padStart(5, "0")}`, email, customerId: customer?.id ?? null, type: input.type, channel: input.channel, description: input.description || null, identityMethod: input.identityMethod || null, identityVerifiedAt: input.identityMethod ? new Date() : null, requestedAt, dueAt: new Date(requestedAt.getTime() + 30 * 86400000), staffId: user.id, evidence: { by: user.name, ip: ev.ip, userAgent: ev.userAgent }, timeline: [{ at: requestedAt.toISOString(), status: "open", by: user.name }] } });
  if (customer) await db.customerEvent.create({ data: { customerId: customer.id, kind: "gdpr-request", meta: { number: row.number, type: input.type }, staffId: user.id } });
  await audit(user.id, "gdpr.request.create", "GdprRequest", row.id, null, { number: row.number, type: input.type, email });
  revalidatePath("/admin/gdpr");
  return { ok: true as const, id: row.id };
}

export async function updateGdprRequest(id: string, patch: { status: string; note: string; outcome: string; identityMethod: string }) {
  const user = await requirePermission("customers.write");
  const r = await db.gdprRequest.findUniqueOrThrow({ where: { id } });
  const timeline = [...((r.timeline as { at: string; status: string; note?: string; by?: string }[] | null) ?? []), { at: new Date().toISOString(), status: patch.status, note: patch.note, by: user.name ?? "staff" }];
  await db.gdprRequest.update({ where: { id }, data: { status: patch.status, outcome: patch.outcome || r.outcome, identityMethod: patch.identityMethod || r.identityMethod, identityVerifiedAt: patch.identityMethod && !r.identityVerifiedAt ? new Date() : r.identityVerifiedAt, completedAt: ["done", "rejected"].includes(patch.status) ? new Date() : null, timeline, staffId: user.id } });
  await audit(user.id, "gdpr.request.update", "GdprRequest", id, { status: r.status }, { status: patch.status, outcome: patch.outcome });
  revalidatePath("/admin/gdpr");
  return { ok: true as const };
}

/**
 * Συναίνεση ή ανάκληση που δηλώθηκε εκτός site (έντυπη φόρμα, τηλέφωνο, επιστολή), με email. Νέα γραμμή στο μητρώο,
 * δεμένη με το κείμενο σε ισχύ και με τον υπάλληλο· για newsletter ενημερώνει και τη λίστα συνδρομητών.
 */
export async function recordConsentByEmail(input: { email: string; topic: string; channel: string; granted: boolean; method: string; note: string }) {
  const user = await requirePermission("customers.write");
  const email = input.email.trim().toLowerCase();
  const note = input.note.trim().slice(0, 500);
  if (!isEmail(email)) return { ok: false as const, field: "email" as const, error: "Γράψε ένα σωστό email, π.χ. onoma@example.gr." };
  if (!STAFF_TOPICS.some((t) => t.topic === input.topic && t.channels.includes(input.channel))) return { ok: false as const, field: "topic" as const, error: "Αυτό το θέμα δεν έχει αυτό το κανάλι." };
  if (!(STAFF_METHODS as readonly string[]).includes(input.method)) return { ok: false as const, field: "method" as const, error: "Διάλεξε πώς δηλώθηκε." };
  if (!note) return { ok: false as const, field: "note" as const, error: "Γράψε πού βρίσκεται το αποδεικτικό, π.χ. αριθμό φόρμας και κατάστημα." };
  const customer = await db.customer.findUnique({ where: { email }, select: { id: true } });
  const now = new Date();
  let subscriberId: string | null = null;
  if (input.topic === "newsletter" && input.channel === "email") {
    const state = input.granted ? { status: "subscribed", confirmedAt: now, unsubscribedAt: null, unsubscribeReason: null } : { status: "unsubscribed", unsubscribedAt: now, unsubscribeReason: note };
    subscriberId = (await db.newsletterSubscriber.upsert({ where: { email }, create: { email, customerId: customer?.id ?? null, source: "admin", ...state }, update: state, select: { id: true } })).id;
    if (customer) await db.customer.update({ where: { id: customer.id }, data: { newsletter: input.granted } });
  }
  const row = await recordConsent({ customerId: customer?.id ?? null, subscriberId, email, topic: input.topic, channel: input.channel, granted: input.granted, method: input.method, source: "admin", staffId: user.id, confirmedAt: input.granted ? now : null, evidence: { note, by: user.name } });
  if (customer) await db.customerEvent.create({ data: { customerId: customer.id, kind: "consent", meta: { by: user.name, topic: input.topic, channel: input.channel, granted: input.granted, method: input.method }, staffId: user.id } });
  await audit(user.id, "gdpr.consent.record", "Consent", row.id, null, { email, topic: input.topic, channel: input.channel, granted: input.granted, method: input.method });
  revalidatePath("/admin/gdpr");
  return { ok: true as const, linked: !!customer, version: row.textVersion };
}

/** Νέα έκδοση ενός κειμένου συναίνεσης. Οι παλιές εκδόσεις δεν αλλάζουν ποτέ: οι συναινέσεις τους μένουν δεμένες με το δικό τους κείμενο. */
export async function publishConsentText(input: { key: string; title: string; text: string; version: string; effectiveFrom: string }) {
  const user = await requirePermission("customers.write");
  const text = input.text.trim(), title = input.title.trim(), version = input.version.trim();
  const versions = await db.consentText.findMany({ where: { key: input.key, locale: "el" } });
  if (!versions.length) return { ok: false as const, field: "text" as const, error: "Άγνωστο κείμενο." };
  if (!title) return { ok: false as const, field: "title" as const, error: "Δώσε τίτλο." };
  if (text.length < 20) return { ok: false as const, field: "text" as const, error: "Το κείμενο είναι πολύ σύντομο για να δείχνει σε τι συμφωνεί ο πελάτης." };
  if (!/^[\w.-]{1,20}$/.test(version)) return { ok: false as const, field: "version" as const, error: "Η έκδοση θέλει λατινικά, αριθμούς, τελεία ή παύλα, π.χ. 2026-11." };
  if (versions.some((v) => v.version === version)) return { ok: false as const, field: "version" as const, error: `Η έκδοση ${version} υπάρχει ήδη. Δώσε άλλη, π.χ. ${version}-b.` };
  if (inForce(versions)?.text === text) return { ok: false as const, field: "text" as const, error: "Το κείμενο είναι ίδιο με την έκδοση που ισχύει." };
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || input.effectiveFrom < today) return { ok: false as const, field: "effectiveFrom" as const, error: "Η ημερομηνία ισχύος είναι σήμερα ή αργότερα." };
  // σήμερα = ισχύει αμέσως· αργότερα = από τα μεσάνυχτα (ώρα server) εκείνης της ημέρας
  const effectiveFrom = input.effectiveFrom === today ? new Date() : new Date(`${input.effectiveFrom}T00:00:00`);
  const row = await db.consentText.create({ data: { key: input.key, version, locale: "el", title, text, hash: sha256(text), effectiveFrom, createdBy: user.id } });
  await audit(user.id, "gdpr.text.publish", "ConsentText", row.id, null, { key: input.key, version, effectiveFrom: effectiveFrom.toISOString(), hash: row.hash });
  revalidatePath("/admin/gdpr");
  return { ok: true as const, now: input.effectiveFrom === today };
}
