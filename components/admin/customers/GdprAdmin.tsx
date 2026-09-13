"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Check } from "lucide-react";
import { createGdprRequest, updateGdprRequest } from "@/app/admin/(shell)/gdpr/actions";

type Row = { id: string; number: string; email: string; type: string; status: string; channel: string; description: string | null; identityMethod: string | null; identityVerifiedAt: string | null; requestedAt: string; dueAt: string; completedAt: string | null; outcome: string | null; timeline: { at: string; status: string; note?: string; by?: string }[]; customer: { id: string; name: string } | null };
const TYPES: [string, string][] = [["access", "Πρόσβαση (άρ. 15)"], ["portability", "Φορητότητα (άρ. 20)"], ["rectification", "Διόρθωση (άρ. 16)"], ["erasure", "Διαγραφή / λήθη (άρ. 17)"], ["restriction", "Περιορισμός (άρ. 18)"], ["objection", "Εναντίωση (άρ. 21)"], ["withdraw-consent", "Ανάκληση συναίνεσης (άρ. 7.3)"]];
const STATUS: [string, string][] = [["open", "Ανοιχτό"], ["verifying", "Ταυτοποίηση"], ["in-progress", "Σε εξέλιξη"], ["done", "Ολοκληρώθηκε"], ["rejected", "Απορρίφθηκε"]];
const IDM: [string, string][] = [["", "—"], ["login", "Σύνδεση στον λογαριασμό"], ["email-link", "Σύνδεσμος στο email"], ["id-document", "Ταυτότητα / διαβατήριο"], ["in-person", "Δια ζώσης σε κατάστημα"]];
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR") : "—");
const d = (s: string) => new Date(s).toLocaleDateString("el-GR");
const daysLeft = (due: string) => Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);

