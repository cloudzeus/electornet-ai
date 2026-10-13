import { AlertTriangle, Check, ExternalLink, FileCheck2, Home, PackageCheck, Truck } from "lucide-react";
import { STATUS_LABEL, STATUS_TONE, type ShipmentTimeline, type TimelineStep, type Tone } from "@/lib/couriers/timeline-model";

/**
 * Widget παρακολούθησης αποστολής: courier + voucher, τέσσερα στάδια (Εκδόθηκε → Στον courier → Σε διανομή →
 * Παραδόθηκε), η τελευταία κίνηση και όλο το ιστορικό. Χωρίς state — ίδιο σε server (λογαριασμός, εντοπισμός) και
 * client (διαχείριση). Οι ώρες των couriers είναι ώρα Ελλάδας χωρίς ζώνη: εμφανίζονται όπως έρχονται.
 */
export const TONE_CLS: Record<Tone, string> = {
  neutral: "bg-eu-surface text-eu-muted", info: "bg-eu-chip text-eu-blue", good: "bg-eu-green/12 text-eu-green",
  warn: "bg-eu-amber/15 text-eu-ink-2", bad: "bg-eu-red/10 text-eu-red",
};
const ICON: Record<TimelineStep["key"], typeof Check> = { created: FileCheck2, picked: PackageCheck, out: Truck, done: Home };

/** «2026-10-13T10:03:38» (ή με ζώνη) → «13/10 10:03» */
export function fmtAt(at: string | null | undefined): string {
  const m = (at ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return at ?? "";
  return `${Number(m[3])}/${Number(m[2])}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] whitespace-nowrap ${TONE_CLS[STATUS_TONE[status] ?? "neutral"]} ${className}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ShipmentTracker({ t, audience = "customer", historyOpen = false }: { t: ShipmentTimeline; audience?: "customer" | "staff"; historyOpen?: boolean }) {
  const last = t.checkpoints[0] ?? null;
  const cancelled = t.status === "cancelled";
  return (
    <section aria-label={`Παρακολούθηση αποστολής ${t.voucher}`} className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><Truck className="size-4 text-eu-blue" aria-hidden />{t.courier}</span>
        <span className="font-mono tabular-nums text-eu-ink-2 text-[length:var(--fs-13)] select-all">{t.voucher}</span>
        <StatusBadge status={t.status} />
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline min-h-11 md:min-h-0">Στο site του courier <ExternalLink className="size-3.5" aria-hidden /></a>
      </div>

      {!cancelled && (
        <ol className="m-0 p-0 list-none grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.12fr)] gap-x-1" aria-label="Στάδια">
          {t.steps.map((s, i) => {
            const Icon = s.state === "problem" ? AlertTriangle : s.state === "done" ? Check : ICON[s.key];
            const dot = s.state === "done" ? "bg-eu-green text-white" : s.state === "current" ? "bg-eu-navy text-white ring-4 ring-eu-navy/15" : s.state === "problem" ? "bg-eu-red text-white ring-4 ring-eu-red/15" : "bg-eu-surface text-eu-muted border border-eu-line";
            const line = t.steps[i + 1] && t.steps[i + 1].state !== "todo" ? (t.steps[i + 1].state === "problem" ? "bg-eu-red/50" : "bg-eu-green") : "bg-eu-line";
            return (
              <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="relative grid justify-items-center gap-1 text-center min-w-0">
                {i < t.steps.length - 1 && <span aria-hidden className={`absolute top-4 left-1/2 w-full h-0.5 ${line}`} />}
                <span className={`relative z-10 size-8 grid place-items-center rounded-full ${dot}`}><Icon className="size-4" aria-hidden /></span>
                <span className={`text-[length:var(--fs-12)] leading-tight font-semibold ${s.state === "todo" ? "text-eu-muted" : s.state === "problem" ? "text-eu-red" : "text-eu-ink"}`}>{s.label}<span className="sr-only">{s.state === "done" ? " (ολοκληρώθηκε)" : s.state === "current" ? " (τώρα)" : s.state === "problem" ? " (πρόβλημα)" : ""}</span></span>
              </li>
            );
          })}
        </ol>
      )}

      {last ? (
        <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-13)] text-eu-ink-2">
          <span className="text-eu-muted">Τελευταία κίνηση · {fmtAt(last.at)}</span><br />
          <b className="text-eu-ink">{last.text}</b>{last.shop ? <span className="text-eu-ink-3"> · {last.shop}</span> : null}
        </p>
      ) : (
        <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-13)] text-eu-ink-3">{cancelled ? "Το voucher ακυρώθηκε." : audience === "customer" ? "Η αποστολή ετοιμάζεται· οι κινήσεις φαίνονται εδώ μόλις την παραλάβει ο courier." : "Καμία κίνηση ακόμη — περιμένει παραλαβή από τον courier."}</p>
      )}

      {t.checkpoints.length > 1 && (
        <details className="group" open={historyOpen}>
          <summary className="cursor-pointer list-none inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-8 hover:underline">
            <span className="group-open:hidden">Όλες οι κινήσεις ({t.checkpoints.length})</span><span className="hidden group-open:inline">Απόκρυψη κινήσεων</span>
          </summary>
          <ol className="m-0 mt-1 p-0 list-none grid gap-0 border-l-2 border-eu-line ml-1.5">
            {t.checkpoints.map((c, i) => (
              <li key={i} className="relative pl-4 pb-2.5 text-[length:var(--fs-13)]">
                <span aria-hidden className={`absolute -left-[5px] top-1.5 size-2 rounded-full ${i === 0 ? "bg-eu-navy" : "bg-eu-line-2"}`} />
                <span className="block text-eu-muted tabular-nums text-[length:var(--fs-12)]">{fmtAt(c.at)}{c.shop ? ` · ${c.shop}` : ""}</span>
                <span className={i === 0 ? "font-bold text-eu-ink" : "text-eu-ink-2"}>{c.text}</span>
                {audience === "staff" && c.code && <span className="text-eu-muted text-[length:var(--fs-12)]"> · {c.code}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {t.error && audience === "staff" && <p className="m-0 text-eu-red text-[length:var(--fs-12)]">Ζωντανή ενημέρωση: {t.error}</p>}
    </section>
  );
}
