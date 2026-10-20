import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { getSetting } from "@/lib/settings/store";
import { parseSecurityEmails } from "@/lib/settings/security-emails";
import { siteOrigin } from "./checks/site-origin";
import { asSeverity, deliveryOutcome, nextRetry, parseRetry, pendingAlerts, renderAlert, renderSummary, reportLink, storedChecks, PENDING_MS, type AlertRetry, type PendingAlert } from "./notify-core";

/**
 * Αποστολή των emails του ελέγχου ασφαλείας (η μορφή στο notify-core.ts). Παραλήπτες: Ρυθμίσεις → Ασφάλεια →
 * «Παραλήπτες αναφοράς» (parseSecurityEmails — κενό → προεπιλογή). Ένα email ανά παραλήπτη.
 *
 * Ειδοποιήσεις «ΚΡΙΣΙΜΟ»: κάθε fingerprint «κλειδώνεται» ατομικά στο SecurityAlert ΠΡΙΝ την αποστολή (ταυτόχρονα full +
 * light στέλνουν το καθένα μόνο όσα κλείδωσαν)· αν δεν το πήρε κανείς παραλήπτης → το κλείδωμα αναιρείται και τα reports
 * μένουν alerted=false (νέα προσπάθεια στο επόμενο cron). Αν το πήραν κάποιοι → παραδόθηκε· όσοι δεν το πήραν μπαίνουν στο
 * alertRetry του report και ξαναδοκιμάζονται μόνο αυτοί, έως 3 προσπάθειες συνολικά (μετά gaveUp, φαίνεται στη σελίδα και
 * στο heartbeat ως alertsUndelivered).
 */

type Msg = { subject: string; html: string; text: string };
type Sent = { to: string; ok: boolean; kind?: string };

export async function securityRecipients(): Promise<string[]> {
  const { data } = await getSetting("security");
  return parseSecurityEmails(String(data.securityReportEmails ?? ""));
}

async function sendEach(to: string[], msg: Msg, template: string, meta: unknown): Promise<Sent[]> {
  const out: Sent[] = [];
  for (const addr of to) {
    const r = await sendMail({ to: addr, ...msg, template, meta }).catch((e) => { console.error("[security-audit] email", e); return { ok: false as const }; });
    out.push({ to: addr, ok: r.ok, ...("kind" in r && r.kind ? { kind: r.kind } : {}) });
  }
  return out;
}

const linkFor = async () => { const { origin } = await siteOrigin(); return (id: string) => reportLink(origin, id); };

/** Email σύνοψης ενός report (cron full και «Αποστολή report τώρα»). ok = το πήραν όλοι («uncertain» = στάλθηκε). */
export async function sendSummary(reportId: string): Promise<{ ok: boolean; sent: number; failed: number }> {
  const r = await db.securityReport.findUnique({ where: { id: reportId }, select: { id: true, mode: true, status: true, startedAt: true, finishedAt: true, checks: true } });
  if (!r) throw new Error("Δεν βρέθηκε η αναφορά.");
  const link = (await linkFor())(r.id);
  const msg = renderSummary({ id: r.id, mode: r.mode, status: asSeverity(r.status), startedAt: r.startedAt, finishedAt: r.finishedAt, results: storedChecks(r.checks) }, link);
  const res = await sendEach(await securityRecipients(), msg, "security-summary", { reportId: r.id });
  const { delivered, failed } = deliveryOutcome(res);
  return { ok: delivered && !failed.length, sent: res.length - failed.length, failed: failed.length };
}

// ── Κλείδωμα fingerprint (SecurityAlert) ────────────────────────────────────────────────────────────────────────────
type Claim = { fp: string; prev: Date | null };
/**
 * Ατομικό κλείδωμα: νέο fingerprint → INSERT … ON CONFLICT DO NOTHING (κερδίζει όποιος γράψει τη γραμμή)· υπάρχον →
 * compare-and-swap στο lastSentAt που διαβάστηκε (κερδίζει όποιος το αλλάξει πρώτος). Επιστρέφει όσα κλειδώθηκαν.
 */
