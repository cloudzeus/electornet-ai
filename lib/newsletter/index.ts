import "server-only";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/gdpr/consent";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

const base = () => (process.env.AUTH_URL ?? "http://localhost:3111").replace(/\/$/, "");

/**
 * Newsletter with double opt-in. Every step writes a Consent row with
 * evidence: subscribe (granted, method double-opt-in pending), confirm
 * (confirmedAt + confirm IP), unsubscribe (granted=false).
 */
export async function subscribe(input: { email: string; firstName?: string | null; source: string; url?: string | null; timezone?: string | null; consentText?: string; lists?: string[]; customerId?: string | null }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: "Μη έγκυρο email." };
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === "subscribed") return { ok: true as const, status: "subscribed" as const, already: true };
  const customer = input.customerId ? null : await db.customer.findUnique({ where: { email }, select: { id: true } });
  const sub = existing
    ? await db.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: "pending", firstName: input.firstName ?? existing.firstName, source: input.source, lists: input.lists ?? existing.lists, unsubscribedAt: null, unsubscribeReason: null } })
    : await db.newsletterSubscriber.create({ data: { email, firstName: input.firstName ?? null, source: input.source, lists: input.lists ?? ["general"], customerId: input.customerId ?? customer?.id ?? null } });
  await recordConsent({ subscriberId: sub.id, customerId: sub.customerId, email, topic: "newsletter", channel: "email", granted: true, method: "double-opt-in", source: input.source, textKey: "newsletter", text: input.consentText, url: input.url, timezone: input.timezone, evidence: { step: "subscribe", firstName: input.firstName ?? null } });
  const link = `${base()}/api/newsletter/confirm?token=${sub.token}`;
  const m = await renderTemplate("newsletter-confirm", { firstName: input.firstName ?? null, confirmUrl: link });
  await sendMail({ to: email, template: "newsletter-confirm", meta: { subscriberId: sub.id }, ...m });
  return { ok: true as const, status: "pending" as const, already: false };
}

export async function confirm(token: string, url?: string | null) {
  const sub = await db.newsletterSubscriber.findUnique({ where: { token } });
  if (!sub) return { ok: false as const, error: "Ο σύνδεσμος δεν ισχύει." };
  if (sub.status === "subscribed") return { ok: true as const, already: true };
  await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: "subscribed", confirmedAt: new Date() } });
  await recordConsent({ subscriberId: sub.id, customerId: sub.customerId, email: sub.email, topic: "newsletter", channel: "email", granted: true, method: "double-opt-in", source: sub.source, textKey: "newsletter", url, confirmedAt: new Date(), evidence: { step: "confirm" } });
  if (sub.customerId) await db.customer.update({ where: { id: sub.customerId }, data: { newsletter: true } });
  const m = await renderTemplate("newsletter-welcome", { firstName: sub.firstName }, { unsubscribeUrl: `${base()}/api/newsletter/unsubscribe?token=${sub.token}` });
  await sendMail({ to: sub.email, template: "newsletter-welcome", meta: { subscriberId: sub.id }, ...m });
  return { ok: true as const, already: false };
}

export async function unsubscribe(token: string, reason?: string | null, url?: string | null, staffId?: string | null) {
  const sub = await db.newsletterSubscriber.findUnique({ where: { token } });
  if (!sub) return { ok: false as const, error: "Ο σύνδεσμος δεν ισχύει." };
  await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: "unsubscribed", unsubscribedAt: new Date(), unsubscribeReason: reason ?? null } });
  await recordConsent({ subscriberId: sub.id, customerId: sub.customerId, email: sub.email, topic: "newsletter", channel: "email", granted: false, method: staffId ? "admin" : "checkbox", source: staffId ? "admin" : "email-link", textKey: "newsletter", url, staffId, evidence: { step: "unsubscribe", reason: reason ?? null } });
  if (sub.customerId) await db.customer.update({ where: { id: sub.customerId }, data: { newsletter: false } });
  const m = await renderTemplate("newsletter-unsubscribed", { email: sub.email });
  await sendMail({ to: sub.email, template: "newsletter-unsubscribed", meta: { subscriberId: sub.id }, ...m });
  return { ok: true as const };
}
