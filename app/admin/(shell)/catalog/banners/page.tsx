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
export default async function BannerWorklist({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; page?: string; f?: string }> }) {
  await requirePermission("catalog.products.write");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim(), cat = sp.cat ?? "", page = Math.max(1, Number(sp.page) || 1);
  const f = sp.f === "review" || sp.f === "auto" || sp.f === "approve" ? sp.f : "todo";
  // «για έλεγχο»: η αυτόματη απόδελτίωση δεν ήταν σίγουρη για κάποιο banner · «αυτόματες»: δημοσιεύτηκαν χωρίς άνθρωπο
  const REVIEW = { extractions: { some: { needsReview: true, status: "draft" } } };
  const AUTO = { extractions: { some: { origin: "auto", status: "published" } } };
  // «για έγκριση»: η μηχανή ετοίμασε και σχεδίασε τη σελίδα — τίποτα δεν βγαίνει στο site πριν πατήσει άνθρωπος «Δημοσίευση»
  const APPROVE = { extractions: { some: { origin: "auto", status: "draft", needsReview: false } } };
  const base = f === "review" ? REVIEW : f === "auto" ? AUTO : f === "approve" ? APPROVE : TODO;
  const where = { AND: [base, ...(cat ? [{ categoryId: cat }] : []), ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }, { ean: { contains: q } }, { brand: { name: { contains: q, mode: "insensitive" as const } } }] }] : [])] };
  const [total, rows, withBanners, done, drafts, cats, nReview, nAuto, nTodo, nApprove] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: ORDER, skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, stock: true, price: true, brand: { select: { name: true } }, category: { select: { name: true } }, media: { where: { hidden: false }, orderBy: [{ kind: "asc" }, { sortNo: "asc" }], take: 1, select: { url: true, kind: true } }, _count: { select: { media: { where: { kind: "banner", hidden: false } }, extractions: { where: { status: "draft" } } } } } }),
    db.product.count({ where: { source: "softone", active: true, media: { some: { kind: "banner" } } } }),
    db.product.count({ where: { source: "softone", active: true, sections: { some: {} } } }),
    db.bannerExtraction.groupBy({ by: ["productId"], where: { status: "draft" } }).then((r) => r.length),
    db.product.groupBy({ by: ["categoryId"], where: base, _count: { _all: true }, orderBy: { _count: { categoryId: "desc" } }, take: 40 }),
    db.product.count({ where: REVIEW }),
    db.product.count({ where: AUTO }),
    db.product.count({ where: TODO }),
    db.product.count({ where: APPROVE }),
  ]);
  const catNames = new Map((await db.category.findMany({ where: { id: { in: cats.map((c) => c.categoryId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const n = (v: number) => v.toLocaleString("el-GR");
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(f !== "todo" ? { f } : {}), ...(q ? { q } : {}), ...(cat ? { cat } : {}), page: String(p) })}`;
  const tabs = [{ k: "todo", t: "Εκκρεμούν", n: null }, { k: "approve", t: "Για έγκριση", n: nApprove }, { k: "review", t: "Για έλεγχο", n: nReview }, { k: "auto", t: "Δημοσιευμένες αυτόματα", n: nAuto }] as const;
  const pctDone = withBanners ? Math.round((done / withBanners) * 100) : 0;

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ScanText className="size-4" aria-hidden /> Κατάλογος · εισαγωγή περιεχομένου</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Απόδελτίωση banners</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[84ch]">Τα banners του κατασκευαστή είναι εικόνες με φωτογραφίες και κείμενο κλειδωμένα μαζί: βαριές, δύσκολες στο κινητό, και το κείμενό τους δεν διαβάζεται ούτε από τις μηχανές αναζήτησης ούτε από τον Ερμή. Το εργαλείο τα σπάει σε <strong>πραγματικό κείμενο</strong> και <strong>καθαρές φωτογραφίες</strong> — εσύ ελέγχεις και δημοσιεύεις.</p>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)]">Προϊόντα με banners</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(withBanners)}</div><div className="text-eu-ink-3 text-[length:var(--fs-14)]">{n(nTodo)} περιμένουν απόδελτίωση</div></div>
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-eu-green" aria-hidden /> Με ενότητες στη σελίδα</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(done)}</div><div className="mt-2 h-2 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος απόδελτίωσης"><div className="h-full bg-eu-green eu-grow-x" style={{ width: `${pctDone}%` }} /></div></div>
        <div className="rounded-2xl bg-white border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><FileText className="size-4 text-eu-amber" aria-hidden /> Με ανοιχτό πρόχειρο</div><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-28)] tabular-nums">{n(drafts)}</div><div className="text-eu-ink-3 text-[length:var(--fs-14)]">η δουλειά αποθηκεύεται αυτόματα</div></div>
      </div>

      <nav aria-label="Προβολή" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.k} href={t.k === "todo" ? "?" : `?f=${t.k}`} aria-current={f === t.k ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border-2 px-4 min-h-11 font-extrabold text-[length:var(--fs-15)] ${f === t.k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue"}`}>
            {t.t}{t.n !== null && <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-13)] tabular-nums ${f === t.k ? "bg-white/20" : (t.k === "review" || t.k === "approve") && t.n ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface text-eu-ink-3"}`}>{n(t.n)}</span>}
          </Link>
        ))}
      </nav>
      {f === "review" && <p className="m-0 rounded-xl bg-eu-yellow/15 border border-eu-yellow/60 px-4 py-3 text-eu-ink text-[length:var(--fs-15)]">Εδώ είναι τα προϊόντα όπου η αυτόματη απόδελτίωση <strong>δεν ήταν σίγουρη</strong> για κάποιο banner (π.χ. τα πλαίσια δεν κάλυπταν όλο το περιεχόμενο). Αυτά τα banners έμειναν ορατά ως εικόνα· άνοιξε το προϊόν, «Συνέχεια από εκεί που έμεινες», διόρθωσε και δημοσίευσε.</p>}
      {f === "approve" && <p className="m-0 rounded-xl bg-eu-chip px-4 py-3 text-eu-ink text-[length:var(--fs-15)]">Η μηχανή ανέλυσε τα banners και <strong>πρότεινε σελίδα</strong> — δεν έχει βγει στο site. Άνοιξε το προϊόν, δες την προεπισκόπηση (υπολογιστής και κινητό), διόρθωσε ό,τι θες και πάτα <strong>Δημοσίευση</strong> για να εγκριθεί.</p>}
      {f === "auto" && <p className="m-0 rounded-xl bg-eu-chip px-4 py-3 text-eu-ink text-[length:var(--fs-15)]">Προϊόντα που αποδελτιώθηκαν και σχεδιάστηκαν <strong>αυτόματα</strong>. Άνοιξε όποιο θες για να δεις ή να αλλάξεις τη σελίδα («Διόρθωση» στο πρώτο βήμα).</p>}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white border border-eu-line p-3" role="search">
        {f !== "todo" && <input type="hidden" name="f" value={f} />}
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
          <p className="m-0 p-6 text-eu-ink-3 text-[length:var(--fs-15)]">{q || cat ? "Κανένα προϊόν με αυτό το φίλτρο." : f === "review" ? "Τίποτα για έλεγχο." : f === "approve" ? "Τίποτα για έγκριση." : f === "auto" ? "Καμία αυτόματη απόδελτίωση ακόμη." : "Όλα τα προϊόντα με banners έχουν αποδελτιωθεί."}</p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 eu-card-in" style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.media[0] ? <img src={r.media[0].url} alt="" loading="lazy" className="size-14 rounded-lg border border-eu-line object-contain bg-white shrink-0" /> : <span className="size-14 rounded-lg bg-eu-surface shrink-0" />}
                <div className="min-w-0 flex-1 basis-60">
                  <Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline text-[length:var(--fs-15)] line-clamp-2">{r.title}</Link>
                  <div className="text-eu-muted text-[length:var(--fs-14)]">{r.brand.name} · {r.category.name}{r.stock > 0 ? " · σε απόθεμα" : ""}{r.price ? ` · ${r.price.toLocaleString("el-GR")} €` : ""}</div>
                </div>
                <span className="text-eu-ink-3 text-[length:var(--fs-14)] tabular-nums whitespace-nowrap">{r._count.media} banners</span>
                {r._count.extractions > 0 && <span className="rounded-full bg-eu-yellow/30 text-eu-navy font-bold px-2.5 py-1 text-[length:var(--fs-13)]">πρόχειρο</span>}
                <Link href={`/admin/catalog/${r.id}/banners`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-4 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-chip">{f === "review" ? "Έλεγχος" : f === "approve" ? "Έγκριση" : f === "auto" ? "Προβολή" : r._count.extractions ? "Συνέχεια" : "Απόδελτίωση"} <ArrowRight className="size-4" aria-hidden /></Link>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>}
      </div>
    </div>
  );
}