async function claim(items: Claim[], now: Date): Promise<Claim[]> {
  const won: Claim[] = [];
  for (const x of items) {
    const n = x.prev === null
      ? (await db.securityAlert.createMany({ data: [{ fingerprint: x.fp, lastSentAt: now, count: 1 }], skipDuplicates: true })).count
      : (await db.securityAlert.updateMany({ where: { fingerprint: x.fp, lastSentAt: x.prev }, data: { lastSentAt: now, count: { increment: 1 } } })).count;
    if (n === 1) won.push(x);
  }
  return won;
}
/** Αποτυχία αποστολής → αναίρεση: νέα γραμμή σβήνεται, υπάρχουσα επιστρέφει στο προηγούμενο lastSentAt. */
async function release(claims: Claim[], now: Date): Promise<void> {
  for (const c of claims) {
    if (c.prev === null) await db.securityAlert.deleteMany({ where: { fingerprint: c.fp, lastSentAt: now } });
    else await db.securityAlert.updateMany({ where: { fingerprint: c.fp, lastSentAt: now }, data: { lastSentAt: c.prev, count: { decrement: 1 } } });
  }
}

const retryJson = (r: AlertRetry | null) => (r ? (r as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

/**
 * Νέα προσπάθεια για τους παραλήπτες που δεν πήραν μια ειδοποίηση. Κάθε εγγραφή του alertRetry είναι compare-and-swap
 * (where alertRetry = η τιμή που διαβάστηκε): μία εκτέλεση τη φορά, καμία δεν σβήνει την αλλαγή άλλης. Το email
 * ξαναφτιάχνεται από τα reports της παρτίδας, μόνο με τα ίδια ευρήματα. Σφάλμα σε ένα report δεν σταματά τα άλλα.
 */
async function retryRecipients(rows: { id: string; alertRetry: unknown }[], now: Date, link: (id: string) => string): Promise<void> {
  for (const row of rows) {
    const retry = parseRetry(row.alertRetry);
    if (!retry || retry.gaveUp || !retry.to.length) continue;
    const inflight: AlertRetry = { ...retry, attempts: retry.attempts + 1, at: now.toISOString() };
    try {
      const won = await db.securityReport.updateMany({ where: { id: row.id, alertRetry: { equals: row.alertRetry as Prisma.InputJsonValue } }, data: { alertRetry: retryJson(inflight) } });
      if (won.count !== 1) continue;
      const reports = await db.securityReport.findMany({ where: { id: { in: retry.reportIds } }, select: { id: true, startedAt: true, checks: true } });
      const alerts = pendingAlerts(reports, new Map(), now).filter((a) => retry.fps.includes(a.fp));
      let failed = retry.to;
      if (alerts.length) failed = deliveryOutcome(await sendEach(retry.to, renderAlert(alerts, link), "security-alert", { reportIds: retry.reportIds, alerts: alerts.length, retry: inflight.attempts })).failed;
      const next = nextRetry(retry, failed, retry, now);
      if (next?.gaveUp) console.error(`[security-audit] η ειδοποίηση δεν παραδόθηκε σε ${next.to.length} παραλήπτες μετά από ${next.attempts} προσπάθειες (report ${row.id})`);
      await db.securityReport.updateMany({ where: { id: row.id, alertRetry: { equals: retryJson(inflight) as Prisma.InputJsonValue } }, data: { alertRetry: retryJson(next) } });
    } catch (e) {
      // η προσπάθεια μετρήθηκε (inflight)· η επόμενη εκτέλεση ξαναδοκιμάζει από εκεί
      console.error(`[security-audit] νέα προσπάθεια ειδοποίησης (report ${row.id})`, e);
    }
  }
}

/**
 * Άμεσες ειδοποιήσεις: πρώτα οι νέες προσπάθειες σε παραλήπτες που απέτυχαν· μετά τα κρίσιμα ευρήματα των reports των
 * τελευταίων 48 ωρών με `alerted=false` (μαζί και το τρέχον) που δεν έχουν σταλεί τις τελευταίες 23 ώρες → ΕΝΑ email.
 * Παραλήπτες και σύνδεσμος διαβάζονται ΠΡΙΝ το κλείδωμα· σφάλμα κατά την αποστολή → αναίρεση του κλειδώματος (αλλιώς η
 * ειδοποίηση θα χανόταν για 23 ώρες). `alerted` στην απάντηση: false μόνο όταν υπήρχαν ειδοποιήσεις και δεν τις πήρε κανείς.
 */
export async function sendPendingAlerts(now = new Date()): Promise<{ alerted: boolean; alerts: number }> {
  const [recipients, link] = await Promise.all([securityRecipients(), linkFor()]);
  const recent = await db.securityReport.findMany({ where: { startedAt: { gte: new Date(now.getTime() - PENDING_MS) } }, orderBy: { startedAt: "desc" }, take: 100, select: { id: true, alerted: true, alertRetry: true } });
  await retryRecipients(recent, now, link);
  const ids = recent.filter((r) => !r.alerted).map((r) => r.id);
  if (!ids.length) return { alerted: true, alerts: 0 };
  const reports = await db.securityReport.findMany({ where: { id: { in: ids } }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true, checks: true } });
  // τα fingerprints των κρίσιμων (χωρίς dedupe) → ποια στάλθηκαν και πότε
  const fps = pendingAlerts(reports, new Map(), now).map((a) => a.fp);
  const sentRows = fps.length ? await db.securityAlert.findMany({ where: { fingerprint: { in: fps } }, select: { fingerprint: true, lastSentAt: true } }) : [];
  const sent = new Map(sentRows.map((s) => [s.fingerprint, s.lastSentAt]));
  const alerts = pendingAlerts(reports, sent, now);
  const markAlerted = () => db.securityReport.updateMany({ where: { id: { in: ids } }, data: { alerted: true } });
  if (!alerts.length) { await markAlerted(); return { alerted: true, alerts: 0 }; }

  const claims = await claim(alerts.map((a) => ({ fp: a.fp, prev: sent.get(a.fp) ?? null })), now);
  const mine: PendingAlert[] = alerts.filter((a) => claims.some((c) => c.fp === a.fp));
  // τα υπόλοιπα τα στέλνει ταυτόχρονη εκτέλεση· τα reports μένουν alerted=false μέχρι να φανούν σταλμένα (επόμενο cron)
  if (!mine.length) return { alerted: true, alerts: 0 };
  let outcome: { delivered: boolean; failed: string[] };
  try {
    outcome = deliveryOutcome(await sendEach(recipients, renderAlert(mine, link), "security-alert", { reportIds: ids, alerts: mine.length }));
  } catch (e) {
    await release(claims, now);
    throw e;
  }
  if (!outcome.delivered) { await release(claims, now); return { alerted: false, alerts: mine.length }; }
  if (outcome.failed.length) await storeRetry(nextRetry(null, outcome.failed, { fps: mine.map((a) => a.fp), reportIds: [...new Set(mine.map((a) => a.reportId))] }, now), ids, recent);
  if (mine.length === alerts.length) await markAlerted();
  return { alerted: true, alerts: mine.length };
}

/**
 * Η νέα εκκρεμότητα γράφεται στο νεότερο report της παρτίδας που ΔΕΝ έχει ήδη alertRetry, με compare-and-swap
 * (where alertRetry IS NULL) — ποτέ πάνω σε εκκρεμότητα άλλης παρτίδας. Χωρίς ελεύθερο report → καταγραφή σφάλματος.
 */
async function storeRetry(retry: AlertRetry | null, ids: string[], recent: { id: string; alertRetry: unknown }[]): Promise<void> {
  if (!retry) return;
  for (const id of ids) {
    if (recent.find((r) => r.id === id)?.alertRetry != null) continue;
    const n = await db.securityReport.updateMany({ where: { id, alertRetry: { equals: Prisma.DbNull } }, data: { alertRetry: retryJson(retry) } });
    if (n.count === 1) return;
  }
  console.error(`[security-audit] δεν καταγράφηκε νέα προσπάθεια για ${retry.to.length} παραλήπτες (κανένα ελεύθερο report)`);
}
