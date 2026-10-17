import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/gdpr/consent";
import { unsubscribe } from "./index";

/**
 * Διαγραφή παραλήπτη και γεγονότα Mailgun (spec §7).
 * Όλα ιδεμποτικά: ο μετρητής ενός γεγονότος ανεβαίνει μόνο την πρώτη φορά που μπαίνει η χρονική σήμανση στη γραμμή παραλήπτη.
 */

const lower = (e: string) => e.trim().toLowerCase();
/** Θέματα συναίνεσης που κόβονται όταν κάποιος διαγράφεται ή παραπονιέται. */
const TOPICS = ["offers", "newsletter"] as const;

export type UnsubVia = "link" | "one-click" | "mailgun";

/** Συνδρομητής και πελάτης ενός παραλήπτη: με το id που κρατήθηκε στην ουρά, αλλιώς με το email. */
async function identities(rec: { email: string; subscriberId: string | null; customerId: string | null }) {
  const email = lower(rec.email);
  const subscriber = rec.subscriberId
    ? await db.newsletterSubscriber.findUnique({ where: { id: rec.subscriberId } })
    : await db.newsletterSubscriber.findUnique({ where: { email } });
  const customer = rec.customerId
    ? await db.customer.findUnique({ where: { id: rec.customerId }, select: { id: true } })
    : subscriber?.customerId ? null : await db.customer.findUnique({ where: { email }, select: { id: true } });
  return { subscriber, customer };
}

/**
 * Διαγραφή από προσωπικό σύνδεσμο / one-click / Mailgun.
 * Συνδρομητής → `unsubscribe` (status + Consent + email επιβεβαίωσης)· πελάτης χωρίς συνδρομητή → Consent granted=false
 * (offers και newsletter) + `customer.newsletter=false`. `unsubscribedAt` και μετρητής μόνο την πρώτη φορά· άγνωστο token → ok:false.
 */
