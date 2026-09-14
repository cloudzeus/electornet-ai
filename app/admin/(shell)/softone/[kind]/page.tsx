import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { lookupByKind, lookupRows } from "@/lib/softone/lookups";
import { logoStats } from "@/lib/brandfetch/brands";
import { db } from "@/lib/db";
import { SyncButton, FindLogosButton } from "../SyncButtons";
import { RowsTable } from "./RowsTable";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) { const { kind } = await params; return { title: `${lookupByKind(kind)?.plural ?? "SoftOne"} · SoftOne` }; }

type SP = { q?: string; page?: string; missing?: string };

export default async function LookupPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<SP> }) {
  await requirePermission("settings.integrations.write");
  const [{ kind }, sp] = await Promise.all([params, searchParams]);
  const def = lookupByKind(kind);
  if (!def) notFound();
  const q = sp.q?.trim() ?? "";
  const missing = sp.missing === "1";
  const [{ rows, total, page, pages }, runs, logos] = await Promise.all([
    lookupRows(kind, { q, page: Number(sp.page) || 1, missing }),
    db.s1SyncRun.findMany({ where: { kind }, orderBy: { at: "desc" }, take: 4 }),
    kind === "brand" ? logoStats() : Promise.resolve(null),
  ]);
  const plain = JSON.parse(JSON.stringify(rows)) as Parameters<typeof RowsTable>[0]["rows"];
  const href = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(missing ? { missing: "1" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <div className="grid gap-4 min-w-0">
      <Link href="/admin/softone" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> SoftOne · πίνακες</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">SoftOne <span className="font-mono normal-case">{def.table}</span>{def.filter ? <span className="font-mono normal-case text-eu-muted"> · {def.filter}</span> : null}</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">{def.plural}</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">{def.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><SyncButton kind={kind} />{logos && <FindLogosButton pending={logos.pending} />}</div>
      </div>
      {logos && <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] text-eu-ink-3">Λογότυπα: <b className="text-eu-ink">{logos.withDomain}</b> από Brandfetch (σύνδεσμος, όχι αρχείο — οι όροι τους δεν επιτρέπουν αποθήκευση), <b className="text-eu-ink">{logos.withUpload}</b> δικά μας αρχεία στο CDN, <b className="text-eu-ink">{logos.suggested}</b> προτάσεις προς έγκριση, <b className="text-eu-ink">{logos.pending}</b> δεν έχουν ελεγχθεί ακόμη.</p>}
      {runs.length > 0 && <div className="flex flex-wrap gap-2 text-[length:var(--fs-13)] text-eu-muted">{runs.map((r) => <span key={r.id} className={`rounded-full px-2.5 py-1 ${r.ok ? "bg-eu-surface" : "bg-eu-red/10 text-eu-red"}`}>{r.at.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: {r.ok ? `${r.fetched} γρ., +${r.created}, ~${r.updated}${r.missing ? `, ${r.missing} λείπουν` : ""}${r.skipped ? `, ${r.skipped} αγνοήθηκαν` : ""}` : r.error}</span>)}</div>}

      <form className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[240px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Αναζήτηση σε κωδικό, όνομα, όνομα SoftOne…" aria-label="Αναζήτηση" className="w-full rounded-full border border-eu-line pl-9 pr-3 min-h-10 text-[length:var(--fs-14)]" />
        </label>
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] text-eu-ink"><input type="checkbox" name="missing" value="1" defaultChecked={missing} className="size-4 accent-eu-navy" /> Μόνο όσα λείπουν από το SoftOne</label>
        <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-blue">Αναζήτηση</button>
        {(q || missing) && <Link href="?" className="rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-9 inline-flex items-center">Καθαρισμός</Link>}
        <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{total.toLocaleString("el-GR")} εγγραφές</span>
      </form>

      {/* key: το RowsTable κρατά τις γραμμές σε state (για inline edit). Χωρίς
          remount σε αλλαγή σελίδας/αναζήτησης το state θα έμενε στην παλιά σελίδα. */}
      <RowsTable key={`${kind}:${page}:${q}:${missing}`} kind={kind} rows={plain} editable={def.editable} columns={def.columns ?? []} />

      {pages > 1 && (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Σελίδες">
          <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} className={`inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${page <= 1 ? "opacity-40 pointer-events-none" : "hover:border-eu-blue"}`}><ChevronLeft className="size-4" aria-hidden /> Προηγούμενη</Link>
          <span className="text-eu-ink-3 text-[length:var(--fs-14)] tabular-nums">Σελίδα {page} από {pages}</span>
          <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages} className={`inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${page >= pages ? "opacity-40 pointer-events-none" : "hover:border-eu-blue"}`}>Επόμενη <ChevronRight className="size-4" aria-hidden /></Link>
        </nav>
      )}
      {rows.length === 0 && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-3 text-[length:var(--fs-14)] inline-flex items-center gap-2"><AlertTriangle className="size-4" aria-hidden /> {q || missing ? "Καμία εγγραφή με αυτά τα κριτήρια." : "Καμία εγγραφή. Πάτα «Συγχρονισμός» για να διαβαστούν από το SoftOne."}</p>}
    </div>
  );
}
