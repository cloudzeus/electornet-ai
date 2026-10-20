import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Dead man's switch του εξωτερικού φύλακα. ΚΑΘΑΡΟ αρχείο (μόνο node:crypto) — το εισάγει και το script του φύλακα.
 * Ο φύλακας καλεί `GET /api/security/heartbeat?ts=<unix δευτερόλεπτα>&sig=<hex HMAC-SHA256(SECURITY_WATCH_SECRET, String(ts))>`
 * και παίρνει πότε έτρεξαν τελευταία ο full και ο light έλεγχος και με τι αποτέλεσμα — όχι ευρήματα.
 */

/** Ανοχή χρονοσφραγίδας (±5′). */
export const HEARTBEAT_WINDOW_S = 300;
/** Το πολύ μία εγγραφή `security.watch.ping` στο ιστορικό ανά 10′. */
export const PING_EVERY_MS = 10 * 60_000;

export function signHeartbeat(secret: string, ts: number): string {
  return createHmac("sha256", secret).update(String(ts)).digest("hex");
}

/** Έγκυρη υπογραφή και ts μέσα σε ±300″ από το `now` (unix δευτερόλεπτα). Κενό μυστικό → πάντα false. */
export function verifyHeartbeat(secret: string, ts: number, sig: string, now: number): boolean {
  if (!secret || !Number.isSafeInteger(ts) || !Number.isFinite(now) || Math.abs(now - ts) > HEARTBEAT_WINDOW_S) return false;
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const want = Buffer.from(signHeartbeat(secret, ts), "hex");
  const got = Buffer.from(sig, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Η τιμή `ts` του query: μόνο ακέραια δευτερόλεπτα (έως 12 ψηφία), αλλιώς null. */
export function parseTs(s: string | null | undefined): number | null {
  return typeof s === "string" && /^\d{1,12}$/.test(s) ? Number(s) : null;
}

/** Γράφουμε νέα εγγραφή αν δεν υπάρχει καμία ή η τελευταία είναι ≥10′ παλιά (ή στο μέλλον — λάθος ρολόι). */
export function shouldRecordPing(last: Date | null, now: Date): boolean {
  if (!last) return true;
  const age = now.getTime() - last.getTime();
  return age < 0 || age >= PING_EVERY_MS;
}

export type RunView = { id: string; startedAt: string; status: string };

/**
 * Το νεότερο report (οι γραμμές με σειρά startedAt desc) που περιέχει ΟΛΟΥΣ τους ελέγχους `keys`, με οποιαδήποτε
 * κατάσταση (και error — φαίνεται στο status). Τα χειροκίνητα reports ενός μόνο ελέγχου δεν μετρούν ως «έτρεξε ο full».
 */
export function latestCompleteRun(rows: { id: string; startedAt: Date; status: string; checks: unknown }[], keys: string[]): RunView | null {
  for (const r of rows) {
    if (!Array.isArray(r.checks)) continue;
    const have = new Set(r.checks.map((c) => (c && typeof c === "object" ? (c as { key?: unknown }).key : undefined)));
    if (keys.every((k) => have.has(k))) return { id: r.id, startedAt: r.startedAt.toISOString(), status: r.status };
  }
  return null;
}

/**
 * `Authorization: Bearer <secret>` σε σταθερό χρόνο (σύγκριση των SHA-256, ίσου μήκους πάντα — δεν διαρρέει ούτε το
 * μήκος). Χωρίς ρυθμισμένο μυστικό → false.
 */
export function bearerOk(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || typeof header !== "string") return false;
  const d = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(d(header), d(`Bearer ${secret}`));
}
