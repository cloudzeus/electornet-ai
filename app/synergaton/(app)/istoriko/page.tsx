import Link from "next/link";
import { Activity, Check, History, RefreshCw, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { partnerLogs } from "@/lib/partner-portal/data";
import { connTypeInfo } from "@/lib/partner-portal/connection-types";
import { engine, engineConfigured } from "@/lib/b2b-engine/client";
import { BarChart } from "@/components/admin/charts/Charts";
import { LOG_KIND } from "@/components/synergaton/log-kinds";
import { Badge, Callout, Card, CardHead, Empty, fmtDateTime, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Ιστορικό" };
const SOURCE = { push: "Αποστολή από το σύστημά σας", upload: "Ανέβασμα αρχείου", pull: "Αυτόματη ανάγνωση" } as const;
const BATCH = { processed: ["good", "Ολοκληρώθηκε"], failed: ["bad", "Απέτυχε"], received: ["info", "Σε επεξεργασία"] } as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; c?: string; kind?: string; ok?: string; before?: string }> }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const sp = await searchParams;
  const conns = await db.partnerConnection.findMany({ where: { partnerId: u.partner.id }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, label: true } });
  const tab = sp.tab === "activity" || (!sp.tab && !sp.c && !conns.length) ? "activity" : "sync";
  const href = (o: Record<string, string>) => { const p = new URLSearchParams({ tab, ...(sp.c ? { c: sp.c } : {}), ...(sp.kind ? { kind: sp.kind } : {}), ...(sp.ok ? { ok: sp.ok } : {}), ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); return `${base}/istoriko?${p}`; };
  const tabCls = (on: boolean) => `inline-flex items-center gap-2 min-h-11 px-4 rounded-full font-bold text-[length:var(--fs-14)] ${on ? "bg-eu-navy text-white" : "text-eu-ink hover:bg-eu-chip"}`;
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-11 text-[length:var(--fs-13)] font-bold border-2 ${on ? "bg-eu-navy border-eu-navy text-white" : "border-eu-line text-eu-ink hover:border-eu-navy bg-white"}`;

  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Καταγραφή" title="Ιστορικό" sub="Κάθε συγχρονισμός αποθέματος από τη μηχανή και κάθε ενέργεια στην πύλη (έλεγχοι, αντιστοιχίσεις, συνδέσεις χρηστών)." />
      <nav aria-label="Προβολή" className="flex flex-wrap gap-1 rounded-full bg-eu-surface p-1 w-fit" data-help="portal.history-tabs">
        <Link href={href({ tab: "sync", kind: "", ok: "", before: "" })} aria-current={tab === "sync" ? "page" : undefined} className={tabCls(tab === "sync")}><RefreshCw className="size-4" aria-hidden /> Συγχρονισμοί</Link>
        <Link href={href({ tab: "activity", before: "" })} aria-current={tab === "activity" ? "page" : undefined} className={tabCls(tab === "activity")}><Activity className="size-4" aria-hidden /> Δραστηριότητα</Link>
      </nav>
      {tab === "sync" ? <SyncTab conns={conns} c={sp.c} before={sp.before} href={href} chip={chip} base={base} /> : <ActivityTab partnerId={u.partner.id} kind={sp.kind} ok={sp.ok} before={sp.before} href={href} chip={chip} />}
    </div>
  );
}

async function SyncTab({ conns, c, before, href, chip, base }: { conns: { id: string; type: string; label: string | null }[]; c?: string; before?: string; href: (o: Record<string, string>) => string; chip: (on: boolean) => string; base: string }) {
  if (!conns.length) return <Card><Empty icon={RefreshCw} title="Δεν υπάρχει σύνδεση ακόμη"><Link className="text-eu-blue font-bold hover:underline" href={`${base}/syndesi/nea`}>Δημιουργήστε μία</Link> για να ξεκινήσουν οι συγχρονισμοί.</Empty></Card>;
  if (!engineConfigured()) return <Callout tone="warn">Η μηχανή αποθέματος δεν είναι ρυθμισμένη σε αυτό το περιβάλλον.</Callout>;
  const sel = conns.find((x) => x.id === c) ?? conns[0];
  const r = await engine.batches(sel.id, 50, before);
  return (
    <div className="grid gap-4" data-help="portal.history-sync">
      {conns.length > 1 && <nav aria-label="Σύνδεση" className="flex flex-wrap gap-2">{conns.map((x) => <Link key={x.id} href={href({ c: x.id, before: "" })} className={chip(x.id === sel.id)}>{x.label ?? connTypeInfo(x.type)?.title}</Link>)}</nav>}
      {!r.ok ? <Callout tone={r.status === 404 ? "info" : "bad"} title={r.status === 404 ? "Η μηχανή δεν έχει ακόμη αυτή τη σύνδεση" : "Το ιστορικό δεν φορτώθηκε"}>{r.status === 404 ? "Αποθηκεύστε τα στοιχεία της σύνδεσης για να τη στείλουμε στη μηχανή." : r.error}</Callout> : (
        <>
          <Card>
            <CardHead icon={History} title="Γραμμές ανά ημέρα · 30 ημέρες" sub={`${r.data.days.reduce((n, d) => n + d.batches, 0)} συγχρονισμοί · ${r.data.days.reduce((n, d) => n + d.failed, 0)} αποτυχίες`} />
            <div className="p-4 sm:p-5">{r.data.days.some((d) => d.batches) ? <BarChart labels={r.data.days.map((d) => new Date(d.day).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }))} series={[{ key: "a", label: "Δεκτές", values: r.data.days.map((d) => d.accepted) }, { key: "r", label: "Απορρίφθηκαν", values: r.data.days.map((d) => d.rejected), color: "#E63422" }]} height={180} /> : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένας συγχρονισμός τον τελευταίο μήνα.</p>}</div>
          </Card>
          {r.data.batches.length ? (
            <ol className="m-0 p-0 list-none grid gap-2">
              {r.data.batches.map((b) => {
                const [tone, label] = BATCH[b.status as keyof typeof BATCH] ?? ["neutral", b.status];
                const pct = b.accepted + b.rejected ? Math.round((b.accepted / (b.accepted + b.rejected)) * 100) : 0;
                return (
                  <li key={b.id} className={`rounded-2xl border bg-white p-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${b.status === "failed" ? "border-[#f0b8b2]" : "border-eu-line"}`}>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><b className="text-[length:var(--fs-15)]">{fmtDateTime(b.receivedAt)}</b><Badge tone={tone}>{label}</Badge></span>
                      <span className="block text-eu-ink-3 text-[length:var(--fs-13)]">{SOURCE[b.source]} · {b.mode === "full" ? "όλο το απόθεμα" : "μόνο αλλαγές"} · {(b.bytes / 1024).toFixed(0)} KB</span>
                      {b.error && <span className="block text-[#b3261e] text-[length:var(--fs-13)] break-words">{b.error}</span>}
                    </span>
                    <span className="grid gap-0.5 sm:text-right text-[length:var(--fs-14)] tabular-nums">
                      <span><b>{b.accepted.toLocaleString("el-GR")}</b> δεκτές{b.rejected > 0 && <span className="text-[#b3261e]"> · {b.rejected.toLocaleString("el-GR")} απορρίφθηκαν</span>}</span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{pct}% επιτυχία</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : <Card><Empty icon={RefreshCw} title="Κανένας συγχρονισμός ακόμη">Μόλις η σύνδεση στείλει απόθεμα, κάθε ενημέρωση φαίνεται εδώ με τις δεκτές και τις απορριφθείσες γραμμές.</Empty></Card>}
          {r.data.next && <Link href={href({ c: sel.id, before: r.data.next })} className="justify-self-center min-h-11 px-5 inline-flex items-center rounded-full border-2 border-eu-line font-bold hover:border-eu-navy text-[length:var(--fs-14)]">Παλαιότεροι</Link>}
        </>
      )}
    </div>
  );
}

async function ActivityTab({ partnerId, kind, ok, before, href, chip }: { partnerId: string; kind?: string; ok?: string; before?: string; href: (o: Record<string, string>) => string; chip: (on: boolean) => string }) {
  const d = await partnerLogs(partnerId, { kind, ok, before });
  return (
    <div className="grid gap-4" data-help="portal.history-activity">
      <nav aria-label="Είδος" className="flex flex-wrap gap-2">
        <Link href={href({ kind: "", before: "" })} className={chip(!kind)}>Όλα</Link>
        {Object.entries(d.kinds).map(([k, n]) => { const I = LOG_KIND[k]?.icon; return <Link key={k} href={href({ kind: k, before: "" })} className={chip(kind === k)}>{I && <I className="size-4" aria-hidden />}{LOG_KIND[k]?.label ?? k}<span className="tabular-nums opacity-70">{n}</span></Link>; })}
        <Link href={href({ ok: ok === "0" ? "" : "0", before: "" })} className={chip(ok === "0")}><X className="size-4" aria-hidden /> Μόνο αποτυχίες</Link>
      </nav>
      {d.rows.length ? (
        <ol className="m-0 p-0 list-none relative grid gap-0 before:absolute before:left-[1.1rem] before:top-2 before:bottom-2 before:w-px before:bg-eu-line">
          {d.rows.map((l) => {
            const I = LOG_KIND[l.kind]?.icon ?? Activity;
            return (
              <li key={l.id} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-2">
                <span className={`relative z-10 grid place-items-center size-9 rounded-full border-2 ${l.ok ? "bg-white border-eu-line text-eu-navy" : "bg-[#fdecea] border-[#f0b8b2] text-[#b3261e]"}`}><I className="size-4" aria-hidden /></span>
                <div className="min-w-0 rounded-xl bg-white border border-eu-line px-3.5 py-2.5">
                  <p className="m-0 text-[length:var(--fs-14)] break-words">{l.ok ? <Check className="inline size-4 text-eu-green mr-1" aria-label="επιτυχία" /> : <X className="inline size-4 text-[#b3261e] mr-1" aria-label="αποτυχία" />}{l.message}</p>
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{fmtDateTime(l.createdAt)} · {LOG_KIND[l.kind]?.label ?? l.kind}{l.connection ? ` · ${l.connection.label ?? connTypeInfo(l.connection.type)?.title}` : ""}{l.ms ? ` · ${(l.ms / 1000).toFixed(1)}″` : ""}{l.staffId ? " · από την Euronics" : ""}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <Card><Empty icon={Activity} title="Καμία καταγραφή">Δεν υπάρχουν εγγραφές με αυτά τα φίλτρα.</Empty></Card>}
      {d.next && <Link href={href({ before: d.next })} className="justify-self-center min-h-11 px-5 inline-flex items-center rounded-full border-2 border-eu-line font-bold hover:border-eu-navy text-[length:var(--fs-14)]">Παλαιότερα</Link>}
    </div>
  );
}
