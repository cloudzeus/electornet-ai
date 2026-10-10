import { Truck } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { getBulkyRules, shippingLimits } from "@/lib/shipping/bulky-server";
import { DEFAULT_STORE_ONLY } from "@/lib/shipping/bulky";
import { BulkyForm, type BulkyCat } from "./BulkyForm";

export const metadata = { title: "Αποστολές & μεγάλες συσκευές" };
export const dynamic = "force-dynamic";

/**
 * Ποια προϊόντα δεν αποστέλλονται με courier ή σε θυρίδα: οι μεγάλες συσκευές παραδίδονται από το κατάστημα με ραντεβού
 * ή παραλαμβάνονται. Ο ίδιος κανόνας ισχύει στο καλάθι, στο checkout και στην καταχώριση της παραγγελίας.
 */
export default async function ShippingRulesPage() {
  const user = await requirePermission("catalog.products.read");
  const [rules, tree, prods] = await Promise.all([
    getBulkyRules(), catalogTree(),
    db.product.findMany({ where: { active: true }, select: { id: true, categoryId: true } }),
  ]);
  const limits = await shippingLimits(prods.map((p) => p.id), rules);
  // πλήθη ανά κατηγορία (και των υποκατηγοριών της)
  const storeOnlyIn = new Map<string, number>();
  for (const p of prods) if (limits.get(p.id)?.courier === false) storeOnlyIn.set(p.categoryId, (storeOnlyIn.get(p.categoryId) ?? 0) + 1);
  const cats: BulkyCat[] = [];
  const walk = (n: CatNode): number => {
    const at = cats.length;
    cats.push({ slug: n.slug, name: n.name, depth: n.depth, count: n.count, storeOnly: 0, def: DEFAULT_STORE_ONLY[n.slug] ?? null });
    const sub = (storeOnlyIn.get(n.id) ?? 0) + n.children.reduce((a, c) => a + walk(c), 0);
    cats[at].storeOnly = sub;
    return sub;
  };
  tree.roots.forEach(walk);
  const shown = cats.filter((c) => c.depth <= 2);
  const total = [...limits.values()];
  const tiles = [
    ["Με courier", total.filter((l) => l.courier).length],
    ["Μόνο από κατάστημα", total.filter((l) => !l.courier).length],
    ["Χωράνε σε θυρίδα", total.filter((l) => l.locker).length],
    ["Χωρίς βάρος ή διαστάσεις", total.filter((l) => l.weightKg == null && !l.dimsCm).length],
  ] as const;
  return (
    <div className="grid gap-5 max-w-6xl">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Truck className="size-4" aria-hidden /> Εμπόριο</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Αποστολές & μεγάλες συσκευές</h1>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Οι μεγάλες συσκευές δεν φεύγουν με courier: στο checkout ο πελάτης βλέπει μόνο «Με ραντεβού» (παράδοση και εγκατάσταση από το κατάστημα) ή «Παραλαβή από κατάστημα». Αποφασίζει η κατηγορία· για τις υπόλοιπες, το βάρος συσκευασίας και η μεγαλύτερη διάσταση. Σε θυρίδα BOX NOW πάνε μόνο όσα ξέρουμε ότι χωράνε.</p>
      </div>
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        {tiles.map(([l, n]) => (
          <div key={l} className="rounded-xl border border-eu-line bg-white p-3 grid gap-0.5">
            <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">{l}</span>
            <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-24)] tabular-nums leading-none">{n.toLocaleString("el-GR")}</span>
          </div>
        ))}
      </div>
      <BulkyForm cats={shown} initial={rules} canWrite={can(user.permissions, "settings.write")} />
    </div>
  );
}
