import { Box, LayoutList, ChevronDown, Search, CircleCheck, Ruler, CircleSlash, Smartphone, type LucideIcon } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { getArCategories } from "@/lib/ar/categories";
import { profileFor } from "@/lib/ar/placement";
import { ArCategories, type ArCatNode } from "./ArCategories";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { Pagination } from "@/components/admin/Pagination";
import { ArRow, type ArRowData } from "./ArRow";
import { arRowDataFor } from "@/lib/ar/admin-row";
import { arIndex, arSearchText, type ArIndexRow } from "@/lib/ar/index";

export const metadata = { title: "AR · Δες το στον χώρο σου" };
export const dynamic = "force-dynamic";

const PAGE = 25;

/** Φίλτρα της λίστας: τι βλέπει ο πελάτης και γιατί όχι */
const FILTERS: { v: string; label: string; test: (r: ArIndexRow) => boolean }[] = [
  { v: "", label: "Όλα", test: () => true },
  { v: "on", label: "Με AR", test: (r) => r.on },
  { v: "off", label: "Χωρίς AR", test: (r) => !r.on },
  { v: "bounds", label: "Διαστάσεις εκτός ορίων (κρυφό)", test: (r) => r.code === "bounds" },
  { v: "fixed", label: "Διορθώθηκαν αυτόματα", test: (r) => r.on && r.fixed },
  { v: "tv", label: "Τηλεοράσεις", test: (r) => r.tv },
  { v: "wall", label: "Στον τοίχο", test: (r) => r.on && r.surface === "wall" },
  { v: "none", label: "Μικρές/προσωπικές (χωρίς αυτόματο AR)", test: (r) => r.code === "none" },
  { v: "catoff", label: "Κατηγορία εκτός AR", test: (r) => r.code === "cat-off" },
  { v: "nodims", label: "Χωρίς διαστάσεις προϊόντος", test: (r) => r.code === "no-dims" },
  { v: "custom", label: "Με δικό μας μοντέλο", test: (r) => r.custom },
];

/** Τα πλακίδια-φίλτρα: τι βλέπει ο πελάτης και οι συχνότεροι λόγοι για «όχι» */
const TILES: { v: string; label: string; sub: string; tone: string; Icon: LucideIcon }[] = [
  { v: "on", label: "Με AR", sub: "ο πελάτης το βλέπει", tone: "text-eu-green", Icon: CircleCheck },
  { v: "nodims", label: "Χωρίς διαστάσεις", sub: "συμπλήρωσέ τες για AR", tone: "text-eu-red", Icon: Ruler },
  { v: "none", label: "Μικρές συσκευές", sub: "εκτός AR από προεπιλογή", tone: "text-eu-ink-3", Icon: Smartphone },
  { v: "catoff", label: "Κατηγορία εκτός", sub: "από τις Κατηγορίες", tone: "text-eu-ink-3", Icon: CircleSlash },
];

/**
 * Ποια προϊόντα έχουν «Δες το στον χώρο σου» και με τι: τον όγκο που χτίζει η γεννήτρια από ελεγμένες διαστάσεις +
 * φωτογραφία, ή δικό μας μοντέλο GLB (και προαιρετικά USDZ για iPhone). Όλα τα προϊόντα του καταλόγου, με τον λόγο
 * όταν το AR δεν εμφανίζεται (ίδια απόφαση με τη σελίδα προϊόντος — βλ. arPlan).
 */