export async function unsubscribeRecipient(token: string, via: UnsubVia): Promise<{ ok: boolean; email?: string }> {
  if (!token || token.length > 128) return { ok: false };
  const rec = await db.newsletterRecipient.findUnique({ where: { token } });
  if (!rec) return { ok: false };
  // Ατομική διεκδίκηση: μόνο όποιος βάζει πρώτος το unsubscribedAt μετρά και εφαρμόζει τη διαγραφή.
  const first = await db.$transaction(async (tx) => {
    const r = await tx.newsletterRecipient.updateMany({ where: { id: rec.id, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    if (r.count) await tx.newsletter.update({ where: { id: rec.newsletterId }, data: { unsubscribed: { increment: 1 } } });
    return r.count > 0;
  });
  if (!first) return { ok: true, email: rec.email };
  try {
    const { subscriber, customer } = await identities(rec);
    if (subscriber) await unsubscribe(subscriber.token, `newsletter:${via}`);
    if (customer && (!subscriber || subscriber.customerId !== customer.id)) {
      for (const topic of TOPICS) {
        await recordConsent({ customerId: customer.id, email: lower(rec.email), topic, channel: "email", granted: false, method: "one-click", source: "api", textKey: topic === "newsletter" ? "newsletter" : undefined, evidence: { step: "unsubscribe", via, newsletterId: rec.newsletterId } });
      }
      await db.customer.update({ where: { id: customer.id }, data: { newsletter: false } });
    }
  } catch (e) {
    // Δεν εφαρμόστηκε ολόκληρη: ξεκλείδωμα, ώστε η επόμενη προσπάθεια (ο χρήστης ή ο πάροχος) να τη ξανακάνει.
    await db.$transaction([
      db.newsletterRecipient.updateMany({ where: { id: rec.id }, data: { unsubscribedAt: null } }),
      db.newsletter.update({ where: { id: rec.newsletterId }, data: { unsubscribed: { decrement: 1 } } }),
    ]).catch(() => undefined);
    throw e;
  }
  return { ok: true, email: rec.email };
}

export type MailgunEvent = { id: string; event: string; recipient: string; newsletterId?: string; url?: string; severity?: string; timestamp: number };
export type EventResult = "applied" | "duplicate" | "ignored";

type Tx = Prisma.TransactionClient;
type Rec = { id: string; newsletterId: string; email: string; subscriberId: string | null; customerId: string | null; token: string };
type Stamp = "deliveredAt" | "openedAt" | "clickedAt" | "bouncedAt" | "complainedAt";
type Counter = "delivered" | "opened" | "clicked" | "bounced" | "complained";

/** Χρονική σήμανση μόνο την πρώτη φορά + αύξηση του μετρητή του newsletter μόνο τότε. */
async function stampOnce(tx: Tx, rec: Rec, field: Stamp, counter: Counter, at: Date) {
  const r = await tx.newsletterRecipient.updateMany({ where: { id: rec.id, [field]: null }, data: { [field]: at } });
  if (r.count) await tx.newsletter.update({ where: { id: rec.newsletterId }, data: { [counter]: { increment: 1 } } });
}

/**
 * Εφαρμογή ενός γεγονότος Mailgun. Το Mailgun δίνει ένα message id ανά πακέτο, γι' αυτό ο παραλήπτης βρίσκεται
 * από το `v:newsletter` + email. Χωρίς newsletterId (συναλλακτικά emails) ή άγνωστος παραλήπτης/τύπος → «ignored».
 * Πρώτα εγγράφεται το `NewsletterEvent` (id του Mailgun)· διπλό → «duplicate» χωρίς παρενέργειες.
 */
export async function applyMailgunEvent(e: MailgunEvent): Promise<EventResult> {
  if (!e.newsletterId || !e.id || !e.recipient) return "ignored";
  const type = e.event;
  const handled = type === "delivered" || type === "opened" || type === "clicked" || type === "complained" || type === "unsubscribed" || (type === "failed" && e.severity === "permanent");
  if (!handled) return "ignored";
  const rec = await db.newsletterRecipient.findUnique({ where: { newsletterId_email: { newsletterId: e.newsletterId, email: lower(e.recipient) } }, select: { id: true, newsletterId: true, email: true, subscriberId: true, customerId: true, token: true } });
  if (!rec) return "ignored";
  const at = Number.isFinite(e.timestamp) && e.timestamp > 0 ? new Date(e.timestamp * 1000) : new Date();
  const email = lower(rec.email);
  const eventRow = { id: e.id, recipientId: rec.id, type: type === "failed" ? "bounced" : type, url: e.url ? e.url.slice(0, 2000) : null, at };

  if (type === "delivered" || type === "opened" || type === "clicked" || type === "failed") {
    const applied = await db.$transaction(async (tx) => {
      // skipDuplicates: διπλό id → count 0 χωρίς σφάλμα (και χωρίς θόρυβο στα logs)
      if (!(await tx.newsletterEvent.createMany({ data: eventRow, skipDuplicates: true })).count) return false;
      if (type === "delivered") await stampOnce(tx, rec, "deliveredAt", "delivered", at);
      else if (type === "opened") await stampOnce(tx, rec, "openedAt", "opened", at);
      else if (type === "clicked") await stampOnce(tx, rec, "clickedAt", "clicked", at);
      else {
        await stampOnce(tx, rec, "bouncedAt", "bounced", at);
        // συνδρομητής: bounced (δεν γράφουμε πάνω σε unsubscribed / complained)
        await tx.newsletterSubscriber.updateMany({ where: { email: { equals: email, mode: "insensitive" }, status: { in: ["subscribed", "pending"] } }, data: { status: "bounced" } });
        await tx.newsletterSubscriber.updateMany({ where: { email: { equals: email, mode: "insensitive" }, bouncedAt: null }, data: { bouncedAt: at } });
      }
      return true;
    });
    return applied ? "applied" : "duplicate";
  }

  // complained / unsubscribed: έχουν παρενέργειες εκτός συναλλαγής (Consent, email) — το γεγονός γράφεται πρώτο και σβήνεται αν αποτύχουν (ο πάροχος ξαναδοκιμάζει).
  if (!(await db.newsletterEvent.createMany({ data: eventRow, skipDuplicates: true })).count) return "duplicate";
  try {
    if (type === "unsubscribed") await unsubscribeRecipient(rec.token, "mailgun");
    else {
      await db.$transaction(async (tx) => {
        await stampOnce(tx, rec, "complainedAt", "complained", at);
        await tx.newsletterSubscriber.updateMany({ where: { email: { equals: email, mode: "insensitive" } }, data: { status: "complained" } });
      });
      const { subscriber, customer } = await identities(rec);
      if (subscriber || customer) {
        for (const topic of TOPICS) {
          // ένα παράπονο = μία γραμμή ανά θέμα (δεύτερο γεγονός για τον ίδιο παραλήπτη δεν διπλογράφει· η επανάληψη μετά από σφάλμα συμπληρώνει)
          if (await db.consent.findFirst({ where: { email, topic, method: "complaint", granted: false }, select: { id: true } })) continue;
          await recordConsent({ subscriberId: subscriber?.id ?? null, customerId: customer?.id ?? subscriber?.customerId ?? null, email, topic, channel: "email", granted: false, method: "complaint", source: "api", textKey: topic === "newsletter" ? "newsletter" : undefined, evidence: { step: "complaint", eventId: e.id, newsletterId: rec.newsletterId } });
        }
        const cid = customer?.id ?? subscriber?.customerId;
        if (cid) await db.customer.update({ where: { id: cid }, data: { newsletter: false } });
      }
    }
  } catch (err) {
    await db.newsletterEvent.deleteMany({ where: { id: e.id } }).catch(() => undefined);
    throw err;
  }
  return "applied";
}
