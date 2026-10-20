import Link from "next/link";
import { ChevronRight, HeartPulse, OctagonAlert, ShieldHalf } from "lucide-react";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { securityRecipients } from "@/lib/security/audit/notify";
import { asSeverity, storedChecks } from "@/lib/security/audit/notify-core";
import { athens } from "@/lib/security/audit/execute";
import { dayStrip, findingCounts, overview, watcherState, HISTORY_DAYS } from "@/lib/security/audit/view";
import { manualRunState } from "@/lib/security/audit/manual";
import { FULL_RUN_WHERE } from "@/lib/security/audit/run";
import { PartialBadge, SEV_CARD, SeverityBadge } from "@/components/admin/security/Severity";
import { DayStrip } from "@/components/admin/security/DayStrip";
import { SecurityActions } from "@/components/admin/security/SecurityActions";
import { Explainer } from "@/components/admin/security/Explainer";

export const metadata = { title: "Ασφάλεια" };
export const dynamic = "force-dynamic";
/** «Τρέξε τώρα» (server action της σελίδας): ο πλήρης έλεγχος κρατά έως ~5′. */
export const maxDuration = 300;

const DAY = 86_400_000;
const MODE: Record<string, string> = { full: "Πλήρης", light: "Ωριαίος" };
const ago = (ms: number) => (ms < 60_000 ? "μόλις τώρα" : ms < 3_600_000 ? `πριν ${Math.round(ms / 60_000)}′` : ms < 48 * 3_600_000 ? `πριν ${Math.floor(ms / 3_600_000)} ώρ.` : `πριν ${Math.floor(ms / DAY)} ημ.`);
type Row = { id: string; mode: string; startedAt: Date; finishedAt: Date | null; status: string; checks: unknown; summarySent: boolean | null };
const brief = (r: Row | null) => (r ? { startedAt: r.startedAt, status: r.status, partial: storedChecks(r.checks).some((c) => c.complete === false) } : null);

