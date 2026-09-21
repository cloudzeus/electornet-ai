import Link from "next/link";
import Image from "next/image";
import { Package, ImageOff, AlertTriangle, Images, Ruler } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { LOW_RES_PX } from "@/lib/catalog/product-images";

export const metadata = { title: "Κατάλογος" };
export const dynamic = "force-dynamic";

const PAGE = 40;
const shown = { kind: "image", hidden: false } as const;

/** Τα προϊόντα του καταστήματος (προβολή του SoftOne). Από εδώ ανοίγει η καρτέλα κάθε προϊόντος για τις φωτογραφίες του. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; cat?: string; page?: string }> }) {
  await requirePermission("catalog.products.read");
  const { q = "", f = "", cat = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where: Prisma.ProductWhereInput = {
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { ean: { contains: q.trim() } }, { erpCode: q.trim() }] } : {}),
    ...(cat ? { category: { parent: { parentId: cat } } } : {}),
    ...(f === "noimg" ? { media: { none: shown } } : f === "lowres" ? { media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } : f === "one" ? { media: { some: shown }, NOT: { media: { some: { ...shown, sortNo: { gt: 1 } } } } } : f === "inactive" ? { active: false } : {}),
  };
  const [rows, total, masters, all, withImg, lowRes] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, sku: true, ean: true, active: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } }, media: { where: shown, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true, width: true, height: true } }, _count: { select: { media: { where: shown } } } } }),
    db.product.count({ where }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { id: true, name: true } }),
    db.product.count({ where: { active: true } }),
    db.product.count({ where: { active: true, media: { some: shown } } }),
    db.product.count({ where: { active: true, media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ q, f, cat, page: String(n) })}`;
  const n = (v: number) => v.toLocaleString("el-GR");

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Package className="size-3.5" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Προϊόντα</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Όνομα, περιγραφή και κατηγορία έρχονται από το SoftOne. Οι φωτογραφίες είναι δικές μας: άνοιξε ένα προϊόν για να ανεβάσεις νέες, να διαλέξεις από τη βιβλιοθήκη πολυμέσων ή να αλλάξεις τη σειρά τους.</p>
        <Link href="/admin/catalog/dimensions" className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-chip"><Ruler className="size-4" aria-hidden /> Διαστάσεις & EPREL</Link>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
        {[
          { t: "Ενεργά προϊόντα", v: n(all), s: `${n(withImg)} με φωτογραφία`, href: "?", Icon: Images },
          { t: "Χωρίς φωτογραφία", v: n(all - withImg), s: "δεν μπορούν να εμφανιστούν σωστά στο κατάστημα", href: "?f=noimg", Icon: ImageOff },
          { t: "Με μικρή φωτογραφία", v: n(lowRes), s: `κάτω από ${LOW_RES_PX}px — αξίζει αντικατάσταση`, href: "?f=lowres", Icon: AlertTriangle },
        ].map((c) => (
          <Link key={c.t} href={c.href} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0 hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">
            <div className="text-eu-muted text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><c.Icon className="size-4" aria-hidden /> {c.t}</div>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{c.v}</div>
            <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.s}</div>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="cat-q">Αναζήτηση</label>
        <input id="cat-q" name="q" defaultValue={q} placeholder="Τίτλος, κωδικός, barcode…" className="flex-1 min-w-[240px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
        <label className="sr-only" htmlFor="cat-c">Κατηγορία</label>
        <select id="cat-c" name="cat" defaultValue={cat} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white"><option value="">Όλες οι κατηγορίες</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <label className="sr-only" htmlFor="cat-f">Φίλτρο</label>
        <select id="cat-f" name="f" defaultValue={f} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white"><option value="">Όλα</option><option value="noimg">Χωρίς φωτογραφία</option><option value="one">Με μία μόνο φωτογραφία</option><option value="lowres">Με μικρή φωτογραφία</option><option value="inactive">Ανενεργά</option></select>
        <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Φίλτρο</button>
      </form>

      <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
        <table className="w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3 w-20">Κύρια</th><th className="py-2 px-3">Προϊόν</th><th className="py-2 px-3">Κατηγορία</th><th className="py-2 px-3">Κωδικός · barcode</th><th className="py-2 px-3 text-right">Φωτογραφίες</th></tr></thead>
          <tbody>
            {rows.map((r) => { const m = r.media[0]; const small = m?.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX; return (
              <tr key={r.id} className={`border-t border-eu-line align-middle ${r.active ? "" : "opacity-60"}`}>
                <td className="py-2 px-3">
                  <Link href={`/admin/catalog/${r.id}`} aria-label={`Άνοιγμα: ${r.title}`} className="block size-16 rounded-xl border border-eu-line bg-white overflow-hidden focus-visible:outline-2 focus-visible:outline-eu-blue">
                    {m ? <Image src={m.url} alt="" width={64} height={64} className="size-full object-contain" /> : <span className="size-full grid place-items-center text-eu-muted"><ImageOff className="size-5" aria-hidden /></span>}
                  </Link>
                </td>
                <td className="py-2 px-3"><Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.title}</Link><div className="text-eu-muted text-[length:var(--fs-13)]">{r.brand.name}{r.active ? "" : " · ανενεργό"}</div></td>
                <td className="py-2 px-3 text-eu-ink-3">{r.category.parent?.name ? `${r.category.parent.name} › ` : ""}{r.category.name}</td>
                <td className="py-2 px-3 font-mono text-[length:var(--fs-13)] whitespace-nowrap">{r.sku}<div className="text-eu-muted">{r.ean ?? "—"}</div></td>
                <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{r._count.media ? n(r._count.media) : <span className="text-eu-red font-bold">καμία</span>}{small && <div className="text-eu-red text-[length:var(--fs-13)] font-bold">μικρή κύρια</div>}</td>
              </tr>
            ); })}
            {!rows.length && <tr><td colSpan={5} className="p-8 text-center text-eu-muted">{all ? "Κανένα προϊόν με αυτά τα κριτήρια." : "Δεν υπάρχουν προϊόντα ακόμη — τρέξε «Προβολή στο κατάστημα» από το SoftOne ERP › Κατάλογος & CCC."}</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
      </div>
    </div>
  );
}
