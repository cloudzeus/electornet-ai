"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { unsubscribe, subscribe } from "@/lib/newsletter";
import { recordConsent } from "@/lib/gdpr/consent";

export async function adminUnsubscribe(id: string, reason: string) {
  const user = await requirePermission("marketing.newsletter.write");
  const s = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id } });
  const r = await unsubscribe(s.token, reason || "admin", null, user.id);
  await audit(user.id, "newsletter.unsubscribe", "NewsletterSubscriber", id, { status: s.status }, { status: "unsubscribed", reason });
  revalidatePath("/admin/newsletter");
  return r;
}
export async function adminAdd(email: string, firstName: string, source: string) {
  const user = await requirePermission("marketing.newsletter.write");
  const r = await subscribe({ email, firstName: firstName || null, source: source || "admin", consentText: "Καταχώρηση από διαχείριση κατόπιν αιτήματος του πελάτη (π.χ. έντυπη φόρμα καταστήματος)." });
  await audit(user.id, "newsletter.add", "NewsletterSubscriber", email, null, { source });
  revalidatePath("/admin/newsletter");
  return r;
}
/** Mark as confirmed without the email (e.g. signed paper form in a store) — records who did it and why. */
export async function adminConfirm(id: string, evidenceNote: string) {
  const user = await requirePermission("marketing.newsletter.write");
  const s = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id } });
  await db.newsletterSubscriber.update({ where: { id }, data: { status: "subscribed", confirmedAt: new Date() } });
  await recordConsent({ subscriberId: id, customerId: s.customerId, email: s.email, topic: "newsletter", channel: "email", granted: true, method: "store-form", source: "admin", textKey: "newsletter", staffId: user.id, confirmedAt: new Date(), evidence: { note: evidenceNote } });
  if (s.customerId) await db.customer.update({ where: { id: s.customerId }, data: { newsletter: true } });
  await audit(user.id, "newsletter.confirm", "NewsletterSubscriber", id, { status: s.status }, { status: "subscribed", evidenceNote });
  revalidatePath("/admin/newsletter");
  return { ok: true as const };
}
export async function exportCsv(status: string) {
  const user = await requirePermission("marketing.newsletter.write");
  const rows = await db.newsletterSubscriber.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" } });
  await audit(user.id, "newsletter.export", "NewsletterSubscriber", "*", null, { status, count: rows.length });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["email,firstName,status,source,lists,confirmedAt,unsubscribedAt,createdAt", ...rows.map((r) => [r.email, r.firstName, r.status, r.source, r.lists.join("|"), r.confirmedAt?.toISOString() ?? "", r.unsubscribedAt?.toISOString() ?? "", r.createdAt.toISOString()].map(esc).join(","))].join("\n");
}
