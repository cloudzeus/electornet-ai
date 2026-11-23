import "server-only";
import { db } from "@/lib/db";
import { captureEvidence, sha256 } from "./evidence";
import { textKeyForTopic } from "./topics";

/** Η έκδοση σε ισχύ για ένα κείμενο συναίνεσης: η πιο πρόσφατη ενεργή που έχει ήδη ξεκινήσει (νέες εκδόσεις: Διαχείριση → GDPR → Κείμενα). */
export async function activeConsentText(key: string, locale = "el") {
  return db.consentText.findFirst({ where: { key, locale, active: true, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } });
}

/**
 * Record one consent decision with full evidence. Immutable append.
 * Pass `text` when the exact wording shown is known (its hash is stored);
 * otherwise the active ConsentText for the key is referenced. Χωρίς `textKey` παίρνει το κείμενο του θέματος,
 * ώστε κάθε εγγραφή να δείχνει ποια διατύπωση ίσχυε.
 */
export async function recordConsent(input: {
  customerId?: string | null; subscriberId?: string | null; email?: string | null;
  topic: string; channel?: string; granted: boolean; method?: string; source: string;
  textKey?: string; text?: string; url?: string | null; timezone?: string | null; staffId?: string | null; evidence?: unknown; confirmedAt?: Date | null;
}) {
  const ev = await captureEvidence({ url: input.url, timezone: input.timezone });
  // χωρίς ρητό κλειδί: το κείμενο του θέματος (π.χ. price-drop → offers)
  const textKey = input.textKey ?? textKeyForTopic(input.topic);
  const ct = textKey ? await activeConsentText(textKey) : null;
  return db.consent.create({
    data: {
      customerId: input.customerId ?? null, subscriberId: input.subscriberId ?? null, email: input.email ?? null,
      topic: input.topic, channel: input.channel ?? "email", granted: input.granted, method: input.method ?? "checkbox", source: input.source,
      textKey, textVersion: ct?.version ?? null, textHash: input.text ? sha256(input.text) : ct?.hash ?? null,
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
