import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { describeCall, errorMail, errorSignature, isErrorResponse, isSessionExpired, redact, storedResponse, type S1Entry } from "./log-core";

/**
 * Καταγραφή κάθε κλήσης προς το SoftOne (πίνακας S1Log) και email όταν μια κλήση αποτύχει. Καλείται από το lib/softone.ts,
 * από όπου περνούν ΟΛΕΣ οι κλήσεις (σύνδεση, επίσημα services, iSite). Δεν καθυστερεί ούτε χαλάει ποτέ την ίδια την κλήση:
 * η εγγραφή γίνεται στο παρασκήνιο και κάθε σφάλμα της αγνοείται (π.χ. όσο ο πίνακας δεν υπάρχει ακόμη).
 *
 * Email σφάλματος: `S1_ERROR_EMAIL` (λίστα με κόμμα)· κενό = καμία αποστολή. Χωρίς τη μεταβλητή, στην παραγωγή πάει στον
 * τεχνικό υπεύθυνο και εκτός παραγωγής πουθενά (οι τοπικές δοκιμές δεν στέλνουν email).
 */
const DEFAULT_TO = "gkozyris@i4ria.com";
const mailTo = () => (process.env.S1_ERROR_EMAIL ?? (process.env.NODE_ENV === "production" ? DEFAULT_TO : "")).split(",").map((s) => s.trim()).filter(Boolean);
const envName = () => (process.env.NODE_ENV === "production" ? "παραγωγή" : "τοπικά / δοκιμές");
const siteUrl = () => (process.env.AUTH_URL ?? "").replace(/\/$/, "");

/** Ποια λειτουργία κάνει τις κλήσεις (γράφεται στην καταγραφή)· `mail: false` = το email το στέλνει η ίδια η λειτουργία, με τα δικά της στοιχεία. */
interface Scope { source: string; mail?: boolean }
const scope = new AsyncLocalStorage<Scope>();
export const withS1Scope = <T>(s: Scope, fn: () => Promise<T>): Promise<T> => scope.run(s, fn);
/** Πιο συγκεκριμένο όνομα μέσα σε ανοιχτό scope (π.χ. μόλις γίνει γνωστός ο αριθμός της παραγγελίας). */
export const setS1Source = (source: string) => { const s = scope.getStore(); if (s) s.source = source; };

// shortcut: το «στάλθηκε ήδη» ζει στη μνήμη του διακομιστή (μηδενίζει σε κάθε deploy)· αν τρέξουν πολλά instances, θέλει πίνακα
const sent = new Map<string, number>();
const MAIL_EVERY_MS = 30 * 60_000;
function shouldMail(sig: string): boolean {
  const now = Date.now(), last = sent.get(sig);
  if (last && now - last < MAIL_EVERY_MS) return false;
  if (sent.size > 500) sent.clear();
  sent.set(sig, now);
  return true;
}

/** Στέλνει το email σφάλματος (το ίδιο σφάλμα το πολύ μία φορά ανά 30 λεπτά). Δεν πετάει ποτέ. */
export async function mailS1Error(e: S1Entry, o: { id?: string | null; extra?: [string, string][]; blocks?: [string, string][] } = {}): Promise<void> {
  try {
    const to = mailTo();
    if (!to.length || !shouldMail(errorSignature(e))) return;
    const m = errorMail(e, { env: envName(), logUrl: o.id && siteUrl() ? `${siteUrl()}/admin/softone/log?id=${o.id}` : null, extra: o.extra, blocks: o.blocks });
    const { sendMail } = await import("@/lib/email/send");
    for (const addr of to) await sendMail({ to: addr, subject: m.subject, html: m.html, text: m.text, template: "s1-error", meta: { service: e.service, object: e.object, source: e.source } }).catch(() => null);
  } catch (err) {
    console.error("[s1-log] email", err);
  }
}

/** Μία κλήση που τελείωσε: `data` = η απάντηση αν διαβάστηκε, `thrown` = το μήνυμα αν δεν ήρθε έγκυρη απάντηση. */
export function recordS1(c: { body: Record<string, unknown>; path: string; http: number | null; ms: number; text: string; data?: unknown; thrown?: string }): void {
  try {
    const call = describeCall(c.body, c.path), s = scope.getStore();
    const failed = c.thrown != null || isErrorResponse(c.data);
    const d = (c.data ?? null) as { errorcode?: unknown; error?: unknown } | null;
    const e: S1Entry = {
      ...call, at: new Date().toISOString(), ok: !failed, http: c.http, ms: c.ms,
      errorCode: Number.isFinite(Number(d?.errorcode)) && d?.errorcode != null ? Number(d.errorcode) : null,
      error: c.thrown ?? (failed ? String(d?.error ?? "Το SoftOne απάντησε success:false χωρίς μήνυμα") : isSessionExpired(c.data) ? "Έληξε η σύνδεση· έγινε νέα αυτόματα" : null),
      source: s?.source ?? null, request: redact(c.body), response: storedResponse(c.text, call.full || failed), bytes: c.text.length,
    };
    const row = { service: e.service, object: e.object, key: e.key, write: e.write, ok: e.ok, errorCode: e.errorCode, error: e.error, http: e.http, ms: e.ms, source: e.source, request: e.request as Prisma.InputJsonValue, response: e.response, bytes: e.bytes };
    void db.s1Log.create({ data: row, select: { id: true } })
      .then((r) => r.id, () => null)
      .then((id) => { if (failed && s?.mail !== false) return mailS1Error(e, { id }); })
      .catch(() => null);
    // shortcut: καθάρισμα «στην τύχη» αντί για προγραμματισμένη εργασία — αναγνώσεις 30 ημέρες, εγγραφές και σφάλματα 1 χρόνο
    if (Math.random() < 0.002) {
      const ago = (days: number) => new Date(Date.now() - days * 864e5);
      void db.s1Log.deleteMany({ where: { OR: [{ at: { lt: ago(365) } }, { at: { lt: ago(30) }, write: false, ok: true }] } }).catch(() => null);
    }
  } catch (err) {
    console.error("[s1-log]", err);
  }
}
