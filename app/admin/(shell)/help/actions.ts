"use server";

import { requireStaff } from "@/lib/rbac/guard";
import { getFeatures } from "@/lib/admin/features";
import { canSee, curatedFor, matchRoute } from "@/lib/help/server";

/** Ο οδηγός της σελίδας που βλέπει ο χρήστης (για το πλαίσιο «Βοήθεια»). */
export async function pageHelpAction(pathname: string) {
  const user = await requireStaff();
  const r = matchRoute(pathname);
  if (!r || !canSee(r, user, await getFeatures().catch(() => ({})))) return null;
  return { gen: { route: r.route, slug: r.slug, title: r.nav?.label ?? r.title, doc: r.doc, perm: r.perm, changes: r.changes.slice(0, 4), shots: r.shots, group: r.nav?.group ?? null }, page: curatedFor(r.route) };
}
