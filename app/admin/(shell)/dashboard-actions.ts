"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireStaff } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { ROLE_DEFAULTS } from "@/lib/dashboard/catalog";
import { allowedFor, resetRoleLayout, resetUserLayout, saveRoleLayout, saveUserLayout, userLayout } from "@/lib/dashboard/store";
import { normalizeLayout } from "@/lib/dashboard/catalog";
import { stable } from "@/lib/cms/list-diff";

/** Η διάταξη του dashboard του χρήστη (ζώνες, σειρά, μέγεθος, ποια components). */
export async function saveDashboardAction(layout: unknown): Promise<{ ok: boolean; saved: boolean }> {
  const user = await requireStaff();
  // τίποτα δεν άλλαξε → καμία εγγραφή (και καμία ανανέωση της σελίδας: την ανανεώνει ο ίδιος ο client όταν χρειάζεται)
  const cur = await userLayout(user);
  if (stable(normalizeLayout(layout, allowedFor(user))) === stable(cur.layout)) return { ok: true, saved: false };
  await saveUserLayout(user, layout);
  return { ok: true, saved: true };
}

export async function resetDashboardAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireStaff();
  await resetUserLayout(user);
  revalidatePath("/admin");
  return { ok: true, message: "Το dashboard γύρισε στην προεπιλογή του ρόλου σου." };
}

/** Όποιος διαχειρίζεται ρόλους ορίζει την προεπιλογή ενός ρόλου (ισχύει για όσους δεν έχουν αλλάξει το δικό τους). */
export async function saveRoleDashboardAction(role: string, layout: unknown): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("staff.roles.write");
  if (!(role in ROLE_DEFAULTS)) return { ok: false, message: "Άγνωστος ρόλος." };
  await saveRoleLayout(role, layout, user.id);
  await audit(user.id, "dashboard.role.save", "CmsDocument", `admin.dashboard.roles/${role}`, null, layout);
  return { ok: true, message: `Αποθηκεύτηκε ως προεπιλογή του ρόλου «${role}».` };
}

export async function resetRoleDashboardAction(role: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("staff.roles.write");
  await resetRoleLayout(role);
  await audit(user.id, "dashboard.role.reset", "CmsDocument", `admin.dashboard.roles/${role}`, null, null);
  return { ok: true, message: `Ο ρόλος «${role}» γύρισε στην αρχική προεπιλογή.` };
}
