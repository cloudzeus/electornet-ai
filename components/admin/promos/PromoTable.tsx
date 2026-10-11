"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pause, Play, Square, Copy, Archive, Check, X, Lock, TicketPercent, LayoutTemplate, Megaphone, PanelsTopLeft } from "lucide-react";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { approveAction, bulkAction } from "@/app/admin/(shell)/prosfores/actions";

export interface PromoRowDTO {
  id: string; code: string; name: string; status: PromoStatus; mechanism: string; held: boolean; summary: string;
  startsAt: string | null; endsAt: string | null; usedCount: number; maxUses: number | null; spent: number; budget: number | null;
  targets: number; coupon: string | null; coupons: number; version: number; stacking: string; priority: number;
  /** αλλαγή σε ζωντανή προσφορά που περιμένει έγκριση */
  pendingChange: boolean;
  /** απόδοση 30 ημερών */
  perf: { orders: number; discount: number };
  /** πού εμφανίζεται ρητά (ζώνες, landing pages, banners) — βλ. lib/promo/where.ts */
  appears: { kind: "zone" | "landing" | "ad"; place: string; what: string; live: boolean; href: string }[];
}
const KIND_ICON = { zone: PanelsTopLeft, landing: LayoutTemplate, ad: Megaphone } as const;

/** Πού εμφανίζεται: εικονίδιο ανά σημείο, πράσινη κουκκίδα όταν φαίνεται τώρα· τα αυτόματα (κάρτες, /prosfores) πάντα. */
function Appears({ list }: { list: PromoRowDTO["appears"] }) {
  if (!list.length) return <span className="text-eu-muted text-[length:var(--fs-13)]">Κάρτες & σελίδα προσφορών</span>;
  return (
    <ul className="m-0 p-0 list-none grid gap-0.5">
      {list.slice(0, 3).map((a, i) => { const I = KIND_ICON[a.kind]; return (
        <li key={i}><Link href={a.href} title={`${a.what}${a.live ? "" : " — δεν φαίνεται ακόμη"}`} className="inline-flex items-center gap-1.5 text-[length:var(--fs-13)] text-eu-ink-2 hover:text-eu-blue hover:underline max-w-full">
          <I className="size-3.5 shrink-0 text-eu-muted" aria-hidden /><span className="truncate max-w-[14rem]">{a.place}</span><span className={`size-2 shrink-0 rounded-full ${a.live ? "bg-eu-green" : "border-2 border-eu-line-3"}`} aria-hidden /><span className="sr-only">{a.live ? "(φαίνεται)" : "(δεν φαίνεται ακόμη)"}</span>
        </Link></li>
      ); })}
      {list.length > 3 && <li className="text-eu-muted text-[length:var(--fs-13)]">+{list.length - 3} ακόμη</li>}
    </ul>
  );
}

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short" }) : null);
const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;

