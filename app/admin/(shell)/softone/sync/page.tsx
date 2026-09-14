import Link from "next/link";
import { RefreshCw, Check, X, Database } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { LOOKUPS, lookupStats } from "@/lib/softone/lookups";
import { StatTile } from "@/components/admin/charts/Charts";
import { SyncButton, ClearRunsButtons } from "../SyncButtons";

export const metadata = { title: "Συγχρονισμοί SoftOne" };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const LABEL = Object.fromEntries(LOOKUPS.map((l) => [l.kind, l.plural]));
const since = (hours: number) => Date.now() - hours * 3600000;

/** Every sync run across all reference tables, newest first, plus what the nightly cron does. */
export default async function SyncHistoryPage() {
  await requirePermission("settings.integrations.write");
  const [runs, stats] = await Promise.all([db.s1SyncRun.findMany({ orderBy: { at: "desc" }, take: 120 }), lookupStats()]);
  const cut = since(24);
  const last24 = runs.filter((r) => r.at.getTime() > cut);
  const rows = stats.reduce((a, s) => a + s.total, 0);
  const failing = stats.filter((s) => s.last && !s.last.ok);
  const cron = !!process.env.CRON_SECRET;
  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><RefreshCw className="size-3.5" aria-hidden /> SoftOne ERP</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Συγχρονισμοί & ιστορικό</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Κάθε ανάγνωση από το SoftOne καταγράφεται εδώ: πόσες γραμμές διαβάστηκαν, πόσες δημιουργήθηκαν ή ενημερώθηκαν και πόσες έπαψαν να υπάρχουν στο ERP.</p>
        </div>
        <SyncButton label="Συγχρονισμός όλων" />
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
        <StatTile label="Πίνακες" value={String(stats.length)} sub={`${rows.toLocaleString("el-GR")} εγγραφές συνολικά`} accent />
        <StatTile label="Συγχρονισμοί (24ω)" value={String(last24.length)} sub={last24.filter((r) => !r.ok).length ? `${last24.filter((r) => !r.ok).length} με σφάλμα` : "χωρίς σφάλματα"} />
        <StatTile label="Πίνακες με σφάλμα" value={String(failing.length)} sub={failing.length ? failing.map((f) => f.label).join(", ") : "κανένας"} />
        <StatTile label="Αυτόματο (cron)" value={cron ? "έτοιμο" : "—"} sub={cron ? "GET /api/cron/softone-lookups" : "όρισε CRON_SECRET στο .env"} />
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-5 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ιστορικό</h3>
          <ClearRunsButtons />
        </div>
        {runs.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένας συγχρονισμός ακόμη.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--fs-14)]">
              <thead><tr className="text-left text-eu-muted"><th className="py-2 pr-3 font-bold">Πότε</th><th className="py-2 pr-3 font-bold">Πίνακας</th><th className="py-2 pr-3 font-bold">Από</th><th className="py-2 pr-3 font-bold">Αποτέλεσμα</th><th className="py-2 pr-3 font-bold text-right">Γραμμές</th><th className="py-2 pr-3 font-bold text-right">Νέες</th><th className="py-2 pr-3 font-bold text-right">Ενημ.</th><th className="py-2 pr-3 font-bold text-right">Λείπουν</th><th className="py-2 pr-3 font-bold text-right">Αγνοήθηκαν</th><th className="py-2 font-bold text-right">Χρόνος</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-eu-line-2">
                    <td className="py-2 pr-3 whitespace-nowrap text-eu-ink">{fmt(r.at)}</td>
                    <td className="py-2 pr-3"><Link href={`/admin/softone/${r.kind}`} className="text-eu-blue font-bold hover:underline">{LABEL[r.kind] ?? r.kind}</Link></td>
                    <td className="py-2 pr-3 text-eu-ink-3">{r.trigger === "cron" ? "αυτόματο" : r.trigger === "manual" ? "χειροκίνητο" : "script"}</td>
                    <td className="py-2 pr-3">{r.ok ? <span className="inline-flex items-center gap-1 text-eu-green font-bold"><Check className="size-4" aria-hidden /> OK</span> : <span className="inline-flex items-center gap-1 text-eu-red font-bold" title={r.error ?? ""}><X className="size-4" aria-hidden /> Σφάλμα</span>}{r.error && <div className="text-eu-ink-3 text-[length:var(--fs-13)] max-w-[44ch] truncate" title={r.error}>{r.error}</div>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.fetched}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-green font-bold">{r.created || ""}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-ink-3">{r.updated || ""}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-amber font-bold">{r.missing || ""}</td><td className="py-2 pr-3 text-right tabular-nums text-eu-muted" title="Γραμμές του SoftOne χωρίς κωδικό ή διπλότυπες">{r.skipped || ""}</td>
                    <td className="py-2 text-right tabular-nums text-eu-ink-3">{(r.ms / 1000).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-2"><Database className="size-5 text-eu-blue" aria-hidden /> Ανά πίνακα</h3>
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => <Link key={s.kind} href={`/admin/softone/${s.kind}`} className="rounded-full bg-eu-surface px-3 py-1.5 text-[length:var(--fs-13)] font-bold text-eu-ink hover:bg-eu-chip">{s.label} <span className="text-eu-muted tabular-nums">{s.total}</span>{s.missing ? <span className="text-eu-amber"> · {s.missing} λείπουν</span> : null}</Link>)}
        </div>
      </section>
    </div>
  );
}
