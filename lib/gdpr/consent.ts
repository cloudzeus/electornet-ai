import "server-only";
import { db } from "@/lib/db";
import { captureEvidence, sha256 } from "./evidence";

/** Active wording for a consent key (seeded defaults live in prisma/seed-gdpr.ts). */
export async function activeConsentText(key: string, locale = "el") {
  return db.consentText.findFirst({ where: { key, locale, active: true }, orderBy: { effectiveFrom: "desc" } });
}

/**
 * Record one consent decision with full evidence. Immutable append.
 * Pass `text` when the exact wording shown is known (its hash is stored);
 * otherwise the active ConsentText for the key is referenced.
 */
export async function recordConsent(input: {
  customerId?: string | null; subscriberId?: string | null; email?: string | null;
  topic: string; channel?: string; granted: boolean; method?: string; source: string;
  textKey?: string; text?: string; url?: string | null; timezone?: string | null; staffId?: string | null; evidence?: unknown; confirmedAt?: Date | null;
}) {
  const ev = await captureEvidence({ url: input.url, timezone: input.timezone });
  const ct = input.textKey ? await activeConsentText(input.textKey) : null;
  return db.consent.create({
    data: {
      customerId: input.customerId ?? null, subscriberId: input.subscriberId ?? null, email: input.email ?? null,
      topic: input.topic, channel: input.channel ?? "email", granted: input.granted, method: input.method ?? "checkbox", source: input.source,
      textKey: input.textKey ?? null, textVersion: ct?.version ?? null, textHash: input.text ? sha256(input.text) : ct?.hash ?? null,
      url: ev.url, ip: ev.ip, ipHash: ev.ipHash, userAgent: ev.userAgent, os: ev.os, browser: ev.browser, device: ev.device, locale: ev.locale, timezone: ev.timezone, referer: ev.referer,
      confirmedAt: input.confirmedAt ?? null, evidence: (input.evidence ?? undefined) as object | undefined, staffId: input.staffId ?? null,
    },
  });
}

/** Login attempt with evidence (customers and staff). */
export async function recordLogin(input: { customerId?: string | null; staffId?: string | null; email: string; success: boolean; method: string; reason?: string | null; sessionId?: string | null }) {
  const ev = await captureEvidence();
  return db.loginEvent.create({ data: { customerId: input.customerId ?? null, staffId: input.staffId ?? null, email: input.email, success: input.success, method: input.method, reason: input.reason ?? null, sessionId: input.sessionId ?? null, ip: ev.ip, ipHash: ev.ipHash, userAgent: ev.userAgent, os: ev.os, browser: ev.browser, device: ev.device } }).catch(() => null);
}
