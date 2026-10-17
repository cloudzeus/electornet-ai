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

/**
 * Αυστηρός έλεγχος email (ένας για όλο το newsletter): τοπικό μέρος χωρίς κενά και χωρίς `,;<>"()[]\\`, χωρίς τελεία
 * στην αρχή/τέλος ή διπλή· domain από ετικέτες [A-Za-z0-9-] (όχι «-» στην αρχή/τέλος), χωρίς διπλή τελεία, TLD ≥ 2 γράμματα.
 * Έτσι το «a@x.gr,b» (δύο παραλήπτες σε ένα πεδίο) ή το «a@b..gr» δεν φτάνουν ποτέ στον πάροχο.
 */
const EMAIL_RE = /^(?!\.)(?!.*\.\.)[^\s@,;<>"()[\]\\]+(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
export const isEmail = (e: string) => EMAIL_RE.test(e);
const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
/** Καταστάσεις συνδρομητή που αποκλείουν το email ακόμη και αν υπάρχει πελάτης με συναίνεση. */
const BLOCKED = new Set(["unsubscribed", "bounced", "complained"]);

export type AudienceRow = { email: string; subscriberId: string | null; customerId: string | null; firstName: string | null };

/**
 * Κοινό αποστολής: συνδρομητές subscribed ∪ πελάτες με συναίνεση, ένα ανά email.
 * Κερδίζει η γραμμή συνδρομητή· αποκλεισμός (unsubscribed/bounced/complained ή πελάτης με τελευταία συναίνεση «όχι») νικά πάντα.
 * Με segment (id πελατών) μένουν μόνο όσοι αντιστοιχούν σε πελάτη του συνόλου.
 * Με `emails` (λίστα επιτρεπόμενων, π.χ. δοκιμή) μένουν μόνο αυτές — οι κανόνες συναίνεσης ισχύουν κανονικά· [] = κανείς.
 */
export function audienceOf(input: {
  subscribers: { id: string; email: string; status: string; firstName?: string | null; customerId?: string | null }[];
  customers: { id: string; email: string | null; firstName?: string | null; allowed: boolean; optedOut?: boolean }[];
  segment?: Set<string> | null;
  emails?: string[] | null;
}): AudienceRow[] {
  const blocked = new Set<string>();
  for (const s of input.subscribers) if (BLOCKED.has(s.status)) blocked.add(normEmail(s.email));
  for (const c of input.customers) if (c.optedOut) blocked.add(normEmail(c.email));

  const customerByEmail = new Map<string, { id: string; firstName?: string | null }>();
  for (const c of input.customers) {
    const e = normEmail(c.email);
    if (e && !customerByEmail.has(e)) customerByEmail.set(e, c);
  }

  const out = new Map<string, AudienceRow>();
  for (const s of input.subscribers) {
    if (s.status !== "subscribed") continue;
    const email = normEmail(s.email);
    if (!isEmail(email) || blocked.has(email) || out.has(email)) continue;
    const c = customerByEmail.get(email);
    out.set(email, { email, subscriberId: s.id, customerId: s.customerId ?? c?.id ?? null, firstName: s.firstName ?? c?.firstName ?? null });
  }
  for (const c of input.customers) {
    if (!c.allowed) continue;
    const email = normEmail(c.email);
    if (!isEmail(email) || blocked.has(email) || out.has(email)) continue;
    out.set(email, { email, subscriberId: null, customerId: c.id, firstName: c.firstName ?? null });
  }

  let rows = [...out.values()];
  if (input.emails) { const only = new Set(input.emails.map(normEmail)); rows = rows.filter((r) => only.has(r.email)); }
  return input.segment ? rows.filter((r) => r.customerId !== null && input.segment!.has(r.customerId)) : rows;
}

/** Ρυθμίσεις κοινού του newsletter (`audience` της γραμμής): `segmentId` (κοινό πελατών) και `emails` (λίστα επιτρεπόμενων — π.χ. δοκιμή). */
export type AudienceSpec = { segmentId?: string; emails?: string[] };
/** `emails` που υπάρχει αλλά δεν είναι πίνακας → [] (κανείς): χαλασμένη λίστα δοκιμής δεν γίνεται ποτέ «όλοι». */
export function audienceSpec(a: unknown): AudienceSpec {
  const o = (a && typeof a === "object" && !Array.isArray(a) ? a : {}) as Record<string, unknown>;
  return {
    ...(typeof o.segmentId === "string" && o.segmentId ? { segmentId: o.segmentId } : {}),
    ...("emails" in o ? { emails: Array.isArray(o.emails) ? o.emails.filter((e): e is string => typeof e === "string").map(normEmail).filter(Boolean) : [] } : {}),
  };
}

/** Λειτουργία δοκιμής: env `NEWSLETTER_TESTMODE=1` της διεργασίας ή σημαία `testMode` της γραμμής (μπήκε όταν φτιάχτηκε / προγραμματίστηκε σε δοκιμή). */
export function isTestMode(row: { testMode?: boolean | null } | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.NEWSLETTER_TESTMODE === "1" || !!row?.testMode;
}

/** Αριθμός → κανονική μορφή: "20,50" → "20.5", ελληνικά χιλιάδες "1.299,90" → "1299.9". */
const num = (s: string) => String(parseFloat(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".")));
const MONTHS = ["ιανουαρ", "φεβρουαρ", "μαρτ", "απριλ", "μαι", "ιουν", "ιουλ", "αυγουστ", "σεπτεμβρ", "οκτωβρ", "νοεμβρ", "δεκεμβρ"];
const NUMBER = String.raw`([1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
/** Μονάδα μετά τον αριθμό: % / «τοις εκατό» / «τοις %» → %, € / ευρώ / EUR → €. */
const UNIT = String.raw`(%|€|(?:ευρω|eur|τοι[σς]\s+εκατο)(?!\p{L})|τοι[σς]\s*%)`;
/** Ποσότητες που μοιάζουν με ημερομηνία («2-3 ημέρες») δεν είναι ημερομηνίες. */
const QUANTITY = String.raw`\s*(?:ημερ|ωρ|εργασιμ|χρον|ετ[ηω]|τεμαχ|ατομ|λεπτ|μην|εβδομαδ)`;
const unitOf = (u: string) => (u.startsWith("%") || u.startsWith("τοι") ? "%" : "€");
const dayMonth = (d: string, m: string | number) => { const dd = Number(d), mm = Number(m); return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 ? `${dd}/${mm}` : null; };

/**
 * Μονάδες και ημερομηνίες ενός κειμένου, κανονικοποιημένες: "20%", "199€", "31/10".
 * Πιάνει και ελληνικές διατυπώσεις: «30 τοις εκατό», «399 ευρώ», «EUR», «€399», «15 Νοεμβρίου» / «1η Δεκεμβρίου»,
 * «15.11», «15-11-2026» (χωρίς τόνους / κεφαλαία).
 */
function claims(text: string): Set<string> {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const out = new Set<string>();
  const add = (v: string | null) => { if (v) out.add(v); };
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.,])${NUMBER}\s?${UNIT}`, "gu"))) out.add(`${num(m[1])}${unitOf(m[2])}`);
  for (const m of t.matchAll(new RegExp(String.raw`€\s?${NUMBER}(?![\d.,]*\s?(?:%|€))`, "gu"))) out.add(`${num(m[1])}€`);
  for (const m of t.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?!\d)/g)) out.add(`${Number(m[1])}/${Number(m[2])}`);
  // d.m, d.m.yyyy, d-m, d-m-yyyy (όχι δεκαδικά με μονάδα, εύρη ποσοστών ή ποσότητες)
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.,/-])(\d{1,2})([.-])(\d{1,2})(?:\2\d{2,4})?(?![\d.,]*\s?${UNIT}|[\d]|[.,]\d|-\d|${QUANTITY})`, "gu"))) add(dayMonth(m[1], m[3]));
  // «15 Νοεμβρίου», «1η Δεκεμβρίου», «5 Μαΐου» (ονομαστική και γενική)
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.,/])(\d{1,2})(?:ης|η)?\s+(${MONTHS.join("|")})(?:ιος|ιου|ιοσ|ος|ου|οσ)(?!\p{L})`, "gu"))) add(dayMonth(m[1], MONTHS.indexOf(m[2]) + 1));
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

