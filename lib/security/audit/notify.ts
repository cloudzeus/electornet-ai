import "server-only";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { getSetting } from "@/lib/settings/store";
import { parseSecurityEmails } from "@/lib/settings/security-emails";
import { siteOrigin } from "./checks/site-origin";
import { pendingAlerts, renderAlert, renderSummary, reportLink, storedChecks } from "./notify-core";
import type { Severity } from "./rules";

/**
 * Αποστολή των emails του ελέγχου ασφαλείας (η μορφή στο notify-core.ts). Παραλήπτες: Ρυθμίσεις → Ασφάλεια →
 * «Παραλήπτες αναφοράς» (parseSecurityEmails — κενό → προεπιλογή). Ένα email ανά παραλήπτη· «στάλθηκε» μόνο όταν
 * στάλθηκε σε ΟΛΟΥΣ (χωρίς ρυθμισμένη αποστολή = δεν στάλθηκε).
 */

/** Πόσο πίσω ψάχνουμε reports με ειδοποίηση που δεν στάλθηκε (νέα προσπάθεια σε κάθε εκτέλεση του cron). */
const PENDING_MS = 48 * 3_600_000;

export async function securityRecipients(): Promise<string[]> {
  const { data } = await getSetting("security");
  return parseSecurityEmails(String(data.securityReportEmails ?? ""));
}

async function sendAll(msg: { subject: string; html: string; text: string }, template: string, meta: unknown): Promise<{ ok: boolean; sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const to of await securityRecipients()) {
    const r = await sendMail({ to, ...msg, template, meta }).catch((e) => { console.error("[security-audit] email", e); return { ok: false as const }; });
    if (r.ok) sent++; else failed++;
  }
  return { ok: sent > 0 && failed === 0, sent, failed };
}

const linkFor = async () => { const { origin } = await siteOrigin(); return (id: string) => reportLink(origin, id); };

/** Email σύνοψης ενός report (cron full και «Αποστολή report τώρα»). */
export async function sendSummary(reportId: string): Promise<{ ok: boolean; sent: number; failed: number }> {
  const r = await db.securityReport.findUnique({ where: { id: reportId }, select: { id: true, mode: true, status: true, startedAt: true, finishedAt: true, checks: true } });
  if (!r) throw new Error("Δεν βρέθηκε η αναφορά.");
  const link = (await linkFor())(r.id);
  const msg = renderSummary({ id: r.id, mode: r.mode, status: r.status as Severity, startedAt: r.startedAt, finishedAt: r.finishedAt, results: storedChecks(r.checks) }, link);
  return sendAll(msg, "security-summary", { reportId: r.id });
}

/**
 * Άμεσες ειδοποιήσεις: τα κρίσιμα ευρήματα όλων των reports των τελευταίων 48 ωρών με `alerted=false` (μαζί και το
 * τρέχον), που δεν έχουν σταλεί τις τελευταίες 24 ώρες (SecurityAlert) → ΕΝΑ email «ΚΡΙΣΙΜΟ». Επιτυχία → upsert
 * SecurityAlert (lastSentAt, count+1) και `alerted=true` στα reports· αποτυχία → μένουν `alerted=false` και ξαναδοκιμάζονται
 * στην επόμενη εκτέλεση (light, κάθε ώρα). Reports χωρίς νέο κρίσιμο → `alerted=true` (δεν υπάρχει κάτι να σταλεί).
 */
export async function sendPendingAlerts(now = new Date()): Promise<{ alerted: boolean; alerts: number }> {
  const reports = await db.securityReport.findMany({ where: { alerted: false, startedAt: { gte: new Date(now.getTime() - PENDING_MS) } }, orderBy: { startedAt: "desc" }, take: 60, select: { id: true, startedAt: true, checks: true } });
  if (!reports.length) return { alerted: true, alerts: 0 };
  const ids = reports.map((r) => r.id);
  // τα fingerprints των κρίσιμων (χωρίς dedupe) → ποια στάλθηκαν και πότε
  const fps = pendingAlerts(reports, new Map(), now).map((a) => a.fp);
  const sentRows = fps.length ? await db.securityAlert.findMany({ where: { fingerprint: { in: fps } }, select: { fingerprint: true, lastSentAt: true } }) : [];
  const alerts = pendingAlerts(reports, new Map(sentRows.map((s) => [s.fingerprint, s.lastSentAt])), now);
  if (!alerts.length) {
    await db.securityReport.updateMany({ where: { id: { in: ids } }, data: { alerted: true } });
    return { alerted: true, alerts: 0 };
  }
  const res = await sendAll(renderAlert(alerts, await linkFor()), "security-alert", { reportIds: ids, alerts: alerts.length });
  if (!res.ok) return { alerted: false, alerts: alerts.length };
  for (const a of alerts) {
    await db.securityAlert.upsert({ where: { fingerprint: a.fp }, create: { fingerprint: a.fp, lastSentAt: now }, update: { lastSentAt: now, count: { increment: 1 } } });
  }
  await db.securityReport.updateMany({ where: { id: { in: ids } }, data: { alerted: true } });
  return { alerted: true, alerts: alerts.length };
}
