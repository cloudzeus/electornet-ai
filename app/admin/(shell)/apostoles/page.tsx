import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { allShippingFacts, getBulkyRules, tallyShipping } from "@/lib/shipping/bulky-server";
import { DEFAULT_STORE_ONLY } from "@/lib/shipping/bulky";
import { getFeatures } from "@/lib/admin/features";
import { ShippingRules, type ShipCat } from "./ShippingRules";
import { AsapExpress } from "./AsapExpress";
import { getAsapRules } from "@/lib/shipping/asap-express-server";
import { asapConfig } from "@/lib/couriers/asap/client";

export const metadata = { title: "Αποστολές" };
export const dynamic = "force-dynamic";

/**
 * Αποστολές: ποια προϊόντα φεύγουν με courier, ποια με μεταφορική (εσωτερική διαδικασία), ποια μόνο από κατάστημα (μεγάλες συσκευές: ραντεβού ή παραλαβή) και ποια
 * χωράνε σε θυρίδα. Ο ίδιος κανόνας ισχύει στο καλάθι, στο checkout και στην καταχώριση της παραγγελίας.
 */
export default async function ShippingPage() {
  const user = await requirePermission("catalog.products.read");
  const [rules, tree, facts, features, asap, asapCfg] = await Promise.all([getBulkyRules(), catalogTree(), allShippingFacts(), getFeatures().catch(() => null), getAsapRules(), asapConfig().catch(() => null)]);
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
    <div className="grid gap-4 min-w-0 @container">
    <ShippingRules
      cats={cats}
      initial={rules}
      tally={{ courier: now.courier, freight: now.freight, store: now.store, locker: now.locker, unknown: now.unknown, storeByCat: now.storeByCat, freightByCat: now.freightByCat }}
      couriers={couriers}
      clickCollect={!!features?.clickCollect}
      appointment={!!features?.appointment}
      freight={!!features?.freight}
      canWrite={can(user.permissions, "settings.write")}
      canSettings={user.roles.includes("super-admin")}
    />
    <AsapExpress cats={cats} initial={asap} asapReady={!!asapCfg} canWrite={can(user.permissions, "settings.write")} />
    </div>
  );
}