export function GdprAdmin({ rows }: { rows: Row[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [nr, setNr] = useState<{ email: string; type: string; channel: string; description: string; identityMethod: string } | null>(null);
  const [upd, setUpd] = useState<Record<string, { status: string; note: string; outcome: string; identityMethod: string }>>({});
  const [pending, start] = useTransition();
  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue bg-white w-full";
  const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";
  const btn = "inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50";
  return (
    <div className="grid gap-3">
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      <div className="flex justify-end"><button type="button" onClick={() => setNr({ email: "", type: "access", channel: "email", description: "", identityMethod: "" })} className={btn}><Plus className="size-4" aria-hidden /> Νέο αίτημα</button></div>
      {nr && (
        <div className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <div className="grid grid-cols-1 @2xl:grid-cols-4 gap-3">
            <label className={label}>Email υποκειμένου<input type="email" value={nr.email} onChange={(e) => setNr({ ...nr, email: e.target.value })} className={field} /></label>
            <label className={label}>Είδος<select value={nr.type} onChange={(e) => setNr({ ...nr, type: e.target.value })} className={field}>{TYPES.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label>
            <label className={label}>Κανάλι<select value={nr.channel} onChange={(e) => setNr({ ...nr, channel: e.target.value })} className={field}><option value="email">Email</option><option value="account">Λογαριασμός</option><option value="phone">Τηλέφωνο</option><option value="store">Κατάστημα</option><option value="letter">Επιστολή</option></select></label>
            <label className={label}>Ταυτοποίηση<select value={nr.identityMethod} onChange={(e) => setNr({ ...nr, identityMethod: e.target.value })} className={field}>{IDM.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label>
          </div>
          <label className={label}>Περιγραφή<textarea rows={2} value={nr.description} onChange={(e) => setNr({ ...nr, description: e.target.value })} className={`${field} py-2`} /></label>
          <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => start(async () => { const r = await createGdprRequest(nr); setMsg(r.ok ? "Το αίτημα καταχωρήθηκε με προθεσμία 30 ημερών." : r.error ?? "Σφάλμα"); if (r.ok) setNr(null); })} className={btn}><Check className="size-4" aria-hidden /> Καταχώρηση</button><button type="button" onClick={() => setNr(null)} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)]">Άκυρο</button></div>
        </div>
      )}
      <ul className="m-0 p-0 list-none grid gap-3">
        {rows.map((r) => { const u = upd[r.id] ?? { status: r.status, note: "", outcome: r.outcome ?? "", identityMethod: r.identityMethod ?? "" }; const left = daysLeft(r.dueAt); const closed = ["done", "rejected"].includes(r.status); return (
          <li key={r.id} className={`rounded-2xl bg-white border p-4 grid gap-2 text-[length:var(--fs-14)] ${!closed && left < 0 ? "border-eu-red" : !closed && left <= 5 ? "border-eu-yellow" : "border-eu-line"}`}>
            <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-eu-ink">{r.number}</span><span className="rounded-full bg-eu-surface px-2 font-bold text-[length:var(--fs-13)]">{TYPES.find((t) => t[0] === r.type)?.[1] ?? r.type}</span><span className={`rounded-full px-2 font-bold text-[length:var(--fs-13)] ${closed ? "bg-eu-green/10 text-eu-green" : "bg-eu-yellow/40 text-eu-navy"}`}>{STATUS.find((s) => s[0] === r.status)?.[1] ?? r.status}</span><span className="text-eu-ink-2">{r.email}{r.customer && <> · <Link href={`/admin/customers/${r.customer.id}`} className="text-eu-blue hover:underline">{r.customer.name}</Link></>}</span><span className={`ml-auto font-bold ${closed ? "text-eu-muted" : left < 0 ? "text-eu-red" : left <= 5 ? "text-eu-amber" : "text-eu-ink-2"}`}>{closed ? `ολοκληρώθηκε ${dt(r.completedAt)}` : left < 0 ? `εκπρόθεσμο ${-left} ημ.` : `προθεσμία ${d(r.dueAt)} (${left} ημ.)`}</span></div>
            {r.description && <div className="text-eu-ink-2">{r.description}</div>}
            <div className="text-eu-muted text-[length:var(--fs-13)]">Υποβολή {dt(r.requestedAt)} · {r.channel} · ταυτοποίηση: {IDM.find((i) => i[0] === (r.identityMethod ?? ""))?.[1] ?? "—"}{r.identityVerifiedAt ? ` (${dt(r.identityVerifiedAt)})` : ""}</div>
            {r.timeline.length > 0 && <ul className="m-0 p-0 list-none text-[length:var(--fs-13)] text-eu-muted">{r.timeline.map((x, i) => <li key={i}>{dt(x.at)} · {x.status}{x.note ? ` — ${x.note}` : ""}{x.by ? ` (${x.by})` : ""}</li>)}</ul>}
            {r.outcome && <div className="rounded-lg bg-eu-surface p-2"><b>Έκβαση:</b> {r.outcome}</div>}
            {!closed && (
              <div className="grid grid-cols-1 @2xl:grid-cols-[170px_190px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                <label className={label}>Κατάσταση<select value={u.status} onChange={(e) => setUpd({ ...upd, [r.id]: { ...u, status: e.target.value } })} className={field}>{STATUS.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
                <label className={label}>Ταυτοποίηση<select value={u.identityMethod} onChange={(e) => setUpd({ ...upd, [r.id]: { ...u, identityMethod: e.target.value } })} className={field}>{IDM.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label>
                <label className={label}>Σημείωση ενέργειας<input value={u.note} onChange={(e) => setUpd({ ...upd, [r.id]: { ...u, note: e.target.value } })} className={field} /></label>
                <label className={label}>Έκβαση / τι παραδόθηκε<input value={u.outcome} onChange={(e) => setUpd({ ...upd, [r.id]: { ...u, outcome: e.target.value } })} className={field} /></label>
                <button type="button" disabled={pending} onClick={() => start(async () => { await updateGdprRequest(r.id, u); setMsg("Ενημερώθηκε."); })} className={btn}><Check className="size-4" aria-hidden /> Ενημέρωση</button>
              </div>
            )}
          </li>
        ); })}
        {!rows.length && <li className="rounded-2xl bg-white border border-eu-line p-6 text-eu-muted">Κανένα αίτημα.</li>}
      </ul>
    </div>
  );
}
