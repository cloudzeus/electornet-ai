"use client";
import { useState, useTransition } from "react";
import { Play, Pause, Loader2, Check, X, Clock } from "lucide-react";
import { runScheduledJob, toggleScheduledJob } from "../actions";

export interface JobRow { key: string; label: string; when: string; enabled: boolean; running: boolean; lastOk: boolean | null; lastAt: string | null; lastMessage: string | null; next: string; runs: number; fails: number }

/** Μία κάρτα ανά αυτόματη εργασία: πότε τρέχει, τι έγινε την τελευταία φορά (με ξεκάθαρο μήνυμα), «Τρέξε τώρα», παύση. */
export function ScheduledJobs({ jobs, active }: { jobs: JobRow[]; active: boolean }) {
  return (
    <div className="grid gap-3 @3xl:grid-cols-3">
      {jobs.map((j) => <JobCard key={j.key} job={j} active={active} />)}
    </div>
  );
}

function JobCard({ job, active }: { job: JobRow; active: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const run = () => start(async () => {
    setResult(null);
    const r = await runScheduledJob(job.key);
    setResult(r.ran ? { ok: r.ok, text: r.ok ? `Ολοκληρώθηκε: ${r.message}` : `Απέτυχε: ${r.message}` } : { ok: false, text: r.message });
  });
  const toggle = () => start(async () => { await toggleScheduledJob(job.key, !job.enabled); setResult({ ok: true, text: job.enabled ? "Η εργασία μπήκε σε παύση." : "Η εργασία ενεργοποιήθηκε." }); });
  const last = result ?? (job.lastMessage ? { ok: !!job.lastOk, text: job.lastMessage } : null);
  return (
    <article data-help="sync.job" className={`rounded-2xl border p-4 grid gap-2 min-w-0 ${job.enabled ? "bg-white border-eu-line" : "bg-eu-surface border-dashed border-eu-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">{job.label}</h4>
        {job.running || pending ? <span className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] shrink-0"><Loader2 className="size-3.5 animate-spin" aria-hidden /> τρέχει</span>
          : !job.enabled ? <span className="text-eu-muted font-bold text-[length:var(--fs-13)] shrink-0">σε παύση</span> : null}
      </div>
      <div className="text-eu-ink-3 text-[length:var(--fs-13)] inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {job.when}</span>
        {job.enabled && active && <span>επόμενη: {job.next}</span>}
        <span>{job.runs} εκτελέσεις{job.fails ? ` · ${job.fails} με σφάλμα` : ""}</span>
      </div>
      {last ? (
        <div role="status" className={`rounded-xl px-3 py-2 text-[length:var(--fs-13)] flex gap-2 ${last.ok ? "bg-eu-green/10 text-eu-ink" : "bg-eu-red/10 text-eu-ink"}`}>
          {last.ok ? <Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <X className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />}
          <span className="min-w-0 break-words">{!result && job.lastAt ? <b>{job.lastAt}: </b> : null}{last.text}</span>
        </div>
      ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Δεν έχει τρέξει ακόμη.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={run} disabled={pending || job.running} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-3 min-h-11 hover:bg-eu-blue disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Τρέξε τώρα
        </button>
        <button type="button" onClick={toggle} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 min-h-11 hover:bg-eu-chip disabled:opacity-60">
          {job.enabled ? <><Pause className="size-4" aria-hidden /> Παύση</> : <><Play className="size-4" aria-hidden /> Ενεργοποίηση</>}
        </button>
      </div>
    </article>
  );
}
