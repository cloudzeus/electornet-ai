import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "./permissions";

/** Current back-office session or redirect to login. */
export async function requireStaff() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  return session.user;
}

/** Session with the given permission, else 403 page. */
export async function requirePermission(key: string) {
  const user = await requireStaff();
  if (!can(user.permissions, key)) redirect(`/admin/forbidden?need=${encodeURIComponent(key)}`);
  return user;
}

export function hasPermission(user: { permissions: string[] } | null | undefined, key: string) {
  return !!user && can(user.permissions, key);
}
