import { fingerprint, type Finding, type Severity } from "./rules";
import type { StoredCheck } from "./types";

/**
 * Emails του ελέγχου ασφαλείας: σύνοψη (full) και άμεση ειδοποίηση «ΚΡΙΣΙΜΟ». ΚΑΘΑΡΟ αρχείο — η αποστολή είναι στο notify.ts.
 *
 * Τα κείμενα των ευρημάτων μπορεί να περιέχουν ό,τι έγραψε ένας επιτιθέμενος (HTML σελίδας, περιεχόμενο βάσης): στο HTML
 * περνούν ΠΑΝΤΑ από escapeHtml, στο text γίνονται μία γραμμή (δεν πλαστογραφούν γραμμές της αναφοράς). Το `snapshot` των
 * ελέγχων (εσωτερική κατάσταση: λογαριασμοί, build) δεν εμφανίζεται ποτέ — περνούν μόνο τα γνωστά πεδία (storedChecks).
 * Η σύνοψη λέει τι ελέγχθηκε (τη γραμμή σύνοψης κάθε ελέγχου): ένα email «ΟΚ» είναι τεκμήριο για τον auditor.
 */

/**
 * Το ίδιο κρίσιμο εύρημα δεν ξαναστέλνεται πριν περάσουν 23 ώρες. Όχι ακριβώς 24: το καθημερινό full τρέχει κάθε ~24 ώρες
 * και με όριο 24 ωρών ένα κρίσιμο που βρίσκει μόνο ο full θα παρέλειπε κάθε δεύτερη μέρα.
 */
export const DEDUPE_MS = 23 * 3_600_000;
/** Ευρήματα ανά έλεγχο στο email· τα υπόλοιπα στη σελίδα της αναφοράς. */
export const EMAIL_FINDINGS = 25;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** Για το text: μία γραμμή, χωρίς χαρακτήρες ελέγχου. */
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();
const h = (s: string, n = 600) => escapeHtml(clip(s, n));
const t = (s: string, n = 600) => oneLine(clip(s, n));

export const reportLink = (origin: string, id: string) => `${origin.replace(/\/+$/, "")}/admin/asfaleia/${encodeURIComponent(id)}`;

const ATHENS = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const parts = (d: Date) => Object.fromEntries(ATHENS.formatToParts(d).map((x) => [x.type, x.value]));
/** «20/10/2026 07:00:05» σε ώρα Ελλάδας. */
export function athensDateTime(d: Date): string {
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

// ── Ειδοποιήσεις ─────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Τα κρίσιμα ευρήματα που πρέπει να σταλούν: μόνο critical, όχι αν το ίδιο fingerprint στάλθηκε τις τελευταίες 24 ώρες
 * (`sent`: fingerprint → lastSentAt), και το ίδιο fingerprint μία φορά (η πρώτη εμφάνιση — οι λίστες έρχονται νεότερο πρώτο).
 */
export function alertsToSend<T extends { checkKey: string; f: Finding }>(findings: T[], sent: Map<string, Date>, now: Date): (T & { fp: string })[] {
  const out: (T & { fp: string })[] = [];
  const seen = new Set<string>();
  for (const x of findings) {
    if (x.f.severity !== "critical") continue;
    const fp = fingerprint(x.checkKey, x.f);
    if (seen.has(fp)) continue;
    seen.add(fp);
    const last = sent.get(fp);
    if (last && now.getTime() - last.getTime() < DEDUPE_MS) continue;
    out.push({ ...x, fp });
  }
  return out;
}

const SEVERITIES = new Set(["ok", "warn", "critical", "error"]);
/** Τιμή status από τη βάση → Severity· άγνωστη → "error" (ποτέ «undefined» ή ψευδές ΟΚ). */
export const asSeverity = (v: unknown): Severity => (typeof v === "string" && SEVERITIES.has(v) ? (v as Severity) : "error");
const str = (v: unknown) => (typeof v === "string" ? v : "");
/**
 * Τα checks ενός αποθηκευμένου report (Json) → μόνο τα γνωστά πεδία: key, title, status, summary, findings, ms, complete.
 * Ποτέ snapshot. Ό,τι δεν έχει σχήμα ελέγχου/ευρήματος παραλείπεται.
 */
export function storedChecks(checks: unknown): StoredCheck[] {
  if (!Array.isArray(checks)) return [];
  const out: StoredCheck[] = [];
  for (const c of checks) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.status !== "string" || !SEVERITIES.has(o.status)) continue;
    const findings: Finding[] = (Array.isArray(o.findings) ? o.findings : []).flatMap((f): Finding[] => {
      if (!f || typeof f !== "object") return [];
      const x = f as Record<string, unknown>;
      if (x.severity !== "warn" && x.severity !== "critical" && x.severity !== "error") return [];
      if (typeof x.title !== "string") return [];
      return [{ severity: x.severity, title: x.title, detail: str(x.detail), ...(typeof x.evidence === "string" ? { evidence: x.evidence } : {}) }];
    });
    out.push({ key: o.key, title: str(o.title) || o.key, status: o.status as Severity, summary: str(o.summary), findings, ms: typeof o.ms === "number" ? o.ms : 0, ...(o.complete === false ? { complete: false } : {}) });
  }
  return out;
}