export default async function ArAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { q = "", f = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const index = await arIndex();
  const nq = arSearchText(q.trim());
  const filter = FILTERS.find((x) => x.v === f) ?? FILTERS[0];
  const rows = index.filter((r) => (!nq || r.text.includes(nq)) && filter.test(r));
  const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE));
  const ids = rows.slice((page - 1) * PAGE, page * PAGE).map((r) => r.id);
  const [prods, settings, arCats, cats] = await Promise.all([
    getProductsByIds(ids),
    db.productAr.findMany({ where: { productId: { in: ids } } }),
    getArCategories(),
    catalogTree(),
  ]);
  const byId = new Map(settings.map((s) => [s.productId, s]));
  const prodBy = new Map(prods.map((x) => [x.id, x]));
  const slice: ArRowData[] = ids.flatMap((id) => {
    const pr = prodBy.get(id);
    if (!pr) return [];
    return [arRowDataFor(pr, byId.get(pr.id) ?? null, arCats)];
  });
  const href = (n: number) => `?${new URLSearchParams({ q, f, page: String(n) })}`;
  const count = (v: string) => index.filter((FILTERS.find((x) => x.v === v) ?? FILTERS[0]).test).length;
  // δέντρο κατηγοριών με πλήθος προϊόντων / με AR (από την ίδια απόφαση) και την προεπιλογή κάθε τύπου
  const per = new Map<string, { n: number; on: number }>();
  for (const r of index) { const x = per.get(r.cat) ?? { n: 0, on: 0 }; x.n++; if (r.on) x.on++; per.set(r.cat, x); }
  const toNode = (c: CatNode, chain: { slug: string }[]): ArCatNode => {
    const path = [...chain, { slug: c.slug }];
    const children = c.children.map((k) => toNode(k, path)).filter((k) => k.count > 0);
    const own = per.get(c.slug) ?? { n: 0, on: 0 };
    return { slug: c.slug, name: c.name, children, def: children.length ? undefined : !profileFor({ path }).none,
      count: own.n + children.reduce((a, k) => a + k.count, 0), on: own.on + children.reduce((a, k) => a + k.on, 0) };
  };
  const catTree = cats.roots.map((c) => toNode(c, [])).filter((n) => n.count > 0);
  const explicit = Object.keys(arCats).length;
  const bounds = count("bounds");

  return (
    <div className="grid gap-5 min-w-0">
      <div className="grid gap-1">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Box className="size-3.5" aria-hidden /> Επαυξημένη πραγματικότητα</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Δες το στον χώρο σου</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Ο πελάτης βλέπει τη συσκευή στον χώρο του σε πραγματικό μέγεθος. Ισχύει αυτόματα για κάθε προϊόν με <b className="text-eu-ink">διαστάσεις</b> και φωτογραφία, στις κατηγορίες που συμμετέχουν· εδώ βλέπεις ποια έχουν AR, γιατί όχι τα υπόλοιπα, και ρυθμίζεις το καθένα.</p>
      </div>

      <nav aria-label="Κατάσταση AR" className="grid grid-cols-2 @3xl:grid-cols-4 gap-2">
        {TILES.map((t) => {
          const on = f === t.v;
          return (
            <a key={t.v} href={`?${new URLSearchParams({ q, f: on ? "" : t.v })}`} aria-current={on ? "true" : undefined}
              className={`grid gap-0.5 rounded-2xl border p-3 min-h-11 transition-colors ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white hover:border-eu-navy"}`}>
              <span className={`inline-flex items-center gap-1.5 font-bold text-[length:var(--fs-13)] ${on ? "text-white" : t.tone}`}><t.Icon className="size-4" aria-hidden /> {t.label}</span>
              <span className={`font-heading font-bold tabular-nums text-[length:var(--fs-24)] ${on ? "text-white" : "text-eu-ink"}`}>{count(t.v).toLocaleString("el-GR")}</span>
              <span className={`text-[length:var(--fs-12)] ${on ? "text-white/80" : "text-eu-muted"}`}>{t.sub}</span>
            </a>
          );
        })}
      </nav>

      <details className="group/cats rounded-2xl border border-eu-line bg-white">
        <summary className="flex flex-wrap items-center gap-2 p-4 min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <LayoutList className="size-4 text-eu-blue shrink-0" aria-hidden />
          <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Κατηγορίες που συμμετέχουν στο AR</span>
          <span className="text-eu-muted text-[length:var(--fs-13)]">{explicit ? `${explicit} με δική σου επιλογή` : "όλες αυτόματα"}</span>
          <ChevronDown className="size-4 ml-auto text-eu-muted transition-transform group-open/cats:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4"><ArCategories tree={catTree} initial={arCats} canWrite={can(user.permissions, "catalog.products.write")} /></div>
      </details>

      <form className="grid gap-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] items-end">
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Αναζήτηση
          <span className="relative">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Μάρκα, μοντέλο ή κωδικός…" className="rounded-full border border-eu-line pl-10 pr-4 min-h-11 text-[length:var(--fs-14)] font-normal w-full" />
          </span>
        </label>
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Εμφάνιση
          <select name="f" defaultValue={f} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] font-normal bg-white w-full">
            {FILTERS.map((x) => <option key={x.v} value={x.v}>{x.label} ({count(x.v).toLocaleString("el-GR")})</option>)}
          </select>
        </label>
        <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue cursor-pointer">Εφαρμογή</button>
      </form>

      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]" aria-live="polite"><b className="text-eu-ink tabular-nums">{total.toLocaleString("el-GR")}</b> {total === 1 ? "προϊόν" : "προϊόντα"}{filter.v ? <> · {filter.label}</> : null}{q ? <> · «{q}»</> : null}{bounds > 0 && !f ? <> · <a href="?f=bounds" className="font-bold text-eu-red hover:underline">{bounds} με διαστάσεις εκτός ορίων</a></> : null}</p>

      <div className="grid gap-3 @container">
        {slice.map((r) => <ArRow key={r.id} row={r} />)}
        {!slice.length && <p className="m-0 rounded-2xl border border-eu-line bg-white p-8 text-center text-eu-muted">Κανένα προϊόν με αυτά τα κριτήρια.</p>}
        <div className="flex justify-center"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
      </div>
    </div>
  );
}
