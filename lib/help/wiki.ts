import "server-only";
import { requireStaff } from "@/lib/rbac/guard";
import { getFeatures } from "@/lib/admin/features";
import { ADMIN_NAV } from "@/components/admin/nav";
import { GEN, canSee, curatedFor, groupOf, searchIndex } from "./server";

/** Ό,τι χρειάζονται οι σελίδες του wiki για τον τρέχοντα χρήστη: ορατές σελίδες ανά ομάδα (σειρά του μενού) + ευρετήριο. */
export async function wikiData() {
  const user = await requireStaff();
  const f = await getFeatures().catch(() => ({}));
  const visible = GEN.routes.filter((r) => !r.dynamic && r.route !== "/admin/help" && canSee(r, user, f));
  const order = [...ADMIN_NAV.map((g) => g.label), "Άλλες σελίδες"];
  const byGroup = new Map<string, typeof visible>();
  for (const r of visible) { const g = groupOf(r); byGroup.set(g, [...(byGroup.get(g) ?? []), r]); }
  const groups = order.filter((g) => byGroup.has(g)).map((g) => ({
    group: g,
    pages: byGroup.get(g)!.map((r) => ({ slug: r.slug, title: curatedFor(r.route)?.title ?? r.nav?.label ?? r.title, route: r.route, summary: curatedFor(r.route)?.summary ?? r.doc, curated: !!curatedFor(r.route), shot: r.shots.desktop ?? null, updatedAt: r.updatedAt }))
      .sort((a, b) => Number(b.curated) - Number(a.curated) || a.title.localeCompare(b.title, "el")),
  }));
  return { user, features: f, groups, index: searchIndex(user, f), visible };
}
