import { scanContent, worst, type Finding, type Severity } from "../rules";
import { athens } from "../execute";
import type { AuditMode } from "../types";

/**
 * Σάρωση περιεχομένου για ένεση (scanContent) — καθαρή λογική· τα δεδομένα τα φέρνει το content.ts σε παρτίδες.
 *
 * Κάθε συμβολοσειρά σαρώνεται χωριστά (στα JSON: κάθε φύλλο με τη διαδρομή του), ώστε λέξεις από διαφορετικά πεδία να
 * μη «συναντιούνται» σε ψευδές εύρημα. Οι περιγραφές του ERP (S1Item) έχουν νόμιμα iframes προμηθευτών και ΔΕΝ
 * αποδίδονται ως HTML στο site (μόνο σε textarea της διαχείρισης): εκεί iframe από άγνωστο host → warn, όχι critical.
 * Τα υπόλοιπα (script, on…=, javascript:, ClickFix) μένουν critical παντού — είναι ένδειξη ένεσης στην πηγή.
 */

export const SOURCES = {
  setting: { label: "Ρυθμίσεις (μη μυστικά πεδία)", html: true },
  cms: { label: "CMS (κείμενα, hero slides, αρχική, σελίδες μαρκών)", html: true },
  widget: { label: "Components σελίδων", html: true },
  landing: { label: "Landing pages", html: true },
  newsletter: { label: "Newsletter", html: true },
  sticker: { label: "Αυτοκόλλητα (SVG)", html: true },
  category: { label: "Κατηγορίες", html: true },
  product: { label: "Προϊόντα", html: true },
  section: { label: "Ενότητες περιγραφής προϊόντων", html: true },
  s1item: { label: "Είδη SoftOne (περιγραφές ERP)", html: false },
} as const satisfies Record<string, { label: string; html: boolean }>;
export type SourceKey = keyof typeof SOURCES;

/** Όλες οι μη κενές συμβολοσειρές ενός JSON, με τη διαδρομή τους. */
export function stringsOf(v: unknown, path = "", out: { path: string; text: string }[] = [], depth = 0): { path: string; text: string }[] {
  if (depth > 40) return out;
  if (typeof v === "string") { if (v) out.push({ path, text: v }); }
  else if (Array.isArray(v)) v.forEach((x, i) => stringsOf(x, `${path}[${i}]`, out, depth + 1));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) stringsOf(x, path ? `${path}.${k}` : k, out, depth + 1);
  return out;
}

const NOT_HTML = " (Το πεδίο δεν αποδίδεται ως HTML στο site — δεν εκτελείται· ελέγξτε την πηγή στο ERP.)";

/** Ευρήματα μιας εγγραφής. `fields`: όνομα πεδίου → τιμή (κείμενο ή JSON). */
export function scanRecord(source: SourceKey, rec: { id: string; label?: string | null; fields: Record<string, unknown> }, opts: { ownHosts?: string[] } = {}): Finding[] {
  const src = SOURCES[source];
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const [field, value] of Object.entries(rec.fields)) {
    for (const { path, text } of stringsOf(value)) {
      if (seen.has(text)) continue;
      seen.add(text);
      const where = path ? `${field}.${path}` : field;
      for (const f of scanContent(text, { ownHosts: opts.ownHosts })) {
        const downgrade = !src.html && f.severity === "critical" && /^iframe/.test(f.title);
        out.push({
          severity: downgrade ? "warn" : f.severity,
          title: f.title,
          detail: `${src.label}: ${rec.label ? `«${rec.label}» ` : ""}(${rec.id}), πεδίο ${where}. ${f.detail}${downgrade ? NOT_HTML : ""}`,
          evidence: `${source}#${rec.id} ${where}: ${f.evidence ?? ""}`,
        });
      }
    }
  }
  return out;
}

export type SourceTally = { key: SourceKey; scanned: number; total: number };
const n = (x: number) => x.toLocaleString("el-GR");

/** Κατάσταση, σύνοψη και ευρήματα του ελέγχου. Μερική σάρωση → ΠΟΤΕ ok. */
export function contentOutcome(input: { mode: AuditMode; since: Date; tallies: SourceTally[]; findings: Finding[]; complete: boolean }): { status: Severity; summary: string; findings: Finding[] } {
  const scanned = input.tallies.reduce((s, t) => s + t.scanned, 0), total = input.tallies.reduce((s, t) => s + t.total, 0);
  const per = input.tallies.map((t) => `${SOURCES[t.key].label} ${n(t.scanned)}${t.scanned < t.total ? `/${n(t.total)}` : ""}`).join(" · ");
  const scope = input.mode === "full" ? "όλες οι εγγραφές" : `μόνο όσες άλλαξαν από ${athens(input.since)} — οι κατηγορίες, χωρίς ημερομηνία αλλαγής, όλες`;
  const findings = [...input.findings];
  let head = `Σαρώθηκαν ${n(scanned)} εγγραφές (${scope})`;
  if (!input.complete) {
    head = `Η σάρωση δεν ολοκληρώθηκε — σαρώθηκαν ${n(scanned)}/${n(total)} εγγραφές (${scope})`;
    findings.push({ severity: "warn", title: "Η σάρωση περιεχομένου δεν ολοκληρώθηκε", detail: `Τελείωσε ο διαθέσιμος χρόνος: σαρώθηκαν ${n(scanned)} από ${n(total)} εγγραφές. Οι υπόλοιπες δεν ελέγχθηκαν σε αυτή την εκτέλεση.` });
  }
  return { status: worst(findings.map((f) => f.severity)), summary: `${head}: ${per}. Τα πρότυπα email είναι κώδικας της εφαρμογής (όχι βάση) και δεν σαρώνονται εδώ.`, findings };
}
