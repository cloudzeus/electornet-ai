"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleAlert, Loader2, Search, Upload } from "lucide-react";

type Decision = { row: number; action: "create" | "link" | "merge" | "conflict" | "same" | "skip"; by: string | null; customerId: string | null; otherId: string | null; reason: string; email: string | null; name: string };
type Plan = { kind: "customers" | "newsletter"; total: number; counts: Record<string, number>; by?: Record<string, number>; decisions: Decision[]; warnings: string[] };

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums";
const ACTION: Record<Decision["action"], { l: string; d: string; cls: string }> = {
  create: { l: "Νέοι", d: "δεν υπάρχουν — δημιουργούνται", cls: "bg-eu-green/12 text-eu-ink" },
  link: { l: "Ενώνονται", d: "βρέθηκαν — συμπληρώνονται κενά (email, λογαριασμός nop, διευθύνσεις)", cls: "bg-eu-chip text-eu-navy" },
  merge: { l: "Συγχώνευση", d: "δύο εγγραφές του ίδιου ανθρώπου γίνονται μία", cls: "bg-eu-blue/12 text-eu-navy" },
  conflict: { l: "Για έλεγχο", d: "ενώνονται με το ισχυρότερο κλειδί και σημαδεύονται «έλεγχος-διπλού»", cls: "bg-eu-yellow/30 text-eu-ink" },
  same: { l: "Ήδη μέσα", d: "εισήχθησαν σε προηγούμενη εισαγωγή", cls: "bg-eu-surface text-eu-ink-3" },
  skip: { l: "Παραλείπονται", d: "επισκέπτες χωρίς email, διαχειριστές", cls: "bg-eu-surface text-eu-muted" },
};
const NEWS: Record<string, string> = { active: "ενεργοί → συνδρομητές", inactive: "ανενεργοί → καταγράφονται ως διαγραμμένοι", keepLocal: "έχουν ήδη δική τους επιλογή στο νέο eshop — δεν αλλάζουν", withCustomer: "συνδέονται με πελάτη" };

