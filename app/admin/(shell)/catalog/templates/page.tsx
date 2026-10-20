import Link from "next/link";
import { ChevronRight, FileSpreadsheet, FileUp, PackagePlus, Percent } from "lucide-react";
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
  const [brands, counts, groups, writeOn, pending, rules] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true, s1Id: true }, orderBy: { name: "asc" } }),
    db.product.groupBy({ by: ["brandId"], _count: { _all: true } }),
    db.s1SpecGroup.findMany({ where: { missing: false, active: true, cat1: { not: null }, cat2: { not: null } }, select: { s1Id: true, name: true }, orderBy: { name: "asc" } }),
    itemWriteEnabled(),
    db.pendingItem.count({ where: { status: { in: ["pending", "error"] } } }),
    db.markupRule.count({ where: { active: true } }),
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
      <nav data-help="templates.foreign" aria-label="Εισαγωγή από άλλο Excel" className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
        {[
          { href: "/admin/catalog/templates/import", Icon: FileUp, title: "Εισαγωγή από άλλο Excel", text: "Τιμοκατάλογος ή λίστα προμηθευτή σε δική του μορφή: αντιστοιχίζεις τις στήλες, συμπληρώνονται μόνο τα κενά.", badge: null, show: canWrite },
          { href: "/admin/catalog/templates/nea-eidi", Icon: PackagePlus, title: "Νέα είδη προς δημιουργία", text: "Είδη από τα excel που δεν υπάρχουν στο SoftOne — συμπλήρωση και έγκριση.", badge: pending ? `${pending} σε αναμονή` : null, show: true },
          { href: "/admin/catalog/templates/kanones-timon", Icon: Percent, title: "Κανόνες τιμολόγησης", text: "Markup από το κόστος στην τιμή web: γενικός κανόνας και εξαιρέσεις ανά μάρκα / κατηγορία.", badge: `${rules} ενεργοί`, show: true },
        ].filter((x) => x.show).map(({ href, Icon, title, text, badge }) => (
          <Link key={href} href={href} className="group flex gap-3 items-start rounded-xl border border-eu-line bg-white p-3 min-h-11 hover:border-eu-blue min-w-0">
            <Icon className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden />
            <span className="grid gap-0.5 min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)] group-hover:text-eu-navy">{title}{badge && <span className="rounded-full px-2 py-0.5 bg-eu-chip text-eu-navy font-bold text-[length:var(--fs-12)] tabular-nums">{badge}</span>}</span>
              <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{text}</span>
            </span>
            <ChevronRight className="size-4 text-eu-muted shrink-0 mt-1" aria-hidden />
          </Link>
        ))}
      </nav>
      <SupplierSheets
        brands={brands.map((b) => ({ id: b.id, name: b.name, products: count.get(b.id) ?? 0, s1: !!b.s1Id }))}
        groups={groups.map((g) => ({ id: g.s1Id, name: g.name }))}
        canWrite={canWrite} canErp={canErp} writeOn={writeOn}
      />
    </div>
  );
}