export type PendingAlert = { checkKey: string; checkTitle: string; f: Finding; fp: string; reportId: string; startedAt: Date };
/**
 * Από reports με `alerted=false` (ειδοποίηση που δεν στάλθηκε ή δεν έχει γίνει ακόμη): τα κρίσιμα που δεν έχουν σταλεί
 * τις τελευταίες 24 ώρες. Νεότερο report πρώτο· το ίδιο εύρημα σε πολλά reports → μία φορά (από το νεότερο).
 */
export function pendingAlerts(reports: { id: string; startedAt: Date; checks: unknown }[], sent: Map<string, Date>, now: Date): PendingAlert[] {
  const items = [...reports].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).flatMap((r) =>
    storedChecks(r.checks).flatMap((c) => c.findings.map((f) => ({ checkKey: c.key, checkTitle: c.title, f, reportId: r.id, startedAt: r.startedAt }))));
  return alertsToSend(items, sent, now);
}

// ── Παράδοση ανά παραλήπτη ──────────────────────────────────────────────────────────────────────────────────────────
export const MAX_ALERT_ATTEMPTS = 3;
/**
 * Αποτέλεσμα αποστολής σε όλους τους παραλήπτες: «παραδόθηκε» αν έστω ένας το πήρε (ok, ή «uncertain» = ίσως παραδόθηκε —
 * θεωρείται σταλμένο, όχι ξανά)· `failed` = όσοι σίγουρα δεν το πήραν (ξαναδοκιμάζονται μόνο αυτοί).
 */
export function deliveryOutcome(results: { to: string; ok: boolean; kind?: string }[]): { delivered: boolean; failed: string[] } {
  const got = (r: { ok: boolean; kind?: string }) => r.ok || r.kind === "uncertain";
  return { delivered: results.some(got), failed: results.filter((r) => !got(r)).map((r) => r.to) };
}

/**
 * Εκκρεμής ειδοποίηση για παραλήπτες που δεν την πήραν (SecurityReport.alertRetry του νεότερου report της παρτίδας):
 * ποιοι (`to`), πόσες προσπάθειες έγιναν, ποια ευρήματα (`fps`) από ποια reports. Μετά από 3 προσπάθειες `gaveUp`.
 */
export type AlertRetry = { to: string[]; attempts: number; fps: string[]; reportIds: string[]; at: string; gaveUp: boolean };
export function nextRetry(prev: AlertRetry | null, failed: string[], base: { fps: string[]; reportIds: string[] }, now: Date): AlertRetry | null {
  if (!failed.length) return null;
  const attempts = (prev?.attempts ?? 0) + 1;
  return { to: failed, attempts, fps: prev?.fps ?? base.fps, reportIds: prev?.reportIds ?? base.reportIds, at: now.toISOString(), gaveUp: attempts >= MAX_ALERT_ATTEMPTS };
}
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
export function parseRetry(v: unknown): AlertRetry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!strs(o.to) || !strs(o.fps) || !strs(o.reportIds) || typeof o.attempts !== "number" || typeof o.at !== "string") return null;
  return { to: o.to, attempts: o.attempts, fps: o.fps, reportIds: o.reportIds, at: o.at, gaveUp: o.gaveUp === true };
}

export const UNDELIVERED_AFTER_MS = 2 * 3_600_000;
export const PENDING_MS = 48 * 3_600_000;
/**
 * Για τον φύλακα (heartbeat): υπάρχει report 2–48 ωρών του οποίου η ειδοποίηση δεν παραδόθηκε (alerted=false) ή που
 * κάποιοι παραλήπτες δεν την πήραν (alertRetry). Μόνο boolean — όχι ευρήματα.
 */
