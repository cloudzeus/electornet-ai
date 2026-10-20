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
  service: { label: "Υπηρεσίες", html: true },
  promotion: { label: "Όροι προσφορών", html: true },
  ad: { label: "Διαφημιστικές θέσεις", html: true },
  newsletter: { label: "Newsletter", html: true },
  sticker: { label: "Αυτοκόλλητα (SVG)", html: true },
  category: { label: "Κατηγορίες", html: true },
  product: { label: "Προϊόντα", html: true },
  section: { label: "Ενότητες περιγραφής προϊόντων", html: true },
  s1item: { label: "Είδη SoftOne (περιγραφές ERP)", html: false },
} as const satisfies Record<string, { label: string; html: boolean }>;
export type SourceKey = keyof typeof SOURCES;

/** Χρόνος σάρωσης ανά mode: το light τρέχει κάθε ώρα και όλος ο έλεγχος έχει 60″. */
export const CONTENT_BUDGET_MS: Record<AuditMode, number> = { full: 180_000, light: 45_000 };

/** Πεδία συνδέσμων (τελευταίο κομμάτι της διαδρομής): href, url, link, ctaHref, buttonUrl… */
const LINK_FIELD = /(?:^|[a-z])(?:href|url|link)$/i;
/**
 * Σχήμα που εκτελεί κώδικα στο κλικ / στη φόρτωση (ο browser αγνοεί κενά/ελέγχους πριν από το σχήμα). data: μόνο αν ΔΕΝ
 * είναι raster εικόνα — το data:image/svg+xml μπορεί να έχει script, άρα μένει.
 */
const BAD_SCHEME = /^(?:javascript:|vbscript:|data:(?!image\/(?:png|jpe?g|gif|webp|avif)[;,]))/i;

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
      // ο έλεγχος συνδέσμου εξαρτάται από το πεδίο, άρα γίνεται πριν από το dedupe του κειμένου
      const where = !path ? field : path.startsWith("[") ? `${field}${path}` : `${field}.${path}`;
      const leaf = where.split(".").pop()!.replace(/\[\d+\]$/, "");
      const linkHit = LINK_FIELD.test(leaf) && BAD_SCHEME.test(text.replace(/[\x00-\x20]+/g, ""));
      const linkKey = `link|${path || field}|${text}`; // data και published με τον ίδιο σύνδεσμο → ένα εύρημα
      if (linkHit && !seen.has(linkKey)) {
        seen.add(linkKey);
        out.push({ severity: "critical", title: "Σύνδεσμος javascript: / data: σε πεδίο συνδέσμου", detail: `${src.label}: ${rec.label ? `«${rec.label}» ` : ""}(${rec.id}), πεδίο ${where}. Εκτελεί κώδικα ή ανοίγει σελίδα HTML με το κλικ.`, evidence: `${source}#${rec.id} ${where}: ${text.trim().slice(0, 60)}` });
      }
      if (seen.has(text)) continue;
      seen.add(text);
      for (const f of scanContent(text, { ownHosts: opts.ownHosts })) {
        if (linkHit && /^(?:data:text\/html|javascript:)/.test(f.title)) continue; // το ίδιο, ήδη ως σύνδεσμος
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
export function contentOutcome(input: { mode: AuditMode; since: Date; tallies: SourceTally[]; findings: Finding[]; complete: boolean }): { status: Severity; summary: string; findings: Finding[]; complete: boolean } {
  const scanned = input.tallies.reduce((s, t) => s + t.scanned, 0), total = input.tallies.reduce((s, t) => s + t.total, 0);
  const per = input.tallies.map((t) => `${SOURCES[t.key].label} ${n(t.scanned)}${t.scanned < t.total ? `/${n(t.total)}` : ""}`).join(" · ");
  const scope = input.mode === "full" ? "όλες οι εγγραφές" : `μόνο όσες άλλαξαν από ${athens(input.since)} — οι κατηγορίες, χωρίς ημερομηνία αλλαγής, όλες`;
  const findings = [...input.findings];
  let head = `Σαρώθηκαν ${n(scanned)} εγγραφές (${scope})`;
  if (!input.complete) {
    head = `Η σάρωση δεν ολοκληρώθηκε — σαρώθηκαν ${n(scanned)}/${n(total)} εγγραφές (${scope})`;
    findings.push({ severity: "warn", title: "Η σάρωση περιεχομένου δεν ολοκληρώθηκε", detail: `Τελείωσε ο διαθέσιμος χρόνος: σαρώθηκαν ${n(scanned)} από ${n(total)} εγγραφές. Οι υπόλοιπες δεν ελέγχθηκαν σε αυτή την εκτέλεση.` });
  }
  // κατώφλι λογικής: ο πλήρης έλεγχος διαβάζει ΟΛΑ τα προϊόντα — κανένα σημαίνει λάθος βάση (ή άδειο αντίγραφο), όχι «καθαρό»
  const products = input.tallies.find((t) => t.key === "product");
  if (input.mode === "full" && products && products.total === 0) findings.push({ severity: "error", title: "0 προϊόντα — πιθανώς λάθος βάση", detail: "Ο πλήρης έλεγχος δεν βρήκε κανένα προϊόν στη βάση. Ένα e-shop χωρίς προϊόντα σημαίνει ότι η εφαρμογή διαβάζει λάθος (ή άδεια) βάση — η σάρωση περιεχομένου δεν είναι αξιόπιστη.", evidence: "content: 0 προϊόντα" });
  return { status: worst(findings.map((f) => f.severity)), summary: `${head}: ${per}. Τα πρότυπα email είναι κώδικας της εφαρμογής (όχι βάση) και δεν σαρώνονται εδώ.`, findings, complete: input.complete };
}
