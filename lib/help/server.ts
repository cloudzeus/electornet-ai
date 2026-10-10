import "server-only";
import { can } from "@/lib/rbac/permissions";
import { ADMIN_NAV } from "@/components/admin/nav";
import type { Features } from "@/lib/admin/features";
import generated from "./generated.json";
import { HELP_PAGES, HELP_TOPICS } from "./content";
import type { Generated, GenRoute, HelpPage } from "./types";

/** Τα δεδομένα του wiki: παραγόμενα (generated.json) + γραμμένοι οδηγοί, φιλτραρισμένα με τα δικαιώματα του χρήστη. */
export const GEN = generated as unknown as Generated;
type U = { roles: string[]; permissions: string[] };

const re = (route: string) => new RegExp(`^${route.replace(/\[[^\]]+\]/g, "[^/]+")}/?$`);
/** Η σελίδα που αντιστοιχεί σε μια διεύθυνση (π.χ. /admin/cms/brand-stores/lg → …/[slug]). */
export function matchRoute(pathname: string): GenRoute | null {
  const exact = GEN.routes.find((r) => r.route === pathname);
  return exact ?? GEN.routes.filter((r) => re(r.route).test(pathname)).sort((a, b) => b.route.length - a.route.length)[0] ?? null;
}
export const curatedFor = (route: string): HelpPage | null => HELP_PAGES.find((h) => h.route === route) ?? null;

/** Ορατή στον χρήστη: δικαίωμα + (για σελίδες του μενού) ενεργή λειτουργία στις Ρυθμίσεις. */
export function canSee(r: GenRoute, u: U, f: Partial<Features>) {
  if (r.perm === "super-admin") return u.roles.includes("super-admin");
  if (r.perm !== "*" && !can(u.permissions, r.perm)) return false;
  const nav = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === r.route);
  if (nav?.soon) return false;
  if (nav?.feature && !f[nav.feature]) return false;
  // υποσελίδες σελίδας με ανενεργή λειτουργία (π.χ. /admin/softone/…)
  const parentNav = ADMIN_NAV.flatMap((g) => g.items).filter((i) => i.feature && r.route.startsWith(`${i.href}/`));
  return !parentNav.some((i) => !f[i.feature!]);
}

/** Η ομάδα του μενού όπου ανήκει μια σελίδα (ή της γονικής της). */
export function groupOf(r: GenRoute): string {
  if (r.nav) return r.nav.group;
  const parent = GEN.routes.filter((x) => x.nav && r.route.startsWith(`${x.route}/`)).sort((a, b) => b.route.length - a.route.length)[0];
  return parent?.nav?.group ?? "Άλλες σελίδες";
}

export type SearchEntry = { kind: "page" | "topic" | "task" | "part"; title: string; text: string; href: string; where?: string };
/** Ευρετήριο αναζήτησης: σελίδες, άρθρα, «Πώς κάνω…», σημεία σελίδων — μόνο όσα βλέπει ο χρήστης. */
export function searchIndex(u: U, f: Partial<Features>): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const t of HELP_TOPICS) out.push({ kind: "topic", title: t.title, text: `${t.summary} ${(t.keywords ?? []).join(" ")}`, href: `/admin/help/t/${t.slug}` });
  for (const r of GEN.routes.filter((x) => canSee(x, u, f))) {
    const c = curatedFor(r.route);
    const title = c?.title ?? r.nav?.label ?? r.title;
    out.push({ kind: "page", title, text: `${c?.summary ?? r.doc} ${(c?.keywords ?? []).join(" ")}`, href: `/admin/help/p/${r.slug}`, where: groupOf(r) });
    for (const t of c?.tasks ?? []) out.push({ kind: "task", title: t.title, text: t.steps.join(" "), href: `/admin/help/p/${r.slug}#task-${encodeURIComponent(t.title)}`, where: title });
    for (const p of c?.parts ?? []) if (!r.dynamic) out.push({ kind: "part", title: p.title, text: p.text, href: `${r.route}?help=${p.key}`, where: title });
  }
  return out;
}
