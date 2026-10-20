import Link from "next/link";
import { ArrowLeft, Percent } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { brandOptions, categoryOptions } from "@/lib/catalog/foreign-import/options";
import { MarkupRules } from "@/components/admin/catalog/MarkupRules";

export const metadata = { title: "Κανόνες τιμολόγησης" };
export const dynamic = "force-dynamic";

/** Κανόνες markup για την τιμή web των ειδών που έρχονται με κόστος από excel: γενικός κανόνας και εξαιρέσεις ανά μάρκα / κατηγορία, ποσοστό, στρογγύλεμα, με παράδειγμα υπολογισμού δίπλα σε κάθε κανόνα. */
export default async function MarkupRulesPage() {
  const user = await requirePermission("catalog.products.read");
  const [rules, brands, categories] = await Promise.all([
    db.markupRule.findMany({ orderBy: { createdAt: "asc" } }),
    brandOptions(),
    categoryOptions(),
  ]);
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates & excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Percent className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Κανόνες τιμολόγησης</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Πώς βγαίνει η τιμή web από το κόστος όταν εισάγεις excel: <strong>κόστος × (1 + markup) × (1 + ΦΠΑ)</strong>, στρογγύλεμα, και ποτέ πάνω από την προτεινόμενη λιανική (πλαφόν). Ισχύει μόνο για είδη που δεν έχουν ήδη τιμή web.</p>
      </div>
      <MarkupRules
        rules={rules.map((r) => ({ id: r.id, brandId: r.brandId, categoryId: r.categoryId, percent: r.percent, rounding: r.rounding, active: r.active }))}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))} categories={categories.map((c) => ({ id: c.id, name: c.path }))}
        canWrite={can(user.permissions, "catalog.products.write")}
      />
    </div>
  );
}
