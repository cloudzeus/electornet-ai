import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { listProductImages } from "@/lib/catalog/product-images";
import { ProductImages } from "@/components/admin/catalog/ProductImages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.product.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: p?.title ?? "Προϊόν" };
}

/** Καρτέλα προϊόντος: τα στοιχεία του ERP (μόνο ανάγνωση) και οι φωτογραφίες του (δικές μας). */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, sku: true, ean: true, erpCode: true, slug: true, active: true, summary: true, source: true, s1SyncedAt: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true } }, _count: { select: { specs: true, facetValues: true } } } });
  if (!p) notFound();
  const images = await listProductImages(p.id);
  const path = [p.category.parent?.parent?.name, p.category.parent?.name, p.category.name].filter(Boolean).join(" › ");
  const facts: [string, string][] = [["Μάρκα", p.brand.name], ["Κατηγορία", path], ["Κωδικός είδους", p.sku], ["Barcode", p.ean ?? "—"], ["SoftOne MTRL", p.erpCode], ["Χαρακτηριστικά", `${p._count.specs} · ${p._count.facetValues} τιμές φίλτρων`], ["Ενεργειακή κλάση", p.energy?.class ?? "—"], ["Κατάσταση", p.active ? "Ενεργό" : "Ανενεργό"]];

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Όλα τα προϊόντα</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5 w-full"><Package className="size-3.5" aria-hidden /> {path}</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] text-balance">{p.title}</h2>
        {p.summary && <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[84ch]">{p.summary}</p>}
      </div>

      <ProductImages productId={p.id} initial={images} canWrite={can(user.permissions, "catalog.products.write")} canUploadToLibrary={can(user.permissions, "cms.media.write")} />

      <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3">
        <div>
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Στοιχεία από το SoftOne</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Μόνο ανάγνωση — αλλάζουν στο ERP και έρχονται με τον επόμενο συγχρονισμό{p.s1SyncedAt ? ` (τελευταίος: ${p.s1SyncedAt.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}.</p>
        </div>
        <dl className="m-0 grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-eu-muted text-[length:var(--fs-13)]">{k}</dt><dd className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)] break-words">{v}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
