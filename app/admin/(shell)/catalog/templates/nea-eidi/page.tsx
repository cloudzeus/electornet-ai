import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { brandOptions, groupOptions } from "@/lib/catalog/foreign-import/options";
import { pendingMissing, pendingFields, pendingMedia } from "@/lib/catalog/foreign-import/pending-core";
import { PendingItems, type PendingView } from "@/components/admin/catalog/PendingItems";

export const metadata = { title: "Νέα είδη προς δημιουργία" };
export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "pending", label: "Σε αναμονή" },
  { key: "error", label: "Με σφάλμα" },
  { key: "creating", label: "Δημιουργούνται" },
  { key: "created", label: "Δημιουργήθηκαν" },
  { key: "discarded", label: "Απορρίφθηκαν" },
] as const;
const PAGE = 100;

/** Νέα είδη από την «Εισαγωγή από άλλο Excel» που περιμένουν έγκριση πριν δημιουργηθούν στο SoftOne: τι λείπει, διόρθωση στοιχείων, έγκριση (δημιουργία ανενεργού είδους, τιμή, φωτογραφίες) ή απόρριψη. */
export default async function PendingItemsPage({ searchParams }: { searchParams: Promise<{ s?: string; p?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s.key === sp.s)?.key ?? "pending";
  const pageNo = Math.max(1, Number(sp.p) || 1);
  const [counts, total, rows, brands, groups, writeOn] = await Promise.all([
    db.pendingItem.groupBy({ by: ["status"], _count: { _all: true } }),
    db.pendingItem.count({ where: { status } }),
    db.pendingItem.findMany({ where: { status }, orderBy: [{ createdAt: "desc" }, { rowNo: "asc" }], skip: (pageNo - 1) * PAGE, take: PAGE }),
    brandOptions(),
    groupOptions(),
    itemWriteEnabled(),
  ]);
  const count = new Map(counts.map((c) => [c.status, c._count._all]));
  const brandOf = new Map(brands.map((b) => [b.id, b]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  // Ονόματα που δεν είναι στις επιλογές (ομάδα χωρίς κατηγορία site, κατηγορία, αρχείο)
  const extraGroups = [...new Set(rows.map((r) => r.specGroupS1Id).filter((g): g is number => g != null && !groupName.has(g)))];
  const [moreGroups, cats, jobs] = await Promise.all([
    extraGroups.length ? db.s1SpecGroup.findMany({ where: { s1Id: { in: extraGroups } }, select: { s1Id: true, name: true } }) : [],
    db.category.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.webCategoryId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    db.importJob.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.jobId))] } }, select: { id: true, fileName: true, createdAt: true } }),
  ]);
  for (const g of moreGroups) groupName.set(g.s1Id, g.name);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const jobOf = new Map(jobs.map((j) => [j.id, j]));

  const items: PendingView[] = rows.map((p) => {
    const b = p.brandId ? brandOf.get(p.brandId) : undefined;
    const m = pendingMedia(p.media);
    const job = jobOf.get(p.jobId);
    return {
      id: p.id, status: p.status, code: p.code, name: pendingFields(p.fields).name ?? "", rowNo: p.rowNo,
      file: job ? `${job.fileName} · ${job.createdAt.toLocaleDateString("el-GR")}` : null,
      brandId: b?.id ?? null, brandName: b?.name ?? null, groupId: p.specGroupS1Id, groupName: p.specGroupS1Id != null ? groupName.get(p.specGroupS1Id) ?? `Ομάδα ${p.specGroupS1Id}` : null,
      category: p.webCategoryId ? catName.get(p.webCategoryId) ?? null : null,
      cost: p.cost, rrp: p.rrp, price: p.price, photos: m.image.length + m.banner.length + m.video.length,
      missing: pendingMissing({ ...p, brandId: b?.id ?? null, brandS1Id: b?.s1Id ?? null }),
      mtrl: p.mtrl, error: p.error, updatedAt: p.updatedAt.toISOString(),
    };
  });
  const canWrite = can(user.permissions, "catalog.products.write");
  const canApprove = canWrite && can(user.permissions, "catalog.sync.run");
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (s: string, p = 1) => `/admin/catalog/templates/nea-eidi?s=${s}${p > 1 ? `&p=${p}` : ""}`;

  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates & excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><PackagePlus className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Νέα είδη προς δημιουργία</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Είδη από την «Εισαγωγή από άλλο Excel» που δεν υπάρχουν στο SoftOne. Συμπλήρωσε ό,τι λείπει και εγκρίνε: το είδος δημιουργείται στο SoftOne <strong>ανενεργό</strong>, παίρνει τιμή web και φωτογραφίες, και το ενεργοποιείς όταν είναι έτοιμο.</p>
      </div>
      <nav data-help="pending.filters" aria-label="Κατάσταση" className="flex flex-wrap gap-2">
        {STATUSES.filter((s) => s.key !== "creating" || count.get("creating")).map((s) => (
          <Link key={s.key} href={href(s.key)} aria-current={s.key === status ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] ${s.key === status ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>
            {s.label} <span className="tabular-nums opacity-80">{count.get(s.key) ?? 0}</span>
          </Link>
        ))}
      </nav>
      <PendingItems key={`${status}-${pageNo}`} items={items} status={status} writeOn={writeOn} canWrite={canWrite} canApprove={canApprove}
        brands={brands.map((b) => ({ id: b.id, name: b.name, hint: b.s1 ? undefined : "χωρίς σύνδεση με SoftOne" }))} groups={groups.map((g) => ({ id: String(g.id), name: g.name }))} />
      {pages > 1 && (
        <nav aria-label="Σελίδες" className="flex flex-wrap items-center justify-center gap-2 text-[length:var(--fs-14)]">
          {pageNo > 1 && <Link href={href(status, pageNo - 1)} className="inline-flex items-center rounded-full border-2 border-eu-navy px-4 min-h-11 md:min-h-9 font-bold text-eu-navy hover:bg-eu-chip">Προηγούμενα</Link>}
          <span className="text-eu-ink-3 tabular-nums">Σελίδα {pageNo} από {pages}</span>
          {pageNo < pages && <Link href={href(status, pageNo + 1)} className="inline-flex items-center rounded-full border-2 border-eu-navy px-4 min-h-11 md:min-h-9 font-bold text-eu-navy hover:bg-eu-chip">Επόμενα</Link>}
        </nav>
      )}
    </div>
  );
}
