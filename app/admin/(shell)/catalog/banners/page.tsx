import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, ScanText, Search } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { TODO, ORDER } from "@/lib/catalog/banner-worklist";
import { Pagination } from "@/components/admin/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Απόδελτίωση banners" };
const PAGE = 30;

/**
 * Λίστα εργασίας: ποια προϊόντα έχουν ακόμη banners-εικόνες στη σελίδα τους, με σειρά προτεραιότητας (απόθεμα, τιμή).
 * Από εδώ ο καταχωριστής πηγαίνει από προϊόν σε προϊόν — στο τέλος κάθε δημοσίευσης το εργαλείο προτείνει το επόμενο.
 */
export default async function BannerWorklist({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; page?: string }> }) {
  await requirePermission("catalog.products.write");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim(), cat = sp.cat ?? "", page = Math.max(1, Number(sp.page) || 1);
  const where = { AND: [TODO, ...(cat ? [{ categoryId: cat }] : []), ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }, { ean: { contains: q } }, { brand: { name: { contains: q, mode: "insensitive" as const } } }] }] : [])] };
  const [total, rows, withBanners, done, drafts, cats] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: ORDER, skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, stock: true, price: true, brand: { select: { name: true } }, category: { select: { name: true } }, media: { where: { hidden: false }, orderBy: [{ kind: "asc" }, { sortNo: "asc" }], take: 1, select: { url: true, kind: true } }, _count: { select: { media: { where: { kind: "banner", hidden: false } }, extractions: { where: { status: "draft" } } } } } }),
    db.product.count({ where: { source: "softone", active: true, media: { some: { kind: "banner" } } } }),
    db.product.count({ where: { source: "softone", active: true, sections: { some: {} } } }),
    db.bannerExtraction.groupBy({ by: ["productId"], where: { status: "draft" } }).then((r) => r.length),
    db.product.groupBy({ by: ["categoryId"], where: TODO, _count: { _all: true }, orderBy: { _count: { categoryId: "desc" } }, take: 40 }),
  ]);
  const catNames = new Map((await db.category.findMany({ where: { id: { in: cats.map((c) => c.categoryId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const n = (v: number) => v.toLocaleString("el-GR");
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { cat } : {}), page: String(p) })}`;
  const pctDone = withBanners ? Math.round((done / withBanners) * 100) : 0;

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ScanText className="size-4" aria-hidden /> Κατάλογος · εισαγωγή περιεχομένου</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Απόδελτίωση banners</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[84ch]">Τα banners του κατασκευαστή είναι εικόνες με φωτογραφίες και κείμενο κλειδωμένα μαζί: βαριές, δύσκολες στο κινητό, και το κείμενό τους δεν διαβάζεται ούτε από τις μηχανές αναζήτησης ούτε από τον Ερμή. Το εργαλείο τα σπάει σε <strong>πραγματικό κείμενο</strong> και <strong>καθαρές φωτογραφίες</strong> — εσύ ελέγχεις και δημοσιεύεις.</p>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)]">Προϊόντα με banners</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(withBanners)}</div><div className="text-eu-ink-3 text-[length:var(--fs-14)]">{n(total)} περιμένουν απόδελτίωση{q || cat ? " (με το φίλτρο)" : ""}</div></div>
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-eu-green" aria-hidden /> Με ενότητες στη σελίδα</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(done)}</div><div className="mt-2 h-2 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος απόδελτίωσης"><div className="h-full bg-eu-green" style={{ width: `${pctDone}%` }} /></div></div>
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><FileText className="size-4 text-eu-amber" aria-hidden /> Με ανοιχτό πρόχειρο</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(drafts)}</div><div className="text-eu-ink-3 text-[length:var(--fs-14)]">η δουλειά αποθηκεύεται αυτόματα</div></div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white border border-eu-line p-3" role="search">
        <label className="grid gap-1 flex-1 min-w-[16rem] text-eu-ink-3 font-semibold text-[length:var(--fs-14)]">Αναζήτηση
          <span className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden /><input name="q" defaultValue={q} placeholder="Όνομα, κωδικός, barcode ή μάρκα" className="w-full rounded-lg border border-eu-line bg-white pl-9 pr-3 min-h-11 text-eu-ink text-[length:var(--fs-16)]" /></span>
        </label>
        <label className="grid gap-1 min-w-[14rem] text-eu-ink-3 font-semibold text-[length:var(--fs-14)]">Κατηγορία
          <select name="cat" defaultValue={cat} className="rounded-lg border border-eu-line bg-white px-3 min-h-11 text-eu-ink text-[length:var(--fs-16)]">
            <option value="">Όλες</option>
            {cats.map((c) => <option key={c.categoryId} value={c.categoryId}>{catNames.get(c.categoryId)} ({n(c._count._all)})</option>)}
          </select>
        </label>
        <button className="rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-15)] hover:bg-eu-blue">Εφαρμογή</button>
        {rows[0] && <Link href={`/admin/catalog/${rows[0].id}/banners`} className="ml-auto inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-5 min-h-11 text-[length:var(--fs-15)] hover:brightness-95">Ξεκίνα από το πρώτο <ArrowRight className="size-4" aria-hidden /></Link>}
      </form>

      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        {rows.length === 0 ? (
          <p className="m-0 p-6 text-eu-ink-3 text-[length:var(--fs-15)]">{q || cat ? "Κανένα προϊόν με αυτό το φίλτρο." : "Όλα τα προϊόντα με banners έχουν αποδελτιωθεί."}</p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.media[0] ? <img src={r.media[0].url} alt="" loading="lazy" className="size-14 rounded-lg border border-eu-line object-contain bg-white shrink-0" /> : <span className="size-14 rounded-lg bg-eu-surface shrink-0" />}
                <div className="min-w-0 flex-1 basis-60">
                  <Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline text-[length:var(--fs-15)] line-clamp-2">{r.title}</Link>
                  <div className="text-eu-muted text-[length:var(--fs-14)]">{r.brand.name} · {r.category.name}{r.stock > 0 ? " · σε απόθεμα" : ""}{r.price ? ` · ${r.price.toLocaleString("el-GR")} €` : ""}</div>
                </div>
                <span className="text-eu-ink-3 text-[length:var(--fs-14)] tabular-nums whitespace-nowrap">{r._count.media} banners</span>
                {r._count.extractions > 0 && <span className="rounded-full bg-eu-yellow/30 text-eu-navy font-bold px-2.5 py-1 text-[length:var(--fs-13)]">πρόχειρο</span>}
                <Link href={`/admin/catalog/${r.id}/banners`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-4 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-chip">{r._count.extractions ? "Συνέχεια" : "Απόδελτίωση"} <ArrowRight className="size-4" aria-hidden /></Link>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>}
      </div>
    </div>
  );
}
