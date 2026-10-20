import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { asSeverity, athensDateTime, parseRetry, storedChecks, MODE_LABEL } from "@/lib/security/audit/notify-core";
import { findingCounts, hasRunMarker } from "@/lib/security/audit/view";
import { PartialBadge, SEV_CARD, SeverityBadge } from "@/components/admin/security/Severity";
import { ReportChecks } from "@/components/admin/security/ReportChecks";

export const metadata = { title: "Αναφορά ασφαλείας" };
export const dynamic = "force-dynamic";

/**
 * Μία αναφορά του ελέγχου ασφαλείας (μόνο Super Admin): πότε έτρεξε, κατάσταση, αν ήταν πλήρης ή μερικός, αν στάλθηκε η
 * ειδοποίηση, και κάθε έλεγχος με τη σύνοψη, τα ευρήματα και τα τεκμήριά τους.
 */
export default async function SecurityReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!/^[a-z0-9]{1,64}$/i.test(id)) notFound();
  const r = await db.securityReport.findUnique({ where: { id }, select: { id: true, mode: true, startedAt: true, finishedAt: true, status: true, checks: true, alerted: true, alertRetry: true } });
  if (!r) notFound();
  const status = asSeverity(r.status);
  const checks = storedChecks(r.checks);
  const partial = checks.some((c) => c.complete === false);
  const counts = findingCounts(checks);
  const allChecks = hasRunMarker(r.checks);
  const retry = parseRetry(r.alertRetry);
  const secs = r.finishedAt ? Math.max(0, Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)) : null;
  const meta: [string, string][] = [
    ["Είδος", MODE_LABEL[r.mode] ?? r.mode],
    ["Έναρξη", `${athensDateTime(r.startedAt)} (ώρα Ελλάδας)`],
    ["Λήξη", r.finishedAt ? `${athensDateTime(r.finishedAt)}${secs !== null ? ` · ${secs}″` : ""}` : "—"],
    ["Έλεγχοι", `${checks.length}${allChecks ? " (όλοι οι έλεγχοι του είδους)" : ""}`],
    ["Ευρήματα", `${counts.critical} κρίσιμα · ${counts.error} σφάλματα ελέγχου · ${counts.warn} προειδοποιήσεις`],
    ["Αναφορά", r.id],
  ];
  const alert = counts.critical === 0 ? "Δεν χρειάστηκε (κανένα κρίσιμο εύρημα)."
    : retry?.gaveUp ? `Δεν παραδόθηκε σε ${retry.to.length} ${retry.to.length === 1 ? "παραλήπτη" : "παραλήπτες"} μετά από ${retry.attempts} προσπάθειες.`
    : retry ? `Εκκρεμεί για ${retry.to.length} ${retry.to.length === 1 ? "παραλήπτη" : "παραλήπτες"} (προσπάθεια ${retry.attempts} από 3).`
    : r.alerted ? "Στάλθηκε (ή το ίδιο εύρημα είχε σταλεί τις προηγούμενες 23 ώρες)." : "Δεν έχει σταλεί ακόμη — νέα προσπάθεια στον επόμενο αυτόματο έλεγχο.";

  return (
    <div className="grid gap-5 min-w-0">
      <div className="grid gap-2 min-w-0">
        <Link href="/admin/asfaleia" className="inline-flex items-center gap-1.5 font-bold text-eu-blue text-[length:var(--fs-14)] min-h-11 md:min-h-9 w-fit hover:underline"><ArrowLeft className="size-4" aria-hidden /> Ασφάλεια</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Αναφορά ασφαλείας</h2>
          <SeverityBadge status={status} big />
          {partial && <PartialBadge />}
        </div>
      </div>

      <section data-help="security.report.meta" aria-label="Στοιχεία αναφοράς" className={`rounded-2xl bg-white border-2 ${SEV_CARD[status]} p-4 @md:p-5 grid gap-3 min-w-0`}>
        <dl className="m-0 grid grid-cols-1 @lg:grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[length:var(--fs-14)] min-w-0">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-eu-muted">{k}</dt>
              <dd className="m-0 mb-1 @lg:mb-0 text-eu-ink break-words min-w-0">{v}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="text-eu-muted">Ειδοποίηση «ΚΡΙΣΙΜΟ»</dt>
            <dd className={`m-0 break-words min-w-0 ${retry?.gaveUp ? "text-eu-red font-bold" : "text-eu-ink"}`}>{alert}</dd>
          </div>
        </dl>
        {partial && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">«Μερικός έλεγχος»: τουλάχιστον ένας έλεγχος δεν κάλυψε όλο το διάστημα (χρονικό όριο, όριο πλήθους ή σφάλμα ανάγνωσης) — δείτε τη σύνοψή του παρακάτω.</p>}
      </section>

      <section data-help="security.report.checks" aria-label="Έλεγχοι" className="grid gap-3 min-w-0">
        <ReportChecks checks={checks} />
      </section>
    </div>
  );
}
