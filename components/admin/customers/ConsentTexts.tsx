"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, FilePlus2, RefreshCw } from "lucide-react";
import { publishConsentText } from "@/app/admin/(shell)/gdpr/actions";

export type TextVersion = { id: string; version: string; title: string; text: string; hash: string; effectiveFrom: string; count: number; state: "inforce" | "scheduled" | "old" };
export type TextGroup = { key: string; where: string; auto: boolean; versions: TextVersion[] };
type Form = { key: string; title: string; text: string; version: string; effectiveFrom: string };

const d = (s: string) => new Date(s).toLocaleDateString("el-GR");
const n = (c: number) => (c === 1 ? "1 συναίνεση" : `${c.toLocaleString("el-GR")} συναινέσεις`);
const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full aria-[invalid=true]:border-eu-red";
const lab = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)] content-start";
const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50";
const btn2 = "inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-line px-3.5 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50";
const STATE = { inforce: ["σε ισχύ", "bg-eu-green/10 text-eu-green"], scheduled: ["προγραμματισμένη", "bg-eu-yellow/40 text-eu-navy"], old: ["παλιά", "bg-eu-surface text-eu-muted"] } as const;

function FieldError({ err, f }: { err: { field: string; error: string } | null; f: string }) {
  return err?.field === f ? <span role="alert" className="font-normal text-eu-red text-[length:var(--fs-13)]">{err.error}</span> : null;
}

