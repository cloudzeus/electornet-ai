import { FileSpreadsheet } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { SupplierSheets } from "@/components/admin/catalog/SupplierSheets";

export const metadata = { title: "Templates & εισαγωγή excel" };
export const dynamic = "force-dynamic";

/** Templates excel προς τους προμηθευτές (ανά μάρκα, ένα φύλλο ανά κατηγορία) και μαζική εισαγωγή προϊόντων από αυτά. */
export default async function TemplatesPage() {
  const user = await requirePermission("catalog.products.read");
  const [brands, counts, groups, writeOn] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true, s1Id: true }, orderBy: { name: "asc" } }),
    db.product.groupBy({ by: ["brandId"], _count: { _all: true } }),
    db.s1SpecGroup.findMany({ where: { missing: false, active: true, cat1: { not: null }, cat2: { not: null } }, select: { s1Id: true, name: true }, orderBy: { name: "asc" } }),
    itemWriteEnabled(),
  ]);
  const count = new Map(counts.map((c) => [c.brandId, c._count._all]));
  const canWrite = can(user.permissions, "catalog.products.write");
  const canErp = canWrite && can(user.permissions, "catalog.sync.run");
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Templates προμηθευτών & εισαγωγή excel</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Διάλεξε μάρκες, δες τι προϊόντα έχουν και κατέβασε ένα excel ανά μάρκα — ένα φύλλο ανά κατηγορία, με τα χαρακτηριστικά της όπως είναι σήμερα στο SoftOne. Ο προμηθευτής το συμπληρώνει και το ανεβάζεις στην «Εισαγωγή».</p>
      </div>
      <SupplierSheets
        brands={brands.map((b) => ({ id: b.id, name: b.name, products: count.get(b.id) ?? 0, s1: !!b.s1Id }))}
        groups={groups.map((g) => ({ id: g.s1Id, name: g.name }))}
        canWrite={canWrite} canErp={canErp} writeOn={writeOn}
      />
    </div>
  );
}
