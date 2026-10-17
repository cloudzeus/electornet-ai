import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Καθαρή λογική του newsletter προσφοράς — χωρίς βάση, ρυθμίσεις ή server-only. */

export type Block =
  | { type: "hero"; image?: string | null; alt: string; href: string; headline: string; sub: string }
  | { type: "text"; body: string }
  | { type: "products"; ids: string[] }
  | { type: "cta"; label: string; href: string };

/** JSON με ταξινομημένα κλειδιά, ώστε η ίδια είσοδος να δίνει πάντα το ίδιο κείμενο. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Αποτύπωμα περιεχομένου: η δοκιμή ισχύει μόνο αν δεν άλλαξε τίποτα μετά. */
export function contentHash(n: { subject: string; preheader: string; blocks: Block[] }): string {
  return createHash("sha256").update(stable({ subject: n.subject, preheader: n.preheader, blocks: n.blocks })).digest("hex");
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
/** Καταστάσεις συνδρομητή που αποκλείουν το email ακόμη και αν υπάρχει πελάτης με συναίνεση. */
const BLOCKED = new Set(["unsubscribed", "bounced", "complained"]);

export type AudienceRow = { email: string; subscriberId: string | null; customerId: string | null; firstName: string | null };

/**
 * Κοινό αποστολής: συνδρομητές subscribed ∪ πελάτες με συναίνεση, ένα ανά email.
 * Κερδίζει η γραμμή συνδρομητή· αποκλεισμός (unsubscribed/bounced/complained) νικά πάντα.
 * Με segment (id πελατών) μένουν μόνο όσοι αντιστοιχούν σε πελάτη του συνόλου.
 */
export function audienceOf(input: {
  subscribers: { id: string; email: string; status: string; firstName?: string | null; customerId?: string | null }[];
  customers: { id: string; email: string | null; firstName?: string | null; allowed: boolean }[];
  segment?: Set<string> | null;
}): AudienceRow[] {
  const blocked = new Set<string>();
  for (const s of input.subscribers) if (BLOCKED.has(s.status)) blocked.add(normEmail(s.email));

  const customerByEmail = new Map<string, { id: string; firstName?: string | null }>();
  for (const c of input.customers) {
    const e = normEmail(c.email);
    if (e && !customerByEmail.has(e)) customerByEmail.set(e, c);
  }

  const out = new Map<string, AudienceRow>();
  for (const s of input.subscribers) {
    if (s.status !== "subscribed") continue;
    const email = normEmail(s.email);
    if (!EMAIL_RE.test(email) || blocked.has(email) || out.has(email)) continue;
    const c = customerByEmail.get(email);
    out.set(email, { email, subscriberId: s.id, customerId: s.customerId ?? c?.id ?? null, firstName: s.firstName ?? c?.firstName ?? null });
  }
  for (const c of input.customers) {
    if (!c.allowed) continue;
    const email = normEmail(c.email);
    if (!EMAIL_RE.test(email) || blocked.has(email) || out.has(email)) continue;
    out.set(email, { email, subscriberId: null, customerId: c.id, firstName: c.firstName ?? null });
  }

  const rows = [...out.values()];
  return input.segment ? rows.filter((r) => r.customerId !== null && input.segment!.has(r.customerId)) : rows;
}

/** Αριθμός → κανονική μορφή ("20,50" → "20.5"). */
const num = (s: string) => String(parseFloat(s.replace(",", ".")));
/** Μονάδες και ημερομηνίες ενός κειμένου, κανονικοποιημένες: "20%", "199€", "31/10". */
function claims(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s?(%|€)/g)) out.add(`${num(m[1])}${m[2]}`);
  for (const m of text.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?!\d)/g)) out.add(`${Number(m[1])}/${Number(m[2])}`);
  return out;
}

/** Κάθε ποσοστό, ποσό και ημερομηνία του κειμένου πρέπει να προκύπτει από τα facts (ό,τι ξέρει το σύστημα). */
export function factCheck(text: string, facts: string[]): boolean {
  const known = new Set<string>();
  for (const f of facts) for (const c of claims(f)) known.add(c);
  for (const c of claims(text)) if (!known.has(c)) return false;
  return true;
}

const MIN = 60_000;
const DAY = 86_400_000;
const athensHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", hourCycle: "h23" });

/** Προγραμματισμός: 5 λεπτά έως 30 ημέρες μπροστά· «νύχτα» = 22:00–08:00 ώρα Ελλάδας. */
export function validateSchedule(at: Date, now: Date): { ok: true; night: boolean } | { ok: false; error: string } {
  const t = at.getTime();
  if (Number.isNaN(t)) return { ok: false, error: "Μη έγκυρη ημερομηνία αποστολής." };
  if (t < now.getTime() + 5 * MIN) return { ok: false, error: "Η αποστολή πρέπει να προγραμματιστεί τουλάχιστον 5 λεπτά από τώρα." };
  if (t > now.getTime() + 30 * DAY) return { ok: false, error: "Η αποστολή δεν μπορεί να προγραμματιστεί πάνω από 30 ημέρες μπροστά." };
  const hour = Number(athensHour.format(at));
  return { ok: true, night: hour >= 22 || hour < 8 };
}

/** Σπάει τη λίστα σε πακέτα (Mailgun: έως 1.000 παραλήπτες ανά κλήση). */
export function batches<T>(rows: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("Το μέγεθος πακέτου πρέπει να είναι θετικός ακέραιος.");
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Mailgun recipient-variables: κλειδί το email, με προσωπικό σύνδεσμο διαγραφής και όνομα. */
export function recipientVariables(rows: { email: string; token: string; firstName: string | null }[], base: string): Record<string, { unsub: string; name: string }> {
  const b = base.replace(/\/+$/, "");
  return Object.fromEntries(rows.map((r) => [r.email, { unsub: `${b}/api/newsletter/u/${r.token}`, name: r.firstName ?? "" }]));
}

/** Υπογραφή webhook Mailgun: HMAC-SHA256(key, timestamp + token) σε hex· απόρριψη αν η ώρα απέχει > 900 s. */
export function verifyMailgun(sig: { timestamp: string; token: string; signature: string }, key: string, nowSec: number): boolean {
  const ts = Number(sig.timestamp);
  if (!sig.timestamp || !Number.isFinite(ts) || Math.abs(nowSec - ts) > 900) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(sig.timestamp + sig.token).digest("hex"));
  const given = Buffer.from(sig.signature ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
