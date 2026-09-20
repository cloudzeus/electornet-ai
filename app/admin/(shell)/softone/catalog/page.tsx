import { Package, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { catalogStats } from "@/lib/softone/catalog";
import { vectorStats } from "@/lib/vector/index";
import { Pagination } from "@/components/admin/Pagination";
import { CatalogTools } from "./CatalogTools";

export const metadata = { title: "SoftOne · Κατάλογος & CCC" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const KIND: Record<string, string> = { "cat-webcat": "Κατηγορίες site", "cat-specs": "Ορισμοί χαρακτηριστικών", "cat-items": "Είδη (αλλαγές)", "cat-items-full": "Είδη (πλήρης)" };

/**
 * Καθρέφτης του καταλόγου του SoftOne: κατηγορίες site, τύποι προϊόντος με τα
 * χαρακτηριστικά τους, και τα είδη που ανήκουν στο site. Από εδώ χτίζεται και
 * το διανυσματικό ευρετήριο που χρησιμοποιεί ο Ερμής.
 */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  await requirePermission("catalog.products.read");
  const { q = "", f = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where = {
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }, { factoryCode: { contains: q, mode: "insensitive" as const } }, { barcode: { contains: q } }] } : {}),
    ...(f === "nodesc" ? { shortDesc: null, longDesc: null } : f === "nodims" ? { OR: [{ widthCm: null }, { heightCm: null }, { lengthCm: null }] } : f === "nogroup" ? { specGroupS1Id: null } : f === "nobrand" ? { manufacturerS1Id: null } : f === "missing" ? { missing: true } : f === "inactive" ? { active: false } : {}),
  };
  const [stats, vec, rows, total] = await Promise.all([
    catalogStats(), vectorStats(),
    db.s1Item.findMany({ where, orderBy: { s1UpdatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { specGroup: { select: { name: true } } } }),
    db.s1Item.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ q, f, page: String(n) })}`;
  const pct = (n: number) => (stats.items ? `${Math.round((n / stats.items) * 100)}%` : "—");
  const state = (k: string) => stats.states.find((s) => s.kind === k);

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Package className="size-3.5" aria-hidden /> SoftOne ERP</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Κατάλογος & CCC</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[84ch]">Καθρέφτης μόνο ανάγνωσης: κατηγορίες site (<span className="font-mono">CCCWEBCATEGORY1/2</span>), τύποι προϊόντος με τα χαρακτηριστικά και τα φίλτρα τους (<span className="font-mono">CCCWEBGRSPECS → CCCWEBSPECS → CCCWEBSPECSLNS</span>) και τα είδη που ανήκουν στο site (<span className="font-mono">MTRL</span>). Οι τιμές χαρακτηριστικών ανά είδος, οι φωτογραφίες, η τιμή του site και το απόθεμα ανά κατάστημα δεν εκτίθενται από το ERP και μένουν ανοιχτά.</p>
        </div>
      </div>

      <CatalogTools />

      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        {[
          { t: "Κατηγορίες site", v: `${stats.cat1} + ${stats.cat2}`, s: `Master + Main · τελευταίος ${fmt(state("webcat")?.lastFullAt)}` },
          { t: "Τύποι προϊόντος", v: stats.groups.toLocaleString("el-GR"), s: `${stats.specs.toLocaleString("el-GR")} χαρακτηριστικά · ${stats.filters.toLocaleString("el-GR")} φίλτρα · ${stats.options.toLocaleString("el-GR")} τιμές` },
          { t: "Είδη στον καθρέφτη", v: stats.items.toLocaleString("el-GR"), s: `${stats.active.toLocaleString("el-GR")} ενεργά · ${stats.missing.toLocaleString("el-GR")} λείπουν πια · πλήρης ${fmt(state("item")?.lastFullAt)} · αλλαγές ${fmt(state("item")?.lastDeltaAt)}` },
          { t: "Ευρετήριο για τον Ερμή", v: `${vec.embedded.toLocaleString("el-GR")} / ${vec.total.toLocaleString("el-GR")}`, s: `${vec.stale.toLocaleString("el-GR")} περιμένουν embedding · ${vec.model} · ${fmt(vec.lastAt)}` },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0">
            <div className="text-eu-muted text-[length:var(--fs-13)]">{c.t}</div>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{c.v}</div>
            <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.s}</div>
          </div>
        ))}
      </div>

      {stats.items > 0 && (
        <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] text-eu-ink-3">Πληρότητα δεδομένων: περιγραφή <b className="text-eu-ink">{pct(stats.withDesc)}</b> · διαστάσεις <b className="text-eu-ink">{pct(stats.withDims)}</b> · κείμενο διαθεσιμότητας <b className="text-eu-ink">{pct(stats.withAvail)}</b> · τύπος προϊόντος <b className="text-eu-ink">{pct(stats.withGroup)}</b> · κατασκευαστής <b className="text-eu-ink">{pct(stats.withBrand)}</b>.</p>
      )}

      {stats.runs.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[length:var(--fs-13)] text-eu-muted">
          {stats.runs.map((r) => <span key={r.id} className={`rounded-full px-2.5 py-1 inline-flex items-center gap-1 ${r.ok ? "bg-eu-surface" : "bg-eu-red/10 text-eu-red"}`}>{!r.ok && <AlertTriangle className="size-3.5" aria-hidden />}{fmt(r.at)} · {KIND[r.kind] ?? r.kind}: {r.ok ? `${r.fetched} γρ., +${r.created}, ~${r.updated}${r.missing ? `, ${r.missing} λείπουν` : ""}${r.skipped ? `, ${r.skipped} αγνοήθηκαν` : ""} · ${(r.ms / 1000).toFixed(1)} s` : r.error}</span>)}
        </div>
      )}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Είδη</h3>
          <form className="flex flex-wrap gap-2">
            <select name="f" defaultValue={f} aria-label="Φίλτρο" className="rounded-full border border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] bg-white">
              <option value="">Όλα</option><option value="nodesc">Χωρίς περιγραφή</option><option value="nodims">Χωρίς διαστάσεις</option><option value="nogroup">Χωρίς τύπο προϊόντος</option><option value="nobrand">Χωρίς κατασκευαστή</option><option value="inactive">Ανενεργά</option><option value="missing">Λείπουν πια από το SoftOne</option>
            </select>
            <input name="q" defaultValue={q} placeholder="Κωδικός, όνομα, μοντέλο, barcode…" aria-label="Αναζήτηση" className="rounded-full border border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] min-w-[260px]" />
            <button className="rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)]">Φίλτρο</button>
          </form>
        </div>
        <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
          <table className="w-full text-[length:var(--fs-14)]">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Κωδικός</th><th className="py-2 px-3">Είδος</th><th className="py-2 px-3">Τύπος προϊόντος</th><th className="py-2 px-3 text-right">Λιανική</th><th className="py-2 px-3">Διαστάσεις</th><th className="py-2 px-3">Διαθεσιμότητα</th><th className="py-2 px-3">Αλλαγή στο S1</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mtrl} className={`border-t border-eu-line align-top ${r.missing || !r.active ? "opacity-60" : ""}`}>
                  <td className="py-2 px-3 font-mono whitespace-nowrap">{r.code}<div className="text-eu-muted text-[length:var(--fs-13)]">MTRL {r.mtrl}</div></td>
                  <td className="py-2 px-3"><div className="font-bold text-eu-ink">{r.name}</div><div className="text-eu-muted text-[length:var(--fs-13)]">{[r.factoryCode, r.barcode].filter(Boolean).join(" · ") || "—"}{!r.active ? " · ανενεργό" : ""}{r.missing ? " · λείπει πια" : ""}</div></td>
                  <td className="py-2 px-3 text-eu-ink-3">{r.specGroup?.name ?? "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{r.priceRetail != null ? `${r.priceRetail.toLocaleString("el-GR", { minimumFractionDigits: 2 })} €` : "—"}</td>
                  <td className="py-2 px-3 tabular-nums whitespace-nowrap">{r.widthCm && r.heightCm && r.lengthCm ? `${r.widthCm} × ${r.heightCm} × ${r.lengthCm}` : "—"}</td>
                  <td className="py-2 px-3 text-eu-ink-3">{r.availText ?? "—"}</td>
                  <td className="py-2 px-3 text-eu-ink-3 whitespace-nowrap text-[length:var(--fs-13)]">{fmt(r.s1UpdatedAt)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-eu-muted">{stats.items ? "Κανένα είδος με αυτά τα κριτήρια." : "Ο καθρέφτης είναι άδειος — τρέξε «Συγχρονισμός όλων»."}</td></tr>}
            </tbody>
          </table>
          <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="είδη" href={href} /></div>
        </div>
      </section>
    </div>
  );
}
