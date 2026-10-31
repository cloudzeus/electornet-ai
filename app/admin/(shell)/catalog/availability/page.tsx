import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { loadAvailRules, tallyAvailability } from "@/lib/catalog/availability";
import { AvailabilityRules, type Opt } from "./AvailabilityRules";

export const metadata = { title: "Διαθεσιμότητα" };
export const dynamic = "force-dynamic";

/**
 * Διαθεσιμότητα της βιτρίνας: η φράση του είδους στο SoftOne υπερισχύει, μετά οι κανόνες με τη σειρά τους, αλλιώς η
 * προεπιλογή (απόθεμα → «Άμεσα διαθέσιμο»). Η σελίδα δείχνει την επίπτωση πριν την αποθήκευση.
 */
export default async function AvailabilityPage() {
  const user = await requirePermission("catalog.products.read");
  const [rows, tree, brands] = await Promise.all([
    db.availabilityRule.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    catalogTree(),
    db.brand.findMany({ where: { products: { some: { active: true } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const tally = await tallyAvailability(await loadAvailRules());
  const cats: Opt[] = [];
  const walk = (n: CatNode, trail: string[]) => { const path = [...trail, n.name]; cats.push({ id: n.id, name: path.join(" › ") }); n.children.forEach((c) => walk(c, path)); };
  tree.roots.forEach((r) => walk(r, []));
  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Προϊόντα</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Διαθεσιμότητα</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[86ch]">
          Τι γράφει η βιτρίνα δίπλα στην τιμή. Σειρά απόφασης: <b className="text-eu-ink">1.</b> η φράση του είδους στο SoftOne («Κείμενο διαθεσιμότητας», CCCAVAIL) υπερισχύει πάντα· <b className="text-eu-ink">2.</b> οι κανόνες παρακάτω, με τη σειρά τους — ο πρώτος που ταιριάζει κερδίζει· <b className="text-eu-ink">3.</b> αλλιώς απόθεμα στην κεντρική → «Άμεσα διαθέσιμο», χωρίς απόθεμα → «Διαθέσιμο κατόπιν παραγγελίας».
        </p>
      </div>
      <AvailabilityRules
        initial={rows.map((r) => ({ id: r.id, name: r.name ?? "", active: r.active, conditions: r.conditions, label: r.label, state: r.state, publish: r.publish }))}
        tally={tally}
        cats={cats}
        brands={brands}
        canWrite={can(user.permissions, "catalog.products.write")}
      />
    </div>
  );
}
