"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pause, Play, Square, Copy, Archive, Check, X, Lock, TicketPercent } from "lucide-react";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { approveAction, bulkAction } from "@/app/admin/(shell)/prosfores/actions";

export interface PromoRowDTO {
  id: string; code: string; name: string; status: PromoStatus; mechanism: string; held: boolean; summary: string;
  startsAt: string | null; endsAt: string | null; usedCount: number; maxUses: number | null; spent: number; budget: number | null;
  targets: number; coupon: string | null; coupons: number; version: number; stacking: string; priority: number;
  /** αλλαγή σε ζωντανή προσφορά που περιμένει έγκριση */
  pendingChange: boolean;
}

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short" }) : null);
const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;

function Window({ startsAt, endsAt, now }: { startsAt: string | null; endsAt: string | null; now: number }) {
  const a = startsAt ? +new Date(startsAt) : null, b = endsAt ? +new Date(endsAt) : null;
  const pct = a && b ? Math.min(100, Math.max(0, ((now - a) / (b - a)) * 100)) : a && now >= a ? 100 : 0;
  const left = b && b > now ? Math.ceil((b - now) / 86400_000) : null;
  return (
    <div className="grid gap-1 min-w-[150px] flex-1">
      <div className="text-eu-ink-2 text-[length:var(--fs-13)] tabular-nums">{d(startsAt) ?? "από τώρα"} → {d(endsAt) ?? "χωρίς λήξη"}</div>
      <div className="h-1.5 rounded-full bg-eu-surface overflow-hidden" aria-hidden><div className="h-full rounded-full bg-eu-blue" style={{ width: `${pct}%` }} /></div>
      {left != null && a != null && a <= now && <div className="text-eu-muted text-[length:var(--fs-13)]">{left === 1 ? "λήγει αύριο" : `${left} ημέρες ακόμη`}</div>}
    </div>
  );
}

/** Ο πίνακας της λίστας με επιλογή γραμμών και μαζικές ενέργειες. */
export function PromoTable({ rows, canApprove, now }: { rows: PromoRowDTO[]; canApprove: boolean; now: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const all = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (action: Parameters<typeof bulkAction>[1], label: string) => start(async () => {
    if (action === "archive" && !confirm(`Αρχειοθέτηση ${sel.size} προσφορών; Σταματούν αμέσως και δεν επανέρχονται (μένουν στις αναφορές).`)) return;
    const r = await bulkAction([...sel], action);
    setMsg(`${label}: ${r.changed} ${r.changed === 1 ? "προσφορά" : "προσφορές"}.`);
    setSel(new Set());
    router.refresh();
  });
  const approve = (id: string) => start(async () => { const r = await approveAction(id); setMsg(r.ok ? "Εγκρίθηκε." : r.error ?? "Δεν εγκρίθηκε."); router.refresh(); });

  return (
    <div className="grid gap-3 min-w-0">
      {sel.size > 0 && (
        <div role="toolbar" aria-label="Μαζικές ενέργειες" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-eu-navy text-white p-2 pl-4 shadow-[var(--shadow-raised)]">
          <span className="font-bold text-[length:var(--fs-14)] mr-2">{sel.size} επιλεγμένες</span>
          {([["pause", "Παύση", Pause], ["resume", "Συνέχεια", Play], ["end", "Λήξη τώρα", Square], ["duplicate", "Αντιγραφή", Copy], ["archive", "Αρχείο", Archive]] as const).map(([a, l, I]) => (
            <button key={a} type="button" disabled={busy} onClick={() => run(a, l)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><I className="size-4" aria-hidden /> {l}</button>
          ))}
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 min-h-11 text-[length:var(--fs-14)] hover:bg-white/10"><X className="size-4" aria-hidden /> Καθαρισμός</button>
        </div>
      )}
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-chip text-eu-navy font-semibold px-4 py-2 text-[length:var(--fs-14)]">{msg}</p>}
      <div className="rounded-2xl border border-eu-line bg-white overflow-hidden">
        <table className="eu-rtable-wide w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]">
            <tr>
              <th className="py-2 px-3 w-10"><input type="checkbox" aria-label="Επιλογή όλων" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-5 accent-eu-navy" /></th>
              <th className="py-2 px-3">Προσφορά</th><th className="py-2 px-3">Κατάσταση</th><th className="py-2 px-3">Διάρκεια</th><th className="py-2 px-3 text-right">Χρήσεις</th><th className="py-2 px-3 text-right">Budget</th><th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.draft;
              return (
                <tr key={r.id} className={`border-t border-eu-line align-top ${sel.has(r.id) ? "bg-eu-chip/50" : ""}`}>
                  <td className="py-3 px-3"><input type="checkbox" aria-label={`Επιλογή: ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-5 accent-eu-navy" /></td>
                  <td className="py-3 px-3">
                    <Link href={`/admin/prosfores/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.name}</Link>
                    <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{r.summary}</div>
                    <div className="text-eu-muted text-[length:var(--fs-13)] font-mono">{r.code} · v{r.version}{r.targets ? ` · ${r.targets} στόχοι` : ""}</div>
                    {r.coupon && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-eu-surface px-2 py-0.5 font-mono font-bold text-eu-navy text-[length:var(--fs-13)]"><TicketPercent className="size-3.5" aria-hidden /> {r.coupon}{r.coupons > 1 ? ` +${r.coupons - 1}` : ""}</div>}
                  </td>
                  <td data-label="Κατάσταση" className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] whitespace-nowrap ${st.tone}`}>{r.held && <Lock className="size-3.5" aria-hidden />}{r.held ? "Ανενεργή (διευκρίνιση)" : st.label}</span>
                    {r.pendingChange && <div className="mt-1 text-eu-amber font-bold text-[length:var(--fs-13)]">αλλαγή αναμένει έγκριση</div>}
                  </td>
                  <td data-label="Διάρκεια" className="py-3 px-3"><Window startsAt={r.startsAt} endsAt={r.endsAt} now={now} /></td>
                  <td data-label="Χρήσεις" className="py-3 px-3 text-right tabular-nums whitespace-nowrap">{r.usedCount.toLocaleString("el-GR")}{r.maxUses ? <span className="text-eu-muted"> / {r.maxUses.toLocaleString("el-GR")}</span> : ""}</td>
                  <td data-label="Budget" className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                    {r.budget ? <><span>{eur(r.spent)}</span><span className="text-eu-muted"> / {eur(r.budget)}</span><div className="mt-1 h-1.5 rounded-full bg-eu-surface overflow-hidden" aria-hidden><div className={`h-full rounded-full ${r.spent / r.budget > 0.9 ? "bg-eu-red" : "bg-eu-green"}`} style={{ width: `${Math.min(100, (r.spent / r.budget) * 100)}%` }} /></div></> : r.spent ? eur(r.spent) : <span className="text-eu-muted">—</span>}
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    {(r.status === "pending" || r.pendingChange) && canApprove && (
                      <button type="button" disabled={busy} onClick={() => approve(r.id)} className="inline-flex items-center gap-1 rounded-full bg-eu-green text-white px-3 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><Check className="size-4" aria-hidden /> Έγκριση</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
