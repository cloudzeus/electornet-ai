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
 * Νέα προσπάθεια για τους παραλήπτες που δεν πήραν μια ειδοποίηση. Κλείδωμα με compare-and-swap στο alertRetry (μία
 * εκτέλεση τη φορά)· το email ξαναφτιάχνεται από τα reports της παρτίδας, μόνο με τα ίδια ευρήματα.
 */
async function retryRecipients(rows: { id: string; alertRetry: unknown }[], now: Date): Promise<void> {
  for (const row of rows) {
    const retry = parseRetry(row.alertRetry);
    if (!retry || retry.gaveUp || !retry.to.length) continue;
    const inflight: AlertRetry = { ...retry, attempts: retry.attempts + 1, at: now.toISOString() };
    const won = await db.securityReport.updateMany({ where: { id: row.id, alertRetry: { equals: row.alertRetry as Prisma.InputJsonValue } }, data: { alertRetry: retryJson(inflight) } });
    if (won.count !== 1) continue;
    const reports = await db.securityReport.findMany({ where: { id: { in: retry.reportIds } }, select: { id: true, startedAt: true, checks: true } });
    const alerts = pendingAlerts(reports, new Map(), now).filter((a) => retry.fps.includes(a.fp));
    let failed = retry.to;
    if (alerts.length) failed = deliveryOutcome(await sendEach(retry.to, renderAlert(alerts, await linkFor()), "security-alert", { reportIds: retry.reportIds, alerts: alerts.length, retry: inflight.attempts })).failed;
    const next = nextRetry(retry, failed, retry, now);
    if (next?.gaveUp) console.error(`[security-audit] η ειδοποίηση δεν παραδόθηκε σε ${next.to.length} παραλήπτες μετά από ${next.attempts} προσπάθειες (report ${row.id})`);
    await db.securityReport.updateMany({ where: { id: row.id }, data: { alertRetry: retryJson(next) } });
  }
}

/**
 * Άμεσες ειδοποιήσεις: πρώτα οι νέες προσπάθειες σε παραλήπτες που απέτυχαν· μετά τα κρίσιμα ευρήματα των reports των
 * τελευταίων 48 ωρών με `alerted=false` (μαζί και το τρέχον) που δεν έχουν σταλεί τις τελευταίες 23 ώρες → ΕΝΑ email.
 * `alerted` στην απάντηση: false μόνο όταν υπήρχαν ειδοποιήσεις και δεν τις πήρε κανείς.
 */
export async function sendPendingAlerts(now = new Date()): Promise<{ alerted: boolean; alerts: number }> {
  const recent = await db.securityReport.findMany({ where: { startedAt: { gte: new Date(now.getTime() - PENDING_MS) } }, orderBy: { startedAt: "desc" }, take: 100, select: { id: true, alerted: true, alertRetry: true } });
  await retryRecipients(recent, now);
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
  const { delivered, failed } = deliveryOutcome(await sendEach(await securityRecipients(), renderAlert(mine, await linkFor()), "security-alert", { reportIds: ids, alerts: mine.length }));
  if (!delivered) { await release(claims, now); return { alerted: false, alerts: mine.length }; }
  if (failed.length) {
    const retry = nextRetry(null, failed, { fps: mine.map((a) => a.fp), reportIds: [...new Set(mine.map((a) => a.reportId))] }, now);
    // στο νεότερο report της παρτίδας χωρίς άλλη εκκρεμή νέα προσπάθεια (μία ανά report)
    const target = ids.find((id) => !parseRetry(recent.find((r) => r.id === id)?.alertRetry)) ?? ids[0];
    await db.securityReport.updateMany({ where: { id: target }, data: { alertRetry: retryJson(retry) } });
  }
  if (mine.length === alerts.length) await markAlerted();
  return { alerted: true, alerts: mine.length };
}
