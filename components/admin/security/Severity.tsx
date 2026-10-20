import { CircleCheck, CircleSlash, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/security/audit/rules";
import { PARTIAL_LABEL, SEVERITY_LABEL } from "@/lib/security/audit/notify-core";

/**
 * Κατάσταση ελέγχου: πάντα εικονίδιο + κείμενο + χρώμα (όχι μόνο χρώμα). Οι ετικέτες είναι ίδιες με του email.
 * ok πράσινο · warn πορτοκαλί · critical κόκκινο · error (ο έλεγχος δεν ολοκληρώθηκε) μωβ.
 */
export const SEV_ICON: Record<Severity, LucideIcon> = { ok: CircleCheck, warn: TriangleAlert, critical: OctagonAlert, error: CircleSlash };
const TONE: Record<Severity, string> = {
  ok: "bg-eu-green/10 border-eu-green/40 [&_svg]:text-eu-green",
  warn: "bg-eu-amber/10 border-eu-amber/50 [&_svg]:text-eu-amber",
  critical: "bg-eu-red/10 border-eu-red/50 [&_svg]:text-eu-red",
  error: "bg-eu-purple/10 border-eu-purple/40 [&_svg]:text-eu-purple",
};
/** Γέμισμα (κελιά λωρίδας, κουκκίδες)· `none` = δεν έτρεξε. */
export const SEV_FILL: Record<Severity | "none", string> = { ok: "bg-eu-green", warn: "bg-eu-amber", critical: "bg-eu-red", error: "bg-eu-purple", none: "bg-eu-line" };
/** Πλαίσιο κάρτας ανά κατάσταση. */
export const SEV_CARD: Record<Severity, string> = { ok: "border-eu-green/40", warn: "border-eu-amber/60", critical: "border-eu-red", error: "border-eu-purple/60" };

export function SeverityBadge({ status, big = false }: { status: Severity; big?: boolean }) {
  const Icon = SEV_ICON[status];
  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border font-extrabold text-eu-ink whitespace-nowrap ${TONE[status]} ${big ? "px-3 py-1 text-[length:var(--fs-16)]" : "px-2 py-0.5 text-[length:var(--fs-13)]"}`}>
      <Icon className={big ? "size-5" : "size-4"} aria-hidden /> {SEVERITY_LABEL[status]}
    </span>
  );
}

export function PartialBadge() {
  return <span className="inline-flex items-center rounded-full border border-dashed border-eu-amber px-2 py-0.5 text-[length:var(--fs-13)] font-bold text-eu-ink whitespace-nowrap">{PARTIAL_LABEL}</span>;
}
