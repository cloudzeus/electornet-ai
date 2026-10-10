import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac/permissions";
import { getFeatures } from "@/lib/admin/features";
import { codeDefault, normalizeLayout, primaryRole, WIDGETS, type DashLayout } from "./catalog";

/**
 * Πού φυλάσσονται οι διατάξεις (CmsDocument, χωρίς αλλαγή στη βάση):
 *   «admin.dashboard»/<staffId>        η διάταξη του χρήστη (αφού την αλλάξει)
 *   «admin.dashboard.roles»/<roleKey>  η προεπιλογή του ρόλου (ορίζεται από όποιον διαχειρίζεται ρόλους)
 * Χωρίς αυτές ισχύει η προεπιλογή του κώδικα (lib/dashboard/catalog → ROLE_DEFAULTS).
 */
const W = (collection: string, key: string) => ({ collection_key_locale: { collection, key, locale: "el" } });
type U = { id: string; roles: string[]; permissions: string[] };

/** Τι επιτρέπεται στον χρήστη (ανεξάρτητα από τη διάταξη: κάθε φορά ξαναελέγχεται). */
export const allowedFor = (u: U, features: Partial<Record<string, boolean>> = {}) => (id: string) => {
  const w = WIDGETS.find((x) => x.id === id);
  if (!w) return false;
  if (w.feature && !features[w.feature]) return false; // ανενεργό στις Ρυθμίσεις
  if (w.superOnly) return u.roles.includes("super-admin");
  return !w.perms.length || w.perms.some((p) => can(u.permissions, p));
};

async function read(collection: string, key: string) {
  const d = await db.cmsDocument.findUnique({ where: W(collection, key), select: { data: true } }).catch(() => null);
  return d?.data ?? null;
}
async function write(collection: string, key: string, data: unknown, by: string) {
  const json = data as Prisma.InputJsonValue;
  await db.cmsDocument.upsert({ where: W(collection, key), update: { data: json, updatedBy: by, version: { increment: 1 } }, create: { collection, key, locale: "el", data: json, updatedBy: by } });
}

/** Η προεπιλογή του ρόλου (της βάσης ή του κώδικα). */
export async function roleLayout(role: string): Promise<{ layout: DashLayout; custom: boolean }> {
  const saved = await read("admin.dashboard.roles", role);
  return saved ? { layout: normalizeLayout(saved), custom: true } : { layout: codeDefault(role), custom: false };
}

/** Η διάταξη που βλέπει ο χρήστης: η δική του, αλλιώς του ρόλου του — πάντα φιλτραρισμένη με τα δικαιώματά του. */
export async function userLayout(u: U): Promise<{ layout: DashLayout; source: "user" | "role" | "code"; role: string }> {
  const role = primaryRole(u.roles);
  const allowed = allowedFor(u, await getFeatures().catch(() => ({})));
  const mine = await read("admin.dashboard", u.id);
  if (mine) return { layout: normalizeLayout(mine, allowed), source: "user", role };
  const r = await roleLayout(role);
  return { layout: normalizeLayout(r.layout, allowed), source: r.custom ? "role" : "code", role };
}

export const saveUserLayout = async (u: U, layout: unknown) => write("admin.dashboard", u.id, normalizeLayout(layout, allowedFor(u, await getFeatures().catch(() => ({})))), u.id);
export async function resetUserLayout(u: U) { await db.cmsDocument.deleteMany({ where: { collection: "admin.dashboard", key: u.id, locale: "el" } }); }
export const saveRoleLayout = (role: string, layout: unknown, by: string) => write("admin.dashboard.roles", role, normalizeLayout(layout), by);
export async function resetRoleLayout(role: string) { await db.cmsDocument.deleteMany({ where: { collection: "admin.dashboard.roles", key: role, locale: "el" } }); }
