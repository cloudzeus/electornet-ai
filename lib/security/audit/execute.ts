import { worst, type Finding, type Severity } from "./rules";
import type { AuditCtx, AuditMode, Check, StoredCheck } from "./types";

/**
 * Εκτέλεση ελέγχων χωρίς βάση (ΚΑΘΑΡΟ αρχείο — τα tests το τρέχουν χωρίς server). Κάθε έλεγχος τρέχει παράλληλα με τους
 * άλλους, με δικό του χρονικό όριο: σφάλμα ή λήξη ορίου → status "error", ΠΟΤΕ "ok". Η κατάσταση ενός ελέγχου δεν είναι
 * ποτέ καλύτερη από το χειρότερο εύρημά του.
 */

const HOUR = 3_600_000;
/** Αρχή του παραθύρου: full = τελευταίες 24 ώρες, light = τελευταία ώρα. */
export const sinceFor = (mode: AuditMode, now: Date) => new Date(now.getTime() - (mode === "full" ? 24 : 1) * HOUR);

const ATHENS = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «20/10 09:00» σε ώρα Ελλάδας. */
export function athens(d: Date): string {
  const p = Object.fromEntries(ATHENS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
/** Ώρα (0–23) σε ώρα Ελλάδας. */
export function athensHour(d: Date): number {
  return Number(ATHENS.formatToParts(d).find((x) => x.type === "hour")?.value ?? 0);
}

/** Μέγιστο πλήθος ευρημάτων ανά έλεγχο στο report· τα υπόλοιπα συνοψίζονται σε ένα. */
export const MAX_FINDINGS = 100;
const RANK: Record<Finding["severity"], number> = { warn: 1, error: 2, critical: 3 };

export function capFindings(findings: Finding[], max = MAX_FINDINGS): Finding[] {
  if (findings.length <= max) return findings;
  const sorted = [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const rest = sorted.slice(max);
  const sev = worst(rest.map((f) => f.severity)) as Finding["severity"];
  const titles = [...new Set(rest.map((f) => f.title))].slice(0, 5).join(" · ");
  return [...sorted.slice(0, max), { severity: sev, title: `… και ${rest.length} ακόμη ευρήματα`, detail: `Δεν χωρούν στην αναφορά (όριο ${max}). Είδη: ${titles}.` }];
}

const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function runOne(check: Check, ctx: AuditCtx): Promise<StoredCheck> {
  const t0 = Date.now();
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const base = { key: check.key, title: check.title };
  const fail = (summary: string): StoredCheck => ({ ...base, status: "error", summary, findings: [{ severity: "error", title: "Ο έλεγχος δεν ολοκληρώθηκε", detail: summary }], ms: Date.now() - t0 });
  try {
    const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), check.timeoutMs); });
    const out = await Promise.race([check.run({ ...ctx, signal: ac.signal }), timeout]);
    if (out === "timeout") {
      ac.abort();
      return fail(`Ξεπεράστηκε το χρονικό όριο (${Math.round(check.timeoutMs / 1000)}″) — ο έλεγχος δεν ολοκληρώθηκε.`);
    }
    const findings = capFindings(out.findings);
    const status: Severity = worst([out.status, ...findings.map((f) => f.severity)]);
    return { ...base, status, summary: out.summary, findings, ms: Date.now() - t0, ...(out.snapshot !== undefined ? { snapshot: out.snapshot } : {}) };
  } catch (e) {
    ac.abort();
    return fail(`Σφάλμα: ${short(e instanceof Error ? e.message : String(e))}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Τρέχει τους ελέγχους παράλληλα· τα αποτελέσματα με τη σειρά του μητρώου. */
export function runChecks(checks: Check[], ctx: AuditCtx): Promise<StoredCheck[]> {
  return Promise.all(checks.map((c) => runOne(c, ctx)));
}