/** Ανέβασμα εξαγωγής nopCommerce → διασταύρωση → εφαρμογή σε παρτίδες. */
export function NopImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; plan: Plan } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; sum: Record<string, number>; errors: string[]; finished: boolean } | null>(null);
  const [filter, setFilter] = useState<Decision["action"] | "all">("all");

  const check = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setJob(null); setProgress(null);
    try {
      const f = new FormData(); f.set("file", file);
      const r = await fetch("/api/admin/customers/nop-import", { method: "POST", body: f });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Ο έλεγχος απέτυχε.");
      setJob({ id: j.jobId, plan: j.plan }); setFilter(j.plan.counts.conflict ? "conflict" : "all");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!job) return;
    if (!confirm(job.plan.kind === "customers" ? `Εισαγωγή ${job.plan.total.toLocaleString("el-GR")} γραμμών πελατών: νέοι πελάτες, ενώσεις και συγχωνεύσεις όπως στον έλεγχο. Κανένα email δεν στέλνεται. Συνέχεια;` : `Εισαγωγή ${job.plan.total.toLocaleString("el-GR")} συνδρομητών newsletter. Συνέχεια;`)) return;
    setErr(null);
    let offset = progress?.finished ? 0 : progress?.done ?? 0;
    const sum: Record<string, number> = { ...(progress?.sum ?? {}) }; const errors = [...(progress?.errors ?? [])];
    for (;;) {
      const r = await fetch("/api/admin/customers/nop-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: job.id, offset }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(`${j.error ?? "Η εισαγωγή σταμάτησε."} Όσα έγιναν μέχρι εδώ έμειναν — πάτα ξανά «Εφαρμογή» για τα υπόλοιπα.`); break; }
      for (const [k, v] of Object.entries(j.result as Record<string, unknown>)) if (typeof v === "number") sum[k] = (sum[k] ?? 0) + v; else if (Array.isArray(v)) errors.push(...(v as string[]));
      offset = j.next;
      setProgress({ done: j.next, total: j.total, sum: { ...sum }, errors: errors.slice(0, 200), finished: j.done });
      if (j.done) break;
    }
  };
  const p = job?.plan;
  const shown = p?.decisions.filter((d) => filter === "all" || d.action === filter) ?? [];
  const running = !!progress && !progress.finished;

  return (
    <div className="grid gap-4 @container">
      <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3">
        <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setJob(null); setProgress(null); } }}
          className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-eu-line-2 bg-eu-surface/50 p-4 cursor-pointer hover:border-eu-blue">
          <Upload className="size-6 text-eu-blue shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 grid">
            <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-all">{file ? file.name : "Διάλεξε ή σύρε εδώ την εξαγωγή του nopCommerce"}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "Πελάτες: .xlsx ή .xml · Newsletter: .csv ή .txt"}</span>
          </span>
          <input type="file" accept=".xlsx,.xml,.csv,.txt" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setJob(null); setProgress(null); } e.target.value = ""; }} />
        </label>
        <button type="button" onClick={check} disabled={!file || busy || running} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue w-fit`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Διασταύρωση</button>
      </section>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />{err}</p>}

      {p && (
        <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3" aria-labelledby="nop-plan">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="nop-plan" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{p.kind === "customers" ? "Διασταύρωση πελατών" : "Newsletter"}</h3>
            <span className="text-eu-muted text-[length:var(--fs-13)]">{p.total.toLocaleString("el-GR")} γραμμές</span>
          </div>
          {p.warnings.map((w, i) => <p key={i} className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />{w}</p>)}
          {p.kind === "customers" ? (
            <>
              <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
                {(Object.keys(ACTION) as Decision["action"][]).map((a) => (
                  <li key={a}><button type="button" onClick={() => setFilter(a)} className={`w-full text-left rounded-xl border-2 p-3 grid gap-0.5 min-h-11 ${filter === a ? "border-eu-blue" : "border-eu-line hover:border-eu-line-2"}`}>
                    <span className="flex items-center justify-between gap-2"><span className={`${chip} ${ACTION[a].cls}`}>{ACTION[a].l}</span><span className="font-heading font-bold text-eu-ink text-[length:var(--fs-20)] tabular-nums">{(p.counts[a] ?? 0).toLocaleString("el-GR")}</span></span>
                    <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{ACTION[a].d}</span>
                  </button></li>
                ))}
              </ul>
              {p.by && Object.keys(p.by).length > 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ταίριασμα με: {Object.entries(p.by).map(([k, v]) => `${k} ${v.toLocaleString("el-GR")}`).join(" · ")}</p>}
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {shown.slice(0, 200).map((d) => (
                  <li key={d.row} className="rounded-lg border border-eu-line px-3 py-2 grid gap-0.5 min-w-0 text-[length:var(--fs-13)]">
                    <div className="flex flex-wrap items-center gap-2 min-w-0"><span className={`${chip} ${ACTION[d.action].cls}`}>{ACTION[d.action].l}</span><span className="font-bold text-eu-ink break-words min-w-0">{d.name}</span><span className="text-eu-muted break-all">{d.email ?? ""}</span><span className="text-eu-muted">· γραμμή {d.row}{d.by ? ` · με ${d.by}` : ""}</span></div>
                    <div className="text-eu-ink-3">{d.reason}{d.customerId && <> · <Link href={`/admin/customers/${d.customerId}`} target="_blank" className="text-eu-blue hover:underline">πελάτης</Link></>}{d.otherId && <> · <Link href={`/admin/customers/${d.otherId}`} target="_blank" className="text-eu-blue hover:underline">ο άλλος</Link></>}</div>
                  </li>
                ))}
                {!shown.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Καμία γραμμή σε αυτή την ομάδα.</li>}
                {filter !== "conflict" && shown.length >= 40 && <li className="text-eu-muted text-[length:var(--fs-12)]">Δείγμα — οι συγκρούσεις δείχνονται όλες.</li>}
              </ul>
            </>
          ) : (
            <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{Object.entries(p.counts).map(([k, v]) => <li key={k}><strong className="tabular-nums">{v.toLocaleString("el-GR")}</strong> {NEWS[k] ?? k}</li>)}</ul>
          )}
          <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
            <span className="text-[length:var(--fs-14)]">
              {progress ? `${progress.done.toLocaleString("el-GR")}/${progress.total.toLocaleString("el-GR")} · ${Object.entries(progress.sum).filter(([, v]) => v).map(([k, v]) => `${({ created: "νέοι", linked: "ενώθηκαν", merged: "συγχωνεύσεις", conflicts: "για έλεγχο", skipped: "παραλείφθηκαν", subscribed: "συνδρομητές", unsubscribed: "διαγραμμένοι", keptLocal: "έμειναν ως είχαν" } as Record<string, string>)[k] ?? k} ${v.toLocaleString("el-GR")}`).join(" · ")}` : "Τίποτα δεν έχει γραφτεί ακόμη."}
            </span>
            <button type="button" onClick={apply} disabled={running || progress?.finished} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>{running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} {progress?.finished ? "Ολοκληρώθηκε" : "Εφαρμογή"}</button>
          </div>
          {progress && progress.errors.length > 0 && <details className="rounded-lg bg-eu-red/10 px-3 py-2 text-[length:var(--fs-13)]"><summary className="cursor-pointer font-bold min-h-11 inline-flex items-center">{progress.errors.length} σφάλματα</summary><ul className="m-0 pl-4">{progress.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul></details>}
          {progress?.finished && p.kind === "customers" && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Οι νέες διευθύνσεις παίρνουν geodata στο παρασκήνιο. Οι πελάτες με «έλεγχος-διπλού» φαίνονται με αναζήτηση της ετικέτας στη λίστα.</p>}
        </section>
      )}
    </div>
  );
}