function Window({ startsAt, endsAt, now }: { startsAt: string | null; endsAt: string | null; now: number }) {
  const a = startsAt ? +new Date(startsAt) : null, b = endsAt ? +new Date(endsAt) : null;
  const pct = a && b ? Math.min(100, Math.max(0, ((now - a) / (b - a)) * 100)) : a && now >= a ? 100 : 0;
  const left = b && b > now ? Math.ceil((b - now) / 86400_000) : null;
  return (
    <div className="grid gap-1 min-w-0">
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
      {/* λίστα-πλέγμα αντί για πίνακα: σε πλατιά οθόνη στήλες, σε στενή συμπαγής κάρτα — χωρίς κενά «ετικέτα … τιμή» */}
      <div data-help="promo.table" className="rounded-2xl border border-eu-line bg-white overflow-hidden">
        <div aria-hidden className="hidden @5xl:grid grid-cols-[2.25rem_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto] gap-x-4 px-3 py-2 text-eu-muted text-[length:var(--fs-12)] font-bold uppercase tracking-wide bg-eu-surface/60">
          <span className="grid place-items-center"><input type="checkbox" aria-label="Επιλογή όλων" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-5 accent-eu-navy" /></span>
          <span>Προσφορά</span><span>Κατάσταση & διάρκεια</span><span>Στο site</span><span className="text-right">30 ημέρες · όρια</span><span className="w-24" />
        </div>
        <label className="@5xl:hidden flex items-center gap-2 px-3 min-h-11 bg-eu-surface/60 text-eu-ink-2 font-bold text-[length:var(--fs-13)]"><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-5 accent-eu-navy" /> Επιλογή όλων ({rows.length})</label>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line">
          {rows.map((r) => {
            const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.draft;
            return (
              <li key={r.id} className={`grid grid-cols-[2.25rem_minmax(0,1fr)] @5xl:grid-cols-[2.25rem_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto] gap-x-4 gap-y-2 px-3 py-3 items-start ${sel.has(r.id) ? "bg-eu-chip/50" : "hover:bg-eu-surface/40"}`}>
                <span className="grid place-items-center pt-0.5 @5xl:row-span-1 row-span-4"><input type="checkbox" aria-label={`Επιλογή: ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-5 accent-eu-navy" /></span>
                <div className="min-w-0 grid gap-0.5">
                  <Link href={`/admin/prosfores/${r.id}`} className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-snug hover:text-eu-blue hover:underline">{r.name}</Link>
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{r.summary}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-muted text-[length:var(--fs-12)]"><span className="font-mono">{r.code} · v{r.version}</span>{r.targets ? <span>{r.targets} στόχοι</span> : null}{r.coupon && <span className="inline-flex items-center gap-1 rounded-md bg-eu-surface px-1.5 py-0.5 font-mono font-bold text-eu-navy"><TicketPercent className="size-3.5" aria-hidden /> {r.coupon}{r.coupons > 1 ? ` +${r.coupons - 1}` : ""}</span>}</span>
                </div>
                <div className="min-w-0 grid gap-1.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] whitespace-nowrap ${st.tone}`}>{r.held && <Lock className="size-3.5" aria-hidden />}{r.held ? "Ανενεργή (διευκρίνιση)" : st.label}</span>
                    {r.pendingChange && <span className="text-eu-amber font-bold text-[length:var(--fs-12)]">αλλαγή για έγκριση</span>}
                  </span>
                  <Window startsAt={r.startsAt} endsAt={r.endsAt} now={now} />
                </div>
                <div className="min-w-0"><span className="@5xl:hidden block text-eu-muted text-[length:var(--fs-12)] font-bold">Στο site</span><Appears list={r.appears} /></div>
                <div className="min-w-0 @5xl:text-right tabular-nums text-[length:var(--fs-13)] flex flex-wrap gap-x-4 @5xl:grid @5xl:gap-0.5">
                  <span>{r.perf.orders ? <><b className="text-eu-ink">{r.perf.orders.toLocaleString("el-GR")}</b> παραγγ. · −{eur(r.perf.discount)}</> : <span className="text-eu-muted">καμία χρήση 30 ημ.</span>}</span>
                  <span className="text-eu-ink-3">{r.usedCount.toLocaleString("el-GR")}{r.maxUses ? ` / ${r.maxUses.toLocaleString("el-GR")}` : ""} χρήσεις</span>
                  {r.budget ? <span className="grid gap-1 min-w-[8rem]"><span className="text-eu-ink-3">{eur(r.spent)} / {eur(r.budget)}</span><span className="h-1.5 rounded-full bg-eu-surface overflow-hidden" aria-hidden><span className={`block h-full rounded-full ${r.spent / r.budget > 0.9 ? "bg-eu-red" : "bg-eu-green"}`} style={{ width: `${Math.min(100, (r.spent / r.budget) * 100)}%` }} /></span></span> : null}
                </div>
                <div className="col-start-2 @5xl:col-start-auto flex @5xl:justify-end w-full @5xl:w-24">
                  {(r.status === "pending" || r.pendingChange) && canApprove && (
                    <button type="button" disabled={busy} onClick={() => approve(r.id)} className="inline-flex items-center gap-1 rounded-full bg-eu-green text-white px-3 min-h-10 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><Check className="size-4" aria-hidden /> Έγκριση</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