/** Κείμενα συναίνεσης: η έκδοση σε ισχύ ανά κείμενο, το ιστορικό της και η δημοσίευση νέας έκδοσης. */
export function ConsentTexts({ groups, canWrite, today }: { groups: TextGroup[]; canWrite: boolean; today: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<{ field: string; error: string } | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setErr(null); };
  const publish = (cur: TextVersion | undefined) => form && start(async () => {
    // πριν την επιβεβαίωση: τίποτα δεν δημοσιεύεται αν το κείμενο δεν άλλαξε
    if (cur && form.text.trim() === cur.text) { setErr({ field: "text", error: "Το κείμενο είναι ίδιο με την έκδοση που ισχύει. Άλλαξέ το ή πάτα «Άκυρο»." }); document.getElementById("ct-text")?.focus(); return; }
    if (!window.confirm(`Δημοσίευση της έκδοσης ${form.version} για «${form.title}»; Μια έκδοση δεν αλλάζει ούτε σβήνεται μετά. Για διόρθωση βγάζεις νέα έκδοση.`)) return;
    const r = await publishConsentText(form);
    if (!r.ok) { setErr(r); document.getElementById(`ct-${r.field}`)?.focus(); return; }
    setMsg({ key: form.key, text: r.now ? `Η έκδοση ${form.version} ισχύει από τώρα.${cur ? ` Οι συναινέσεις της ${cur.version} μένουν δεμένες με το δικό της κείμενο.` : ""}` : `Η έκδοση ${form.version} θα ισχύσει στις ${d(form.effectiveFrom)}.` });
    setForm(null);
  });
  return (
    <div data-help="gdpr.texts" className="grid gap-3 min-w-0">
      {groups.map((g) => { const cur = g.versions.find((v) => v.state === "inforce"); const next = g.versions.find((v) => v.state === "scheduled"); const editing = form?.key === g.key; const total = g.versions.reduce((a, v) => a + v.count, 0); return (
        <section key={g.key} className={`rounded-2xl bg-white border p-4 grid gap-2.5 min-w-0 ${editing ? "border-eu-blue border-2" : "border-eu-line"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{cur?.title ?? g.versions[0].title}</h3>
              <div className="text-eu-muted text-[length:var(--fs-14)]">{cur ? <><span className={`inline-block rounded-full px-2.5 py-0.5 mr-1.5 font-bold text-[length:var(--fs-13)] ${STATE.inforce[1]}`}>σε ισχύ</span>έκδοση {cur.version} · από {d(cur.effectiveFrom)} · {n(cur.count)}</> : <span className="text-eu-red font-bold">Καμία έκδοση σε ισχύ</span>}</div>
            </div>
            {canWrite && !editing && <button type="button" data-help="gdpr.text-new" onClick={() => { const base = today.slice(0, 7); setForm({ key: g.key, title: cur?.title ?? g.versions[0].title, text: cur?.text ?? "", version: g.versions.some((v) => v.version === base) ? `${base}-b` : base, effectiveFrom: today }); setErr(null); setMsg(null); }} className={btn2}><FilePlus2 className="size-4" aria-hidden /> Νέα έκδοση</button>}
          </div>
          {msg?.key === g.key && <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-14)] px-3 py-2 flex items-center gap-2"><Check className="size-4 shrink-0" aria-hidden /> {msg.text}</p>}
          {cur && <p className="m-0 text-eu-ink text-[length:var(--fs-15)] max-w-[85ch] whitespace-pre-wrap">{cur.text}</p>}
          {next && <p className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy text-[length:var(--fs-14)] px-3 py-2">Η έκδοση {next.version} ξεκινά στις {d(next.effectiveFrom)} και αντικαθιστά τη σημερινή.</p>}
          <p className={`m-0 flex items-start gap-2 text-[length:var(--fs-14)] ${g.auto ? "text-eu-ink-3" : "text-eu-amber"}`}>{g.auto ? <RefreshCw className="size-4 mt-0.5 shrink-0" aria-hidden /> : <CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />}<span><b>Πού το βλέπει ο πελάτης:</b> {g.where}. {g.auto ? "Η νέα έκδοση εμφανίζεται εκεί μόνη της." : "Η οθόνη δείχνει δικό της κείμενο. Μετά από νέα έκδοση, άλλαξε και εκείνο ώστε να λένε το ίδιο."}</span></p>
          {editing && form && (
            <div className="grid gap-3 border-t border-eu-line-2 pt-3">
              <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">Νέα έκδοση</div>
              <label className={lab}>Κείμενο που θα βλέπει ο πελάτης<textarea id="ct-text" rows={4} value={form.text} aria-invalid={err?.field === "text"} onChange={(e) => set({ text: e.target.value })} className={`${field} py-2`} /><FieldError err={err} f="text" /></label>
              <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
                <label className={lab}>Τίτλος<input id="ct-title" value={form.title} aria-invalid={err?.field === "title"} onChange={(e) => set({ title: e.target.value })} className={field} /><FieldError err={err} f="title" /></label>
                <label className={lab}>Έκδοση<input id="ct-version" value={form.version} aria-invalid={err?.field === "version"} onChange={(e) => set({ version: e.target.value })} className={field} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Συνήθως έτος και μήνας, π.χ. 2026-11</span><FieldError err={err} f="version" /></label>
                <label className={lab}>Ισχύει από<input id="ct-effectiveFrom" type="date" min={today} value={form.effectiveFrom} aria-invalid={err?.field === "effectiveFrom"} onChange={(e) => set({ effectiveFrom: e.target.value })} className={field} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Σήμερα = αμέσως</span><FieldError err={err} f="effectiveFrom" /></label>
              </div>
              <p className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy text-[length:var(--fs-14)] px-3 py-2">{cur ? <>Η έκδοση {cur.version} σταματά να χρησιμοποιείται {form.effectiveFrom === today ? "από τώρα" : `στις ${d(form.effectiveFrom)}`}. {cur.count ? `Οι ${n(cur.count)} της μένουν δεμένες με το δικό της κείμενο και εξακολουθούν να ισχύουν.` : "Δεν έχει συναινέσεις ακόμη."}</> : "Θα είναι η πρώτη έκδοση σε ισχύ."}</p>
              <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => publish(cur)} className={btn}><Check className="size-4" aria-hidden /> {pending ? "Δημοσίευση…" : "Δημοσίευση έκδοσης"}</button><button type="button" onClick={() => setForm(null)} className={btn2}>Άκυρο</button></div>
            </div>
          )}
          <details className="group">
            <summary className="inline-flex items-center min-h-11 cursor-pointer font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline">Ιστορικό εκδόσεων ({g.versions.length}) · {n(total)} συνολικά</summary>
            <ul className="m-0 p-0 list-none grid gap-2">
              {g.versions.map((v) => (
                <li key={v.id} className="rounded-xl bg-eu-surface p-3 grid gap-1 text-[length:var(--fs-14)]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="text-eu-ink">Έκδοση {v.version}</b><span className={`rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] ${STATE[v.state][1]}`}>{STATE[v.state][0]}</span><span className="text-eu-muted">από {d(v.effectiveFrom)} · {n(v.count)}</span></div>
                  <div className="text-eu-ink-2 whitespace-pre-wrap">{v.text}</div>
                  <div className="text-eu-muted font-mono text-[length:var(--fs-13)] break-all">sha256 {v.hash}</div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ); })}
    </div>
  );
}