/**
 * Ασφάλεια (μόνο Super Admin): η κατάσταση του ημερήσιου ελέγχου ασφαλείας τώρα (τελευταίος πλήρης και ωριαίος, τελευταία
 * επικοινωνία του εξωτερικού φύλακα), ιστορικό 90 ημερών, οι πρόσφατες αναφορές, «Τρέξε τώρα» / «Αποστολή report τώρα»
 * και τι ελέγχεται και γιατί. Οι έλεγχοι κάνουν μόνο αναγνώσεις.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireSuperAdmin();
  const { m } = await searchParams;
  const onlyFull = m === "full";
  const now = new Date();
  const since = new Date(now.getTime() - (HISTORY_DAYS + 1) * DAY);
  const select = { id: true, mode: true, startedAt: true, finishedAt: true, status: true, checks: true, summarySent: true } as const;
  const [history, recent, lastFull, lastLight, ping, recipients] = await Promise.all([
    db.securityReport.findMany({ where: { startedAt: { gte: since } }, select: { id: true, startedAt: true, status: true } }),
    db.securityReport.findMany({ where: onlyFull ? { mode: "full" } : {}, orderBy: { startedAt: "desc" }, take: 15, select }),
    // ο τελευταίος ΠΛΗΡΗΣ full (σημάδι run) — όχι δοκιμή ενός ελέγχου
    db.securityReport.findFirst({ where: FULL_RUN_WHERE, orderBy: { startedAt: "desc" }, select }),
    db.securityReport.findFirst({ where: { mode: "light" }, orderBy: { startedAt: "desc" }, select }),
    db.auditLog.findFirst({ where: { action: "security.watch.ping", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    securityRecipients().catch(() => [] as string[]),
  ]);
  const ov = overview({ full: brief(lastFull), light: brief(lastLight), now });
  const watcher = watcherState(ping?.createdAt ?? null, now);
  const fullChecks = lastFull ? storedChecks(lastFull.checks) : [];
  const counts = findingCounts(fullChecks);
  const running = manualRunState(now);

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ShieldHalf className="size-3.5" aria-hidden /> Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ασφάλεια</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Αυτόματος έλεγχος ασφαλείας του e-shop: πλήρης κάθε μέρα στις 07:00 και ωριαίος κάθε ώρα, με email σύνοψης και άμεση ειδοποίηση όταν βρεθεί κάτι κρίσιμο. Ένας ανεξάρτητος εξωτερικός φύλακας ελέγχει το site και από έξω. Όλοι οι έλεγχοι κάνουν μόνο αναγνώσεις.</p>
      </div>

      <section data-help="security.today" aria-labelledby="sec-now" className={`rounded-2xl bg-white border-2 ${SEV_CARD[ov.status]} p-4 @md:p-5 grid gap-3 min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sec-now" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Κατάσταση τώρα</h3>
          <SeverityBadge status={ov.status} big />
        </div>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] break-words">
          {lastFull ? <>Με βάση τον τελευταίο πλήρη έλεγχο ({athens(lastFull.startedAt)}){lastLight && lastLight.startedAt > lastFull.startedAt ? <> και τον νεότερο ωριαίο ({athens(lastLight.startedAt)})</> : null}. </> : null}
          {lastFull && <>Ευρήματα του πλήρους: <b>{counts.critical}</b> κρίσιμα, <b>{counts.error}</b> σφάλματα ελέγχου, <b>{counts.warn}</b> προειδοποιήσεις.</>}
        </p>
        {ov.notes.length > 0 && (
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {ov.notes.map((n, i) => <li key={i} className="flex items-start gap-2 min-w-0 text-[length:var(--fs-14)] text-eu-ink"><SeverityBadge status={n.severity} /><span className="min-w-0 break-words pt-0.5">{n.text}</span></li>)}
          </ul>
        )}
        <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
          <ReportTile label="Τελευταίος πλήρης" r={lastFull} now={now} />
          <ReportTile label="Τελευταίος ωριαίος" r={lastLight} now={now} />
          <div data-help="security.watcher" className={`rounded-xl border-2 p-3 grid gap-1 content-start min-w-0 ${watcher.kind === "ok" ? "border-eu-line" : "border-eu-red bg-eu-red/10"}`}>
            <div className="text-eu-muted text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><HeartPulse className="size-4" aria-hidden /> Εξωτερικός φύλακας (GitHub)</div>
            {watcher.kind === "ok" ? (
              <>
                <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">Τελευταία επικοινωνία {ago(watcher.ageMs!)}</div>
                <div className="text-eu-muted text-[length:var(--fs-13)]">{athens(ping!.createdAt)} · όριο σιωπής 26 ώρες</div>
              </>
            ) : (
              <>
                <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] inline-flex items-start gap-1.5"><OctagonAlert className="size-5 text-eu-red shrink-0" aria-hidden />{watcher.kind === "stale" ? "Ο εξωτερικός φύλακας σιώπησε" : "Ο εξωτερικός φύλακας δεν έχει επικοινωνήσει ποτέ"}</div>
                <div className="text-eu-ink-2 text-[length:var(--fs-13)] break-words">
                  {watcher.kind === "stale" ? `Τελευταίο σήμα ${athens(ping!.createdAt)} (${ago(watcher.ageMs!)}) — πάνω από 26 ώρες.` : `Κανένα σήμα τις τελευταίες ${HISTORY_DAYS} ημέρες.`} Ελέγξτε στο GitHub (Actions → security-watch) ότι το workflow τρέχει και ότι το SECURITY_WATCH_SECRET είναι ίδιο σε GitHub και Coolify.
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section data-help="security.actions" aria-labelledby="sec-actions" className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 min-w-0">
        <h3 id="sec-actions" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Χειροκίνητα</h3>
        <SecurityActions latestFullId={lastFull?.id ?? null} runningSince={running ? running.startedAt.toISOString() : null} recipients={recipients.length} />
      </section>

      <section data-help="security.history" aria-labelledby="sec-history" className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 min-w-0">
        <h3 id="sec-history" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ιστορικό {HISTORY_DAYS} ημερών</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Μία ημέρα ανά κελί, με το χρώμα της χειρότερης αναφοράς της ημέρας (ώρα Ελλάδας). Πατήστε ένα κελί για να ανοίξει εκείνη η αναφορά.</p>
        <DayStrip cells={dayStrip(history, now)} />
      </section>

      <section data-help="security.recent" aria-labelledby="sec-recent" className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sec-recent" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Πρόσφατες αναφορές</h3>
          <nav aria-label="Φίλτρο αναφορών" className="flex gap-1 text-[length:var(--fs-14)] font-bold">
            <Link href="/admin/asfaleia" aria-current={!onlyFull ? "page" : undefined} className={`rounded-full px-3 min-h-11 md:min-h-9 inline-flex items-center ${!onlyFull ? "bg-eu-navy text-white" : "bg-eu-chip text-eu-blue hover:bg-eu-blue hover:text-white"}`}>Όλες</Link>
            <Link href="/admin/asfaleia?m=full" aria-current={onlyFull ? "page" : undefined} className={`rounded-full px-3 min-h-11 md:min-h-9 inline-flex items-center ${onlyFull ? "bg-eu-navy text-white" : "bg-eu-chip text-eu-blue hover:bg-eu-blue hover:text-white"}`}>Μόνο πλήρεις</Link>
          </nav>
        </div>
        {recent.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία αναφορά ακόμη.</p> : (
          <ul className="m-0 p-0 list-none grid min-w-0">
            {recent.map((r) => {
              const checks = storedChecks(r.checks);
              const c = findingCounts(checks);
              return (
                <li key={r.id} className="border-t border-eu-line-2 first:border-t-0 min-w-0">
                  <Link href={`/admin/asfaleia/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 min-h-11 hover:bg-eu-surface/60 rounded-lg px-1 -mx-1 min-w-0">
                    <SeverityBadge status={asSeverity(r.status)} />
                    {checks.some((x) => x.complete === false) && <PartialBadge />}
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] tabular-nums">{athens(r.startedAt)}</span>
                    <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{MODE[r.mode] ?? r.mode} · {checks.length} έλεγχοι</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)]">{c.critical + c.error + c.warn ? `${c.critical} κρίσιμα · ${c.error} σφάλματα · ${c.warn} προειδ.` : "κανένα εύρημα"}</span>
                    <ChevronRight className="size-4 text-eu-muted ml-auto" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-help="security.explain" aria-labelledby="sec-explain" className="rounded-2xl bg-eu-surface border border-eu-line p-4 @md:p-5 grid gap-3 min-w-0">
        <h3 id="sec-explain" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τι ελέγχεται και γιατί</h3>
        <Explainer />
      </section>
    </div>
  );
}

function ReportTile({ label, r, now }: { label: string; r: Row | null; now: Date }) {
  if (!r) return <div className="rounded-xl border-2 border-eu-line p-3 grid gap-1 content-start"><div className="text-eu-muted text-[length:var(--fs-13)]">{label}</div><div className="font-bold text-eu-ink text-[length:var(--fs-16)]">Δεν έχει τρέξει ακόμη</div></div>;
  const partial = storedChecks(r.checks).some((c) => c.complete === false);
  return (
    <Link href={`/admin/asfaleia/${r.id}`} className="rounded-xl border-2 border-eu-line hover:border-eu-blue p-3 grid gap-1 content-start min-w-0">
      <div className="text-eu-muted text-[length:var(--fs-13)]">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5"><SeverityBadge status={asSeverity(r.status)} />{partial && <PartialBadge />}</div>
      <div className="text-eu-ink text-[length:var(--fs-14)]"><span className="font-bold tabular-nums">{athens(r.startedAt)}</span> <span className="text-eu-muted">· {ago(now.getTime() - r.startedAt.getTime())}</span></div>
      {r.summarySent === false && <div data-help="security.summary-unsent" className="text-eu-red text-[length:var(--fs-13)] font-bold">το email σύνοψης δεν στάλθηκε</div>}
    </Link>
  );
}
