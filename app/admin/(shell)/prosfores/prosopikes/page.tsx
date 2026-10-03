import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PersonalEditor } from "@/components/admin/promos/PersonalEditor";
import { getPersonalConfig, PERSONAL_META, type PersonalKind } from "@/lib/promo/personal";

export const metadata = { title: "Προσωπικές προσφορές" };
export const dynamic = "force-dynamic";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export default async function PersonalPage() {
  await requirePermission("catalog.promos.write");
  const since = daysAgo(90);
  const [cfg, cats, issued] = await Promise.all([
    getPersonalConfig(),
    db.category.findMany({ where: { active: true, depth: { lte: 2 } }, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true, parent: { select: { name: true } } } }),
    db.coupon.findMany({ where: { trigger: "personal", createdAt: { gte: since } }, select: { personalKey: true, usedCount: true } }),
  ]);
  const stats = (Object.keys(PERSONAL_META) as PersonalKind[]).map((k) => { const rows = issued.filter((c) => c.personalKey?.startsWith(`${k}:`)); return { kind: k, issued: rows.length, used: rows.filter((r) => r.usedCount > 0).length }; });
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="personal" active="personal" title="Προσωπικές προσφορές" lead="Από ό,τι ξέρουμε για κάθε πελάτη (λίστα επιθυμιών, παλιές συσκευές, καλάθι, αγορές) βγαίνει ένας προσωπικός κωδικός για ένα συγκεκριμένο προϊόν ή κατηγορία. Τον βλέπει στο «Οι προσφορές μου» και — αν έχει δώσει συναίνεση — με email." />
      <PersonalEditor initial={cfg} stats={stats} categories={cats.map((c) => ({ id: c.id, label: c.depth === 0 ? c.name : `${c.parent?.name ?? ""} › ${c.name}` }))} />
    </div>
  );
}
