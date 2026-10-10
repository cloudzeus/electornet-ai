import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { allShippingFacts, getBulkyRules, tallyShipping } from "@/lib/shipping/bulky-server";
import { DEFAULT_STORE_ONLY } from "@/lib/shipping/bulky";
import { getFeatures } from "@/lib/admin/features";
import { ShippingRules, type ShipCat } from "./ShippingRules";

export const metadata = { title: "Αποστολές" };
export const dynamic = "force-dynamic";

/**
 * Αποστολές: ποια προϊόντα φεύγουν με courier, ποια μόνο από κατάστημα (μεγάλες συσκευές: ραντεβού ή παραλαβή) και ποια
 * χωράνε σε θυρίδα. Ο ίδιος κανόνας ισχύει στο καλάθι, στο checkout και στην καταχώριση της παραγγελίας.
 */
export default async function ShippingPage() {
  const user = await requirePermission("catalog.products.read");
  const [rules, tree, facts, features] = await Promise.all([getBulkyRules(), catalogTree(), allShippingFacts(), getFeatures().catch(() => null)]);
  const now = tallyShipping(facts, rules);
  // όλες οι κατηγορίες με τη διαδρομή τους (για αναζήτηση), πλήθος προϊόντων και τη γονική
  const cats: ShipCat[] = [];
  const walk = (n: CatNode, trail: string[], parent: string | null) => {
    const label = [...trail, n.name];
    cats.push({ id: n.id, slug: n.slug, name: n.name, path: label.join(" › "), depth: n.depth, count: n.count, parent, def: DEFAULT_STORE_ONLY[n.slug] ?? null });
    n.children.forEach((c) => walk(c, label, n.slug));
  };
  tree.roots.forEach((r) => walk(r, [], null));
  const couriers = features ? (["geniki", "acs", "boxnow", "elta", "asap"] as const).filter((c) => features[c]) : [];
  return (
    <ShippingRules
      cats={cats}
      initial={rules}
      tally={{ courier: now.courier, store: now.store, locker: now.locker, unknown: now.unknown, storeByCat: now.storeByCat }}
      couriers={couriers}
      clickCollect={!!features?.clickCollect}
      appointment={!!features?.appointment}
      canWrite={can(user.permissions, "settings.write")}
      canSettings={user.roles.includes("super-admin")}
    />
  );
}
