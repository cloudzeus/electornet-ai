import type { StoredCheck } from "@/lib/security/audit/types";
import type { Finding } from "@/lib/security/audit/rules";
import { explainFor } from "@/lib/security/audit/explain";
import { PartialBadge, SEV_CARD, SeverityBadge } from "./Severity";

/**
 * Οι έλεγχοι μιας αναφοράς: κατάσταση, σύνοψη, ευρήματα (τίτλος, λεπτομέρεια, τεκμήριο). Όλα τα κείμενα μπορεί να
 * περιέχουν ό,τι έγραψε ένας επιτιθέμενος (HTML σελίδας, περιεχόμενο βάσης): αποδίδονται ΜΟΝΟ ως κείμενο (το React
 * κάνει escape — καμία εισαγωγή HTML). Μακριά τεκμήρια σπάνε γραμμή, χωρίς οριζόντια κύλιση.
 */
export function ReportChecks({ checks }: { checks: StoredCheck[] }) {
  if (!checks.length) return <p className="m-0 rounded-2xl bg-white border border-eu-line p-5 text-eu-ink-3 text-[length:var(--fs-14)]">Η αναφορά δεν περιέχει ελέγχους σε αναγνώσιμη μορφή.</p>;
  return (
    <ol className="m-0 p-0 list-none grid gap-3 min-w-0">
      {checks.map((c) => <CheckCard key={c.key} c={c} />)}
    </ol>
  );
}

function CheckCard({ c }: { c: StoredCheck }) {
  const ex = explainFor(c.key);
  return (
    <li id={`check-${c.key}`} className={`rounded-2xl bg-white border-2 ${SEV_CARD[c.status]} p-4 @md:p-5 grid gap-2 min-w-0`}>
      <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] min-w-0 break-words">{c.title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge status={c.status} />
          {c.complete === false && <PartialBadge />}
        </div>
      </div>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] break-words">{c.summary || "—"}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-eu-muted text-[length:var(--fs-13)]">
        <span>Διάρκεια {(c.ms / 1000).toFixed(1)}″</span>
        <span>{c.findings.length ? `${c.findings.length} ${c.findings.length === 1 ? "εύρημα" : "ευρήματα"}` : "κανένα εύρημα"}</span>
      </div>
      {ex && (
        <details className="text-[length:var(--fs-14)] text-eu-ink-3">
          <summary className="cursor-pointer font-bold text-eu-blue min-h-11 md:min-h-9 inline-flex items-center">Τι ελέγχει αυτός ο έλεγχος</summary>
          <p className="m-0 mt-1 break-words">{ex.what}</p>
        </details>
      )}
      {c.findings.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
          {c.findings.map((f, i) => <FindingItem key={i} f={f} />)}
        </ul>
      )}
    </li>
  );
}

function FindingItem({ f }: { f: Finding }) {
  return (
    <li className="rounded-xl bg-eu-surface p-3 grid gap-1 min-w-0">
      <div className="flex flex-wrap items-start gap-2 min-w-0">
        <SeverityBadge status={f.severity} />
        <strong className="text-eu-ink text-[length:var(--fs-15)] min-w-0 break-words">{f.title}</strong>
      </div>
      {f.detail && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] break-words whitespace-pre-line">{f.detail}</p>}
      {f.evidence && (
        <div className="min-w-0">
          <span className="text-eu-muted text-[length:var(--fs-13)]">Τεκμήριο: </span>
          <code className="font-mono text-[length:var(--fs-13)] text-eu-ink break-all whitespace-pre-wrap bg-white rounded px-1">{f.evidence}</code>
        </div>
      )}
    </li>
  );
}
