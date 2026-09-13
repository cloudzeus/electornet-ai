"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Plus, UserMinus, CheckCircle2 } from "lucide-react";
import { adminUnsubscribe, adminAdd, adminConfirm, exportCsv } from "@/app/admin/(shell)/newsletter/actions";

type Row = { id: string; email: string; firstName: string | null; status: string; source: string; lists: string[]; confirmedAt: string | null; unsubscribedAt: string | null; unsubscribeReason: string | null; createdAt: string; customer: { id: string; name: string } | null; last: { ip: string | null; os: string | null; browser: string | null; method: string; at: string } | null };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR") : "—");

export function NewsletterAdmin({ rows, q, status }: { rows: Row[]; q: string; status: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [add, setAdd] = useState({ email: "", firstName: "", source: "store" });
  const [pending, start] = useTransition();
  const chip = (on: boolean) => `rounded-full px-3 min-h-9 inline-flex items-center font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue bg-white";
  const badge = (s: string) => s === "subscribed" ? "bg-eu-green/10 text-eu-green" : s === "pending" ? "bg-eu-yellow/40 text-eu-navy" : s === "unsubscribed" ? "bg-eu-surface text-eu-muted" : "bg-eu-red/10 text-eu-red";
  return (
    <div className="grid gap-3">
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2 flex-1 min-w-[220px]"><input type="hidden" name="s" value={status} /><input name="q" defaultValue={q} placeholder="Αναζήτηση email…" className="flex-1 rounded-full border-2 border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" /><button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-4 min-h-10 text-[length:var(--fs-14)]">Αναζήτηση</button></form>
        {[["", "Όλοι"], ["subscribed", "Ενεργοί"], ["pending", "Εκκρεμείς"], ["unsubscribed", "Διαγραμμένοι"], ["bounced", "Bounced"]].map(([v, l]) => <Link key={v} href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(v ? { s: v } : {}) })}`} className={chip(status === v)}>{l}</Link>)}
        <button type="button" disabled={pending} onClick={() => start(async () => { const csv = await exportCsv(status); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `newsletter-${status || "all"}.csv`; a.click(); })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Download className="size-4" aria-hidden /> CSV</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await adminAdd(add.email, add.firstName, add.source); setMsg(r.ok ? "Στάλθηκε email επιβεβαίωσης (double opt-in)." : r.error ?? "Σφάλμα"); if (r.ok) setAdd({ email: "", firstName: "", source: "store" }); }); }} className="rounded-2xl bg-white border border-eu-line p-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 font-bold text-[length:var(--fs-14)] flex-1 min-w-[200px]">Email<input type="email" required value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} className={field} /></label>
        <label className="grid gap-1 font-bold text-[length:var(--fs-14)]">Όνομα<input value={add.firstName} onChange={(e) => setAdd({ ...add, firstName: e.target.value })} className={field} /></label>
        <label className="grid gap-1 font-bold text-[length:var(--fs-14)]">Πηγή<select value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} className={field}><option value="store">Κατάστημα</option><option value="phone">Τηλέφωνο</option><option value="event">Εκδήλωση</option><option value="admin">Διαχείριση</option></select></label>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Plus className="size-4" aria-hidden /> Προσθήκη (με επιβεβαίωση)</button>
      </form>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden"><div className="overflow-x-auto"><table className="w-full border-collapse text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="p-3 font-bold">Email</th><th className="p-3 font-bold">Κατάσταση</th><th className="p-3 font-bold">Πηγή</th><th className="p-3 font-bold">Εγγραφή</th><th className="p-3 font-bold">Επιβεβαίωση</th><th className="p-3 font-bold">Τελευταίο αποδεικτικό</th><th className="p-3" /></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-eu-line-2 hover:bg-eu-surface/60">
            <td className="p-3"><div className="font-bold text-eu-ink">{r.email}</div><div className="text-eu-muted text-[length:var(--fs-13)]">{r.firstName ?? ""}{r.customer ? <> · <Link href={`/admin/customers/${r.customer.id}`} className="text-eu-blue hover:underline">{r.customer.name}</Link></> : null}</div></td>
            <td className="p-3"><span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-13)] ${badge(r.status)}`}>{r.status}</span>{r.unsubscribeReason && <div className="text-eu-muted text-[length:var(--fs-13)]">{r.unsubscribeReason}</div>}</td>
            <td className="p-3">{r.source}<div className="text-eu-muted text-[length:var(--fs-13)]">{r.lists.join(", ")}</div></td>
            <td className="p-3 tabular-nums">{dt(r.createdAt)}</td>
            <td className="p-3 tabular-nums">{r.confirmedAt ? dt(r.confirmedAt) : r.unsubscribedAt ? `διαγραφή ${dt(r.unsubscribedAt)}` : "—"}</td>
            <td className="p-3 text-[length:var(--fs-13)]">{r.last ? <>{r.last.method} · <span className="font-mono">{r.last.ip ?? "—"}</span><div className="text-eu-muted">{[r.last.os, r.last.browser].filter(Boolean).join(" · ")}</div></> : "—"}</td>
            <td className="p-3 text-right whitespace-nowrap">
              {r.status === "pending" && <button type="button" disabled={pending} onClick={() => { const n = prompt("Αποδεικτικό (π.χ. «υπογεγραμμένη φόρμα καταστήματος Αθήνας 12/9»)"); if (n) start(async () => { await adminConfirm(r.id, n); setMsg("Επιβεβαιώθηκε με καταγραφή αποδεικτικού."); }); }} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><CheckCircle2 className="size-4" aria-hidden /> Επιβεβαίωση</button>}
              {r.status !== "unsubscribed" && <button type="button" disabled={pending} onClick={() => { const n = prompt("Λόγος διαγραφής"); if (n !== null) start(async () => { await adminUnsubscribe(r.id, n); setMsg("Διαγράφηκε με καταγραφή."); }); }} className="ml-1 inline-flex items-center gap-1 rounded-full px-3 min-h-9 font-bold text-eu-red text-[length:var(--fs-13)] hover:bg-eu-red/10"><UserMinus className="size-4" aria-hidden /> Διαγραφή</button>}
            </td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-eu-muted">Καμία εγγραφή.</td></tr>}
      </tbody></table></div></div>
    </div>
  );
}
