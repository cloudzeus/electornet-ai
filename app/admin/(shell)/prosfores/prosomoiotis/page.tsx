import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { Simulator } from "@/components/admin/promos/Simulator";

export const metadata = { title: "Προσομοιωτής καλαθιού" };
export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  await requirePermission("catalog.promos.write");
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="sim" active="sim" title="Προσομοιωτής καλαθιού" lead="Φτιάξε ένα καλάθι, διάλεξε πελάτη, ημερομηνία και κουπόνι: η ίδια μηχανή με το checkout δείχνει τι εφαρμόζεται και γιατί — και για προσφορές που δεν έχουν δημοσιευτεί ακόμη." />
      <Simulator segments={(await db.segment.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((s) => ({ id: s.id, label: s.name }))} />
    </div>
  );
}
