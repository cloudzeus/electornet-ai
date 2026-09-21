import Link from "next/link";
import { Ruler, ArrowLeft, AlertTriangle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { eprelMatchStats } from "@/lib/catalog/eprel-match";
import { EprelMatchButton } from "./EprelMatchButton";

export const metadata = { title: "Διαστάσεις & EPREL" };
export const dynamic = "force-dynamic";

const PAGE = 40;
const VERDICT: Record<string, { label: string; cls: string }> = {
  match: { label: "συμφωνούν", cls: "bg-eu-green/12 text-eu-ink" }, minor: { label: "μικρή απόκλιση", cls: "bg-eu-yellow/30 text-eu-ink" },
  swapped: { label: "λάθος σειρά αξόνων", cls: "bg-eu-red/10 text-eu-red" }, conflict: { label: "σύγκρουση", cls: "bg-eu-red/10 text-eu-red" },
  "erp-only": { label: "μόνο ERP", cls: "bg-eu-surface text-eu-ink-3" }, "eprel-only": { label: "μόνο EPREL", cls: "bg-eu-chip text-eu-ink" },
};
const fmt = (d?: { w: number; h: number; d: number } | null) => (d ? `${d.w} × ${d.h} × ${d.d}` : "—");

/** Διαστάσεις για το AR: τι λέει η περιγραφή του ERP, τι δηλώνει ο κατασκευαστής στο EPREL, και πού διαφωνούν. */
export default async function DimensionsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; page?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { f = "", q = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where: Prisma.ProductWhereInput = {
    source: "softone",
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { modelCode: { contains: q.trim(), mode: "insensitive" } }] } : {}),
    ...(f === "bounds" ? { dimensions: { some: { warning: { not: null } } } } : f === "ambiguous" ? { eprelStatus: "ambiguous" } : f === "none" ? { eprelStatus: "none" } : f ? { dimStatus: f } : { dimStatus: { not: null } }),
  };
  const [stats, rows, total, bounds] = await Promise.all([
    eprelMatchStats(),
    db.product.findMany({ where, orderBy: [{ dimDeltaPct: { sort: "desc", nulls: "last" } }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, modelCode: true, dimStatus: true, dimDeltaPct: true, dimNote: true, eprelStatus: true, category: { select: { name: true } }, dimensions: { select: { source: true, kind: true, w: true, h: true, d: true, rawKey: true, rawValue: true, warning: true } }, energy: { select: { eprelRegistrationNumber: true, class: true } } } }),
    db.product.count({ where }),
    db.productDimension.count({ where: { warning: { not: null } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ f, q, page: String(n) })}`;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("el-GR");
  const d = stats.dim;
  const compared = (d.match ?? 0) + (d.minor ?? 0) + (d.swapped ?? 0) + (d.conflict ?? 0);

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Προϊόντα</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5 w-full"><Ruler className="size-3.5" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Διαστάσεις & EPREL</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[86ch]">Για το AR και το «χωράει στον χώρο μου» χρειάζονται πλάτος × ύψος × βάθος σε εκατοστά. Η πρώτη πηγή είναι η περιγραφή του ERP (δεκαδικά, με προεξοχές)· η δεύτερη ό,τι δηλώνει ο κατασκευαστής στο EPREL (ακέραια εκατοστά, συχνά χωρίς πόρτα και λαβές). Όπου υπάρχουν και οι δύο, συγκρίνονται: έως 2 εκ. ή 3 % συμφωνούν, έως 6 εκ. ή 10 % είναι μικρή απόκλιση, πάνω από αυτό θέλει ανθρώπινο μάτι.</p>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        {[
          { t: "Με διαστάσεις από το ERP", v: n((d["erp-only"] ?? 0) + compared), s: `${n(bounds)} εκτός τυπικών ορίων για τον τύπο τους`, href: "?f=bounds" },
          { t: "Δεμένα με το EPREL", v: n(stats.matched), s: `από ${n(stats.eligible)} σε ${stats.types} τύπους με ετικέτα · ${n(stats.ambiguous)} αμφίβολα · ${n(stats.none)} δεν βρέθηκαν`, href: "?f=ambiguous" },
          { t: "Συμφωνούν / μικρή απόκλιση", v: `${n(d.match)} / ${n(d.minor)}`, s: `από ${n(compared)} που συγκρίθηκαν`, href: "?f=minor" },
          { t: "Συγκρούσεις", v: n((d.conflict ?? 0) + (d.swapped ?? 0)), s: `${n(d.swapped)} με λάθος σειρά αξόνων · ${n(d["eprel-only"])} μόνο από EPREL`, href: "?f=conflict" },
        ].map((c) => (
          <Link key={c.t} href={c.href} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0 hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">
            <div className="text-eu-muted text-[length:var(--fs-13)]">{c.t}</div>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{c.v}</div>
            <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.s}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Αντιστοίχιση με το EPREL</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[86ch]">Κλειδί είναι το μοντέλο του κατασκευαστή (από το όνομα της φωτογραφίας του παλιού site, τον κωδικό είδους ή τον τίτλο) μαζί με τη μάρκα. Με κάθε αντιστοίχιση αποθηκεύονται ολόκληρη η καταχώριση, η ενεργειακή ετικέτα, τα τεχνικά ως χαρακτηριστικά και οι διαστάσεις. Εκκρεμούν <b className="text-eu-ink">{n(stats.pending)}</b> προϊόντα· για ολόκληρο το πέρασμα: <span className="font-mono text-[length:var(--fs-13)]">scripts/match-eprel.ts</span>.</p>
        {!stats.hasKey && <p className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold px-3 py-2 text-[length:var(--fs-14)] inline-flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" aria-hidden /> Λείπει το EPREL_API_KEY από το .env — χωρίς αυτό το EPREL δεν απαντά.</p>}
        {can(user.permissions, "catalog.sync.run") && <EprelMatchButton disabled={!stats.hasKey} pendingCount={stats.pending} />}
      </section>

      <form className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="dim-q">Αναζήτηση</label>
        <input id="dim-q" name="q" defaultValue={q} placeholder="Τίτλος, κωδικός, μοντέλο…" className="flex-1 min-w-[240px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
        <label className="sr-only" htmlFor="dim-f">Φίλτρο</label>
        <select id="dim-f" name="f" defaultValue={f} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white">
          <option value="">Όλα όσα έχουν διαστάσεις</option><option value="conflict">Συγκρούσεις</option><option value="swapped">Λάθος σειρά αξόνων</option><option value="minor">Μικρή απόκλιση</option><option value="match">Συμφωνούν</option><option value="erp-only">Μόνο ERP</option><option value="eprel-only">Μόνο EPREL</option><option value="bounds">Εκτός τυπικών ορίων</option><option value="ambiguous">EPREL: αμφίβολα</option><option value="none">EPREL: δεν βρέθηκαν</option>
        </select>
        <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Φίλτρο</button>
      </form>

      <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
        <table className="w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Προϊόν</th><th className="py-2 px-3">ERP · Π × Υ × Β (εκ.)</th><th className="py-2 px-3">EPREL · Π × Υ × Β (εκ.)</th><th className="py-2 px-3">Ετυμηγορία</th></tr></thead>
          <tbody>
            {rows.map((r) => { const erp = r.dimensions.find((x) => x.source === "s1-desc"), ep = r.dimensions.find((x) => x.source === "eprel"); const v = VERDICT[r.dimStatus ?? ""]; return (
              <tr key={r.id} className="border-t border-eu-line align-top">
                <td className="py-2 px-3"><Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.title}</Link><div className="text-eu-muted text-[length:var(--fs-13)]">{r.category.name}{r.modelCode ? ` · ${r.modelCode}` : ""}</div></td>
                <td className="py-2 px-3 tabular-nums whitespace-nowrap">{fmt(erp)}{erp && <div className="text-eu-muted text-[length:var(--fs-13)] whitespace-normal max-w-[32ch]">{erp.rawKey}: {erp.rawValue}</div>}{erp?.warning && <div className="text-eu-red text-[length:var(--fs-13)] whitespace-normal max-w-[32ch] font-bold">{erp.warning}</div>}</td>
                <td className="py-2 px-3 tabular-nums whitespace-nowrap">{fmt(ep)}{r.energy?.eprelRegistrationNumber && <div className="text-eu-muted text-[length:var(--fs-13)]">αρ. {r.energy.eprelRegistrationNumber} · κλάση {r.energy.class}</div>}{!ep && r.eprelStatus && r.eprelStatus !== "matched" && <div className="text-eu-muted text-[length:var(--fs-13)]">{r.eprelStatus === "ambiguous" ? "αμφίβολο" : "δεν βρέθηκε"}</div>}</td>
                <td className="py-2 px-3">{v && <span className={`rounded-full px-2.5 py-1 text-[length:var(--fs-13)] font-bold whitespace-nowrap ${v.cls}`}>{v.label}{r.dimDeltaPct != null && r.dimStatus !== "match" ? ` · ${r.dimDeltaPct}%` : ""}</span>}{r.dimNote && <div className="mt-1 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[40ch]">{r.dimNote}</div>}</td>
              </tr>
            ); })}
            {!rows.length && <tr><td colSpan={4} className="p-8 text-center text-eu-muted">Κανένα προϊόν με αυτά τα κριτήρια.</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
      </div>
    </div>
  );
}
