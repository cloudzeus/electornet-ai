import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2, PauseCircle, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { jobStatus } from "@/lib/scheduler";
import { readState } from "@/lib/competitors/run";
import { cachedCategories } from "@/lib/competitors/kotsovolos/client";
import { BrandCards, CategoryPicker, MappingTabs, StatusActions, type BrandCard, type CatRow, type PickOption } from "@/components/admin/competitors/MappingTabs";

export const metadata = { title: "Σύγκριση τιμών" };
export const dynamic = "force-dynamic";

const COMP = "kotsovolos";
const JOB = "competitor-kotsovolos";

const num = (n: number) => n.toLocaleString("el-GR");
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" });
const TIME = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hour12: false });
function when(d: Date) {
  const day = DAY.format(d), today = DAY.format(new Date()), yest = DAY.format(new Date(Date.now() - 86400_000));
  const [, m, dd] = day.split("-");
  return `${day === today ? "Σήμερα" : day === yest ? "Χθες" : `${Number(dd)}/${Number(m)}`} ${TIME.format(d)}`;
}

/** Οθόνη αντιστοίχισης με τον Κωτσόβολο: κατηγορίες, μάρκες και κατάσταση της νυχτερινής εργασίας. */
export default async function CompetitorsPage() {
  const user = await requirePermission("catalog.products.read");
  const canWrite = can(user.permissions, "catalog.products.write");
  const canRun = can(user.permissions, "catalog.sync.run");

  const [cats, maps, prices, jobs, state, kot] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true, productCount: true, active: true } }),
    db.competitorCategoryMap.findMany({ where: { competitor: COMP } }),
    db.competitorPrice.findMany({ where: { competitor: COMP }, select: { match: true, diffPct: true, checkedAt: true, product: { select: { categoryId: true, brandId: true } } } }),
    jobStatus().catch(() => []),
    readState(),
    cachedCategories().catch(() => null),
  ]);
  const job = jobs.find((j) => j.key === JOB);

  const byId = new Map(cats.map((c) => [c.id, c]));
  const kids = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const chain = (id: string): typeof cats => { const c = byId.get(id); return c ? [...(c.parentId ? chain(c.parentId) : []), c] : []; };
  const leaves = (id: string): string[] => { const k = kids.get(id); if (k?.length) return k.flatMap(leaves); const c = byId.get(id); return c?.active && c.productCount > 0 ? [id] : []; };
  const mapOf = new Map(maps.map((m) => [m.categoryId, m]));

  const firm = prices.filter((p) => p.match === "auto" || p.match === "manual");
  const tally = (rows: typeof prices, key: "categoryId" | "brandId") => {
    const t = new Map<string, number>();
    for (const r of rows) t.set(r.product[key], (t.get(r.product[key]) ?? 0) + 1);
    return t;
  };
  const pairsByCat = tally(firm, "categoryId"), suggByCat = tally(prices.filter((p) => p.match === "suggested"), "categoryId"), seenByCat = tally(prices, "categoryId");
  const ran = !!job?.lastEndAt;

  // Καρτέλες: οι κατηγορίες που διάλεξε ο διαχειριστής, ομαδοποιημένες ανά ριζική κατηγορία μας
  const groups = new Map<string, { key: string; label: string; rows: CatRow[] }>();
  for (const m of maps) {
    const c = byId.get(m.categoryId);
    if (!c) continue;
    const ch = chain(c.id), root = ch[0];
    const status: CatRow["status"] = m.extPath ? "mapped" : m.suggested ? "suggested" : "needed";
    const row: CatRow = { id: c.id, name: c.name, path: ch.slice(1, -1).map((x) => x.name).join(" › "), products: c.productCount, extPath: m.extPath, suggestion: m.extPath ? null : m.suggested, status, pairs: pairsByCat.get(c.id) ?? 0, sugg: suggByCat.get(c.id) ?? 0, seen: (seenByCat.get(c.id) ?? 0) > 0 || (ran && !!m.extPath) };
    const g = groups.get(root.id) ?? { key: root.id, label: root.name, rows: [] };
    g.rows.push(row);
    groups.set(root.id, g);
  }
  const tabs = [...groups.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.path.localeCompare(b.path, "el") || b.products - a.products) })).sort((a, b) => a.label.localeCompare(b.label, "el"));
  const allRows = tabs.flatMap((t) => t.rows);
  const comparedIds = allRows.filter((r) => r.status === "mapped").map((r) => r.id);
  const compared = allRows.filter((r) => r.status === "mapped").reduce((s, r) => s + r.products, 0);
  const comparedSet = new Set(comparedIds), pairsIn = firm.filter((p) => comparedSet.has(p.product.categoryId)).length; // όχι κατηγορίες που αφαιρέθηκαν
  const needChoice = allRows.filter((r) => r.status === "needed").length, needCheck = allRows.filter((r) => r.status === "suggested").length;

  // Επιλογέας: κάθε ενεργή κατηγορία μας με προϊόντα (μια γονική προσθέτει όλες τις τελικές της)
  const pick: PickOption[] = cats.filter((c) => c.active && c.productCount > 0).map((c) => {
    const ls = leaves(c.id);
    return { id: c.id, name: c.name, path: chain(c.id).slice(0, -1).map((x) => x.name).join(" › "), products: c.productCount, root: !c.parentId, leaves: ls.length, missing: ls.filter((id) => !mapOf.has(id)).length };
  }).filter((o) => o.leaves > 0).sort((a, b) => a.path.localeCompare(b.path, "el") || a.name.localeCompare(b.name, "el"));

  // Μάρκες των κατηγοριών που συγκρίνονται
  const [brandCounts, brandMaps] = await Promise.all([
    comparedIds.length ? db.product.groupBy({ by: ["brandId"], where: { active: true, kind: { not: "set" }, categoryId: { in: comparedIds } }, _count: true }) : Promise.resolve([]),
    db.competitorBrandMap.findMany({ where: { competitor: COMP } }),
  ]);
  const brandNames = new Map((await db.brand.findMany({ where: { id: { in: brandCounts.map((b) => b.brandId) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  const bmOf = new Map(brandMaps.map((b) => [b.brandId, b]));
  const pairsByBrand = tally(firm, "brandId");
  const brands: BrandCard[] = brandCounts.map((b) => {
    const m = bmOf.get(b.brandId), pairs = pairsByBrand.get(b.brandId) ?? 0;
    return { id: b.brandId, name: brandNames.get(b.brandId) ?? "—", products: b._count, pairs, alias: m?.alias ?? null, notCarried: !!m?.notCarried, needsLook: ran && pairs === 0 && !m?.notCarried };
  }).sort((a, b) => Number(b.needsLook) - Number(a.needsLook) || Number(a.notCarried) - Number(b.notCarried) || b.pairs - a.pairs || a.name.localeCompare(b.name, "el"));

  // Κάρτες κατάστασης
  const since = job?.lastStartAt ?? null;
  const fresh = since ? firm.filter((p) => p.checkedAt && p.checkedAt >= since).length : 0;
  const pricier = firm.filter((p) => (p.diffPct ?? 0) > 0.5).length;
  const withPrice = firm.filter((p) => p.diffPct != null).length;
  const totalSugg = prices.filter((p) => p.match === "suggested").length;
  const card = "rounded-2xl border bg-white p-4 grid content-start gap-1.5 min-w-0";
  const label = "m-0 text-eu-ink-3 text-[length:var(--fs-13)]";
  const figure = "m-0 font-heading font-bold tabular-nums text-[length:var(--fs-22)]";

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1 min-w-0">
          <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Προϊόντα</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Σύγκριση με Κωτσόβολο</h2>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] max-w-[70ch]">Διάλεξε ποιες κατηγορίες μας συγκρίνονται και πες σε ποια δική τους αντιστοιχεί η καθεμία. Κάθε βράδυ από τις 01:00 βρίσκουμε τα ίδια προϊόντα με μάρκα και μοντέλο και κρατάμε την τιμή τους.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRun && <StatusActions mode="run" running={!!job?.running} disabled={!!state.paused} />}
          <Link href="/admin/catalog/competitors/prices" className="inline-flex items-center gap-2 rounded-xl bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-navy-2">Μαζική αλλαγή τιμών</Link>
        </div>
      </div>

      <section className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,13.75rem),1fr))]" aria-label="Κατάσταση" data-help="competitors-status">
        <div className={`${card} ${state.paused || job?.lastOk === false ? "border-eu-red/40" : "border-eu-line"}`}>
          <p className={label}>Τελευταίος έλεγχος</p>
          {state.paused ? (
            <>
              <p className={`${figure} text-eu-red inline-flex items-center gap-2`}><PauseCircle className="size-5 shrink-0" aria-hidden /> Σε παύση</p>
              <p className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">Σε παύση: ο Κωτσόβολος μάς έκοψε</p>
              {canRun ? <StatusActions mode="resume" running={false} disabled={false} /> : <p className={label}>Ζήτα από κάποιον με δικαίωμα συγχρονισμού να την ξαναενεργοποιήσει.</p>}
            </>
          ) : job?.running ? (
            <>
              <p className={`${figure} text-eu-blue inline-flex items-center gap-2`}><Loader2 className="size-5 animate-spin shrink-0" aria-hidden /> Τρέχει τώρα</p>
              <p className={label}>Ξεκίνησε {since ? when(since) : ""} · η σελίδα ανανεώνεται μόνη της</p>
            </>
          ) : job?.lastEndAt ? (
            <>
              <p className={`${figure} text-eu-ink`}>{when(job.lastEndAt)}</p>
              <p className={`m-0 inline-flex items-start gap-1.5 font-bold text-[length:var(--fs-13)] ${job.lastOk ? "text-eu-green" : "text-eu-red"}`}>
                {job.lastOk ? <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />}
                {job.lastOk ? "Ολοκληρώθηκε" : "Σταμάτησε με σφάλμα"}
              </p>
              {job.lastMessage && <p className={`${label} break-words`}>{job.lastMessage}</p>}
            </>
          ) : (
            <>
              <p className={`${figure} text-eu-ink-3`}>Ποτέ</p>
              <p className={label}>Ο πρώτος έλεγχος γίνεται απόψε, ή πάτα «Τρέξε τώρα»</p>
            </>
          )}
          {firm.length > 0 && since && (
            <p className={label}>{fresh < firm.length ? `${num(fresh)} από ${num(firm.length)} τιμές ανανεώθηκαν απόψε · τα υπόλοιπα αύριο` : `Και οι ${num(firm.length)} τιμές ανανεώθηκαν`}</p>
          )}
        </div>

        <div className={`${card} border-eu-line`}>
          <p className={label}>Προϊόντα με ζευγάρι</p>
          {compared ? (
            <>
              <p className={`${figure} text-eu-ink`}>{num(pairsIn)} <span className="text-eu-ink-3 font-normal text-[length:var(--fs-15)]">από {num(compared)} ({Math.round((pairsIn / compared) * 100)}%)</span></p>
              <p className={label}>{totalSugg ? `+ ${num(totalSugg)} προτάσεις προς έλεγχο στη σελίδα κάθε προϊόντος` : "Χωρίς προτάσεις προς έλεγχο"}</p>
            </>
          ) : (
            <>
              <p className={`${figure} text-eu-ink-3`}>—</p>
              <p className={label}>Πρόσθεσε και επιβεβαίωσε πρώτα κατηγορίες παρακάτω</p>
            </>
          )}
        </div>

        <div className={`${card} ${pricier ? "border-eu-red/40" : "border-eu-line"}`}>
          <p className={label}>Είμαστε ακριβότεροι</p>
          {withPrice ? (
            <>
              <p className={`${figure} ${pricier ? "text-eu-red" : "text-eu-green"} inline-flex items-center gap-2`}>{pricier ? <TrendingUp className="size-5 shrink-0" aria-hidden /> : <CheckCircle2 className="size-5 shrink-0" aria-hidden />}{pricier ? `${num(pricier)} στα ${num(withPrice)}` : "Σε κανένα"}</p>
              {pricier > 0 ? <Link href="/admin/catalog/competitors/prices" className="inline-flex items-center gap-1 min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline">Δες τα και διόρθωσε <ArrowRight className="size-4" aria-hidden /></Link> : <p className={label}>Όλα τα ζευγάρια είναι ίδια ή φθηνότερα</p>}
            </>
          ) : (
            <>
              <p className={`${figure} text-eu-ink-3`}>—</p>
              <p className={label}>Φαίνεται μετά τον πρώτο έλεγχο</p>
            </>
          )}
        </div>

        <div className={`${card} ${needChoice + needCheck ? "border-eu-amber/50" : "border-eu-line"}`}>
          <p className={label}>Χρειάζονται απόφαση</p>
          {needChoice + needCheck ? (
            <>
              <p className={`${figure} text-eu-amber`}>{num(needChoice + needCheck)} {needChoice + needCheck === 1 ? "κατηγορία" : "κατηγορίες"}</p>
              <p className={label}>{[needChoice && `${num(needChoice)} χωρίς αντιστοίχιση`, needCheck && `${num(needCheck)} με πρόταση προς επιβεβαίωση`].filter(Boolean).join(" · ")}</p>
            </>
          ) : (
            <>
              <p className={`${figure} text-eu-green inline-flex items-center gap-2`}><CheckCircle2 className="size-5 shrink-0" aria-hidden /> Καμία</p>
              <p className={label}>{allRows.length ? "Όλες οι κατηγορίες έχουν επιβεβαιωμένη αντιστοίχιση" : "Δεν έχεις προσθέσει ακόμη κατηγορίες"}</p>
            </>
          )}
        </div>
      </section>

      {canWrite && <CategoryPicker options={pick} />}

      <MappingTabs tabs={tabs} options={kot} canWrite={canWrite} />

      <BrandCards brands={brands} canWrite={canWrite} />

      <aside className="rounded-2xl border border-eu-blue/25 bg-eu-blue-light p-4 flex gap-3 items-start text-[length:var(--fs-14)] text-eu-ink-2">
        <Info className="size-5 shrink-0 mt-0.5 text-eu-blue" aria-hidden />
        <div className="grid gap-1">
          <b className="text-eu-ink">Πώς ταιριάζουμε τα προϊόντα</b>
          <span>Ίδια μάρκα και ίδιο μοντέλο. Ο Κωτσόβολος κόβει το τέλος του κωδικού (QE65QN90DATXXH → qe65qn90da), οπότε αρκεί ο ένας κωδικός να είναι η αρχή του άλλου. Στα κινητά ταιριάζουμε όνομα, μνήμη και χρώμα, γιατί δεν δείχνουν κωδικό. Ένα λάθος ζευγάρι το διορθώνεις από τη σελίδα του προϊόντος.</span>
        </div>
      </aside>
    </div>
  );
}