export function alertsUndelivered(rows: { startedAt: Date; alerted: boolean; alertRetry: unknown }[], now: Date): boolean {
  return rows.some((r) => {
    const age = now.getTime() - r.startedAt.getTime();
    if (age < UNDELIVERED_AFTER_MS || age > PENDING_MS) return false;
    const retry = parseRetry(r.alertRetry);
    return !r.alerted || (!!retry && retry.to.length > 0);
  });
}

// ── Μορφή ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const LABEL: Record<Severity, string> = { ok: "ΟΚ", warn: "Προειδοποίηση", critical: "ΚΡΙΣΙΜΟ", error: "Σφάλμα ελέγχου" };
const SUBJECT: Record<Severity, string> = { ok: "ΟΚ", warn: "Προειδοποιήσεις", critical: "ΚΡΙΣΙΜΟ", error: "Σφάλμα ελέγχου" };
const COLOR: Record<Severity, string> = { ok: "#15803d", warn: "#b45309", critical: "#b91c1c", error: "#6d28d9" };
const MODE: Record<string, string> = { full: "πλήρης (τελευταίες 24 ώρες)", light: "ωριαίος (από τον προηγούμενο έλεγχο)" };
const PARTIAL = "μερικός έλεγχος";

const badge = (s: Severity) => `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${COLOR[s]};color:#fff;font-weight:bold;font-size:12px">${LABEL[s]}</span>`;
const partialBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;border:1px solid #b45309;color:#b45309;font-size:12px">${PARTIAL}</span>`;
const linkHtml = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:#1d4ed8">${escapeHtml(label)}</a>`;

function findingHtml(f: Finding): string {
  return `<li style="margin:4px 0">${badge(f.severity)} <strong>${h(f.title, 300)}</strong><br><span style="color:#374151">${h(f.detail)}</span>${f.evidence ? `<br><code style="font-size:12px;color:#6b7280;word-break:break-all">${h(f.evidence, 300)}</code>` : ""}</li>`;
}
const findingText = (f: Finding) => `  - [${LABEL[f.severity]}] ${t(f.title, 300)}: ${t(f.detail)}${f.evidence ? ` | ${t(f.evidence, 300)}` : ""}`;

const wrap = (body: string) =>
  `<!doctype html><html lang="el"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827"><div style="max-width:760px;margin:0 auto;background:#fff;padding:20px;border-radius:8px">${body}</div></body></html>`;

export type SummaryReport = { id?: string; status: Severity; results: StoredCheck[]; startedAt: Date; finishedAt?: Date | null; mode: string };

/**
 * Email σύνοψης: θέμα «[Euronics] Έλεγχος ασφαλείας ΗΗ/ΜΜ: ΟΚ | Προειδοποιήσεις | ΚΡΙΣΙΜΟ | Σφάλμα ελέγχου» (+ «μερικός
 * έλεγχος» όταν κάποιος έλεγχος δεν κάλυψε όλο το παράθυρο)· στοιχεία αναφοράς, ένας πίνακας με κάθε έλεγχο (κατάσταση,
 * σύνοψη) και τα ευρήματά του (έως 25 — τα υπόλοιπα στη σελίδα).
 */