/**
 * Έλεγχος πριν από (και στην έναρξη της) αποστολής: προσφορά scheduled|active, όχι held, όχι ληγμένη· καμπάνια scheduled|live.
 * Επιστρέφει τον λόγο ακύρωσης ή null. Newsletter χωρίς προσφορά και καμπάνια (γενικό) περνά.
 */
export function startCheck(n: { promotion?: { status: string; held: boolean; endsAt: Date | null } | null; campaign?: { status: string } | null }, now: Date): string | null {
  const p = n.promotion;
  if (p) {
    if (p.held) return "Η προσφορά είναι σε αναμονή (held) — δεν εφαρμόζεται.";
    if (p.status !== "scheduled" && p.status !== "active") return `Η προσφορά δεν είναι προγραμματισμένη ή ενεργή (κατάσταση: ${p.status}).`;
    if (p.endsAt && p.endsAt.getTime() <= now.getTime()) return "Η προσφορά έληξε.";
  }
  const c = n.campaign;
  if (c && c.status !== "scheduled" && c.status !== "live") return `Η καμπάνια δεν είναι προγραμματισμένη ή σε εξέλιξη (κατάσταση: ${c.status}).`;
  return null;
}

/** Σφάλματα σύνδεσης όπου το αίτημα δεν έφτασε ποτέ στον server (DNS, άρνηση / αδύνατη σύνδεση, timeout σύνδεσης). */
const NOT_CONNECTED = new Set(["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "EDNS"]);

export type SendErrorKind = "retry" | "fatal" | "uncertain";

/**
 * Τι σημαίνει μια αποτυχία κλήσης στον πάροχο για τους παραλήπτες της:
 * - «retry»: σίγουρα δεν στάλθηκε — το αίτημα δεν έφτασε (DNS / άρνηση σύνδεσης) ή απάντηση HTTP 429 / 5xx → ξανά στην ουρά.
 * - «fatal»: ο πάροχος απάντησε με άλλο 4xx (κλειδί, domain, άκυρο αίτημα) — δεν στάλθηκε, αλλά δεν διορθώνεται μόνο του.
 * - «uncertain»: timeout / abort / κοπή σύνδεσης αφού γράφτηκε το αίτημα (ECONNRESET κ.λπ.) ή άγνωστο — ίσως στάλθηκε.
 *   Ποτέ ξανά στην ουρά (καλύτερα να χαθεί ένα email παρά να φτάσει 1.000 φορές διπλό): μένει «σε πτήση» → παύση για έλεγχο.
 * Δέχεται απάντηση `{ status }` (HTTP), σφάλμα SMTP με `responseCode` ή σφάλμα του fetch (αλυσίδα `cause`, AggregateError).
 */
export function classifySendError(e: unknown): SendErrorKind {
  if (e && typeof e === "object") {
    const o = e as { status?: unknown; responseCode?: unknown; code?: unknown };
    if (typeof o.status === "number") return o.status === 429 || o.status >= 500 ? "retry" : "fatal";
    // SMTP: ο server απάντησε — 4xx προσωρινό, 5xx οριστικό· EAUTH πριν από οποιαδήποτε αποστολή
    if (typeof o.responseCode === "number") return o.responseCode >= 500 ? "fatal" : "retry";
    if (o.code === "EAUTH") return "fatal";
  }
  const notConnected = (x: unknown, depth = 0): boolean => {
    if (!x || typeof x !== "object" || depth > 5) return false;
    const o = x as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof o.code === "string" && NOT_CONNECTED.has(o.code)) return true;
    // Happy Eyeballs: όλες οι διευθύνσεις απέτυχαν να συνδεθούν
    if (Array.isArray(o.errors) && o.errors.length && o.errors.every((er) => notConnected(er, depth + 1))) return true;
    return notConnected(o.cause, depth + 1);
  };
  return notConnected(e) ? "retry" : "uncertain";
}

/** Πάνω από 20 % αποτυχίες, μόνο όταν οι προσπάθειες είναι τουλάχιστον 50 (λίγες αποτυχίες στην αρχή δεν σταματούν την αποστολή). */
export function failRatio(sent: number, failed: number): boolean {
  const total = sent + failed;
  return total >= 50 && failed / total > 0.2;
}

export type SendCounts = { queued: number; inflight: number; stale: number; sent: number; failed: number };

/**
 * Κατάσταση μετά από έναν γύρο πακέτων. `inflight` = γραμμές που διεκδικήθηκαν για αποστολή και δεν έχουν αποτέλεσμα·
 * `stale` = όσες από αυτές μένουν έτσι πολλή ώρα (κόπηκε η διεργασία γύρω από την κλήση — δεν ξέρουμε αν στάλθηκαν).
 * Δεν ξαναμπαίνουν ποτέ στην ουρά (καλύτερα να χαθεί ένα email παρά να σταλεί δύο φορές): παύση για έλεγχο.
 */
export function finalStatus(c: SendCounts): { status: "sending" | "sent" } | { status: "paused"; reason: string } {
  if (failRatio(c.sent, c.failed)) return { status: "paused", reason: `Πάνω από 20 % αποτυχίες (${c.failed} από ${c.sent + c.failed}).` };
  if (c.queued > 0 || c.inflight > c.stale) return { status: "sending" };
  if (c.stale > 0) return { status: "paused", reason: `${c.stale} παραλήπτες σε αβέβαιη κατάσταση (η αποστολή κόπηκε κατά την κλήση στον πάροχο) — δεν ξαναστέλνονται αυτόματα· ελέγξτε τα logs του παρόχου.` };
  if (c.failed > 0 && c.sent === 0) return { status: "paused", reason: `Καμία επιτυχής αποστολή (${c.failed} αποτυχίες).` };
  return { status: "sent" };
}
