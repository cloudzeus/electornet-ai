import { DatabaseBackup, ShieldAlert, Check, X, Download } from "lucide-react";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { backupTarget } from "@/lib/backup/run";
import { StatTile } from "@/components/admin/charts/Charts";
import { BackupNow } from "./BackupNow";

export const metadata = { title: "Backups βάσης" };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hoursSince = (d: Date | undefined) => (d ? (Date.now() - d.getTime()) / 3600000 : null);

/** Super admin: daily database backups to Bunny Storage — history, download, run now, setup checklist. */
export default async function BackupsPage() {
  await requireSuperAdmin();
  const [target, runs] = await Promise.all([backupTarget(), db.backupRun.findMany({ orderBy: { at: "desc" }, take: 60 })]);
  const okRuns = runs.filter((r) => r.ok && !r.deletedAt);
  const last = runs.find((r) => r.ok);
  const lastAgeH = hoursSince(last?.at);
  const passphrase = !!process.env.BACKUP_PASSPHRASE?.trim();
  const cron = !!process.env.CRON_SECRET;
  return (
    <div className="grid gap-5">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><DatabaseBackup className="size-3.5" aria-hidden /> Διαχείριση</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Backups βάσης δεδομένων</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Κάθε μέρα ένα πλήρες αντίγραφο (pg_dump, custom format) κρυπτογραφείται με AES-256 και ανεβαίνει στο Bunny Storage zone <b>{target.zone}</b>{target.dedicated ? " (αποκλειστικό zone)" : ` στον φάκελο ${target.prefix}`}. Διατήρηση {target.retentionDays} ημέρες, πάντα τουλάχιστον 3 αντίγραφα.</p>
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
        <StatTile label="Τελευταίο επιτυχημένο" value={last ? fmt(last.at) : "—"} sub={lastAgeH != null ? `πριν ${lastAgeH < 1 ? `${Math.round(lastAgeH * 60)} λεπτά` : `${lastAgeH.toFixed(0)} ώρες`}` : "κανένα ακόμη"} accent={!!last && lastAgeH! < 26} />
        <StatTile label="Διαθέσιμα αντίγραφα" value={String(okRuns.length)} sub={`${(okRuns.reduce((a, r) => a + (r.bytes ?? 0), 0) / 1048576).toFixed(1)} MB συνολικά`} />
        <StatTile label="Κρυπτογράφηση" value={passphrase ? "AES-256" : "ΟΧΙ"} sub={passphrase ? "BACKUP_PASSPHRASE ορίστηκε" : "όρισε BACKUP_PASSPHRASE στο .env"} />
        <StatTile label="Αυτόματο (cron)" value={cron ? "έτοιμο" : "—"} sub={cron ? "GET /api/cron/backup" : "όρισε CRON_SECRET στο .env"} />
      </div>
      {(!passphrase || !cron) && (
        <div className="rounded-xl bg-eu-yellow/15 border border-eu-yellow p-4 text-[length:var(--fs-14)] text-eu-ink grid gap-1">
          <div className="font-extrabold inline-flex items-center gap-1.5"><ShieldAlert className="size-4" aria-hidden /> Εκκρεμότητες για παραγωγή</div>
          {!passphrase && <div>• <code>BACKUP_PASSPHRASE</code>: χωρίς αυτό τα αρχεία ανεβαίνουν ακρυπτογράφητα. Φύλαξέ το και εκτός server· χωρίς αυτό δεν γίνεται επαναφορά.</div>}
          {!cron && <div>• <code>CRON_SECRET</code> + προγραμματισμός: Coolify scheduled task ή crontab <code>0 3 * * * curl -fsS -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://www.euronics.gr/api/cron/backup</code> (ή <code>scripts/backup-db.ts</code>). Δες <code>docs/backup.md</code>.</div>}
        </div>
      )}
      <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Χειροκίνητο backup</h3>
        <BackupNow />
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-5">
        <h3 className="m-0 mb-3 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ιστορικό</h3>
        {runs.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα backup ακόμη.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--fs-14)]">
              <thead><tr className="text-left text-eu-muted"><th className="py-2 pr-3 font-bold">Πότε</th><th className="py-2 pr-3 font-bold">Από</th><th className="py-2 pr-3 font-bold">Αποτέλεσμα</th><th className="py-2 pr-3 font-bold text-right">Μέγεθος</th><th className="py-2 pr-3 font-bold text-right">Χρόνος</th><th className="py-2 pr-3 font-bold">Αρχείο</th><th className="py-2 font-bold"></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className={`border-t border-eu-line-2 ${r.deletedAt ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-3 whitespace-nowrap text-eu-ink">{fmt(r.at)}</td>
                    <td className="py-2 pr-3 text-eu-ink-3">{r.trigger === "cron" ? "αυτόματο" : r.trigger === "manual" ? "χειροκίνητο" : "script"}</td>
                    <td className="py-2 pr-3">{r.ok ? <span className="inline-flex items-center gap-1 text-eu-green font-bold"><Check className="size-4" aria-hidden /> OK{r.encrypted ? "" : " (χωρίς κρυπτογράφηση)"}</span> : <span className="inline-flex items-center gap-1 text-eu-red font-bold" title={r.error ?? ""}><X className="size-4" aria-hidden /> Απέτυχε</span>}{r.error && <div className="text-eu-ink-3 text-[length:var(--fs-13)] max-w-[48ch] truncate" title={r.error}>{r.error}</div>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-ink">{r.bytes != null ? `${(r.bytes / 1024).toFixed(0)} KB` : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-ink-3">{(r.ms / 1000).toFixed(1)} s</td>
                    <td className="py-2 pr-3 text-eu-ink-3 font-mono text-[length:var(--fs-13)] truncate max-w-[36ch]" title={r.sha256 ? `sha256 ${r.sha256}` : undefined}>{r.deletedAt ? "διαγράφηκε (retention)" : r.path?.split("/").pop() ?? "—"}</td>
                    <td className="py-2">{r.ok && !r.deletedAt && <a href={`/api/admin/backups/${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue font-extrabold px-3 min-h-9 hover:bg-eu-blue hover:text-white"><Download className="size-4" aria-hidden /> Λήψη</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