export function renderSummary(report: SummaryReport, link: string): { subject: string; html: string; text: string } {
  const checks = storedChecks(report.results);
  const status = asSeverity(report.status);
  const partial = checks.some((c) => c.complete === false);
  const p = parts(report.startedAt);
  const subject = `[Euronics] Έλεγχος ασφαλείας ${p.day}/${p.month}: ${SUBJECT[status]}${partial && status !== "critical" ? ` (${PARTIAL})` : ""}`;
  const mode = MODE[report.mode] ?? report.mode;
  const meta: [string, string][] = [
    ["Αναφορά", report.id ?? "—"],
    ["Είδος", mode],
    ["Έναρξη", `${athensDateTime(report.startedAt)} (ώρα Ελλάδας)`],
    ["Λήξη", report.finishedAt ? `${athensDateTime(report.finishedAt)} (ώρα Ελλάδας)` : "—"],
    ["Έλεγχοι", String(checks.length)],
  ];

  const rows = checks.map((c) => {
    const shown = c.findings.slice(0, EMAIL_FINDINGS);
    const more = c.findings.length - shown.length;
    const list = shown.length ? `<ul style="margin:6px 0 0;padding-left:18px">${shown.map(findingHtml).join("")}${more > 0 ? `<li style="margin:4px 0;color:#6b7280">… και ${more} ακόμη — ${linkHtml(link, "δείτε την αναφορά")}</li>` : ""}</ul>` : "";
    return `<tr><td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;white-space:nowrap">${badge(c.status)}${c.complete === false ? `<br>${partialBadge}` : ""}</td><td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top"><strong>${h(c.title, 200)}</strong><br><span style="color:#374151">${h(c.summary, 1000)}</span>${list}</td></tr>`;
  }).join("");

  const html = wrap(
    `<h1 style="margin:0 0 4px;font-size:20px">Έλεγχος ασφαλείας ${badge(status)}${partial ? ` ${partialBadge}` : ""}</h1>` +
    `<p style="margin:0 0 12px;color:#4b5563">Αυτόματος έλεγχος του e-shop (μόνο αναγνώσεις). Παρακάτω όλοι οι έλεγχοι που έτρεξαν και τι βρήκε ο καθένας.</p>` +
    `<table style="border-collapse:collapse;margin-bottom:12px">${meta.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`).join("")}</table>` +
    `<p style="margin:0 0 12px">${linkHtml(link, "Άνοιγμα της αναφοράς στη διαχείριση")}</p>` +
    `<table style="border-collapse:collapse;width:100%">${rows}</table>`,
  );

  const text = [
    `Έλεγχος ασφαλείας: ${LABEL[status]}${partial ? ` (${PARTIAL})` : ""}`,
    ...meta.map(([k, v]) => `${k}: ${v}`),
    `Σύνδεσμος: ${link}`,
    "",
    ...checks.flatMap((c) => {
      const more = c.findings.length - EMAIL_FINDINGS;
      return [
        `[${LABEL[c.status]}]${c.complete === false ? ` (${PARTIAL})` : ""} ${t(c.title, 200)}`,
        `  ${t(c.summary, 1000)}`,
        ...c.findings.slice(0, EMAIL_FINDINGS).map(findingText),
        ...(more > 0 ? [`  … και ${more} ακόμη — δείτε την αναφορά`] : []),
        "",
      ];
    }),
  ].join("\n");
  return { subject, html, text };
}

/** Άμεση ειδοποίηση: ένα email με όλα τα νέα κρίσιμα ευρήματα (ανά εύρημα: έλεγχος, ώρα, σύνδεσμος στο report του). */
export function renderAlert(alerts: PendingAlert[], linkFor: (reportId: string) => string): { subject: string; html: string; text: string } {
  const n = alerts.length;
  const subject = `[Euronics] ΚΡΙΣΙΜΟ: ${n} ${n === 1 ? "εύρημα" : "ευρήματα"} ασφαλείας`;
  const items = alerts.map((a) => {
    const link = linkFor(a.reportId);
    return `<tr><td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top"><div style="color:#6b7280;font-size:12px">${h(a.checkTitle, 200)} · ${escapeHtml(athensDateTime(a.startedAt))}</div><ul style="margin:4px 0;padding-left:18px">${findingHtml(a.f)}</ul>${linkHtml(link, "Αναφορά")}</td></tr>`;
  }).join("");
  const html = wrap(
    `<h1 style="margin:0 0 4px;font-size:20px;color:${COLOR.critical}">Κρίσιμο εύρημα ασφαλείας</h1>` +
    `<p style="margin:0 0 12px;color:#4b5563">Ο αυτόματος έλεγχος βρήκε ${n === 1 ? "κρίσιμο εύρημα" : `${n} κρίσιμα ευρήματα`}. Το ίδιο εύρημα δεν ξαναστέλνεται πριν περάσουν 24 ώρες.</p>` +
    `<table style="border-collapse:collapse;width:100%">${items}</table>`,
  );
  const text = [
    `ΚΡΙΣΙΜΟ: ${n} ${n === 1 ? "εύρημα" : "ευρήματα"} ασφαλείας`,
    "",
    ...alerts.flatMap((a) => [`${t(a.checkTitle, 200)} · ${athensDateTime(a.startedAt)}`, findingText(a.f), `  Αναφορά: ${linkFor(a.reportId)}`, ""]),
  ].join("\n");
  return { subject, html, text };
}
