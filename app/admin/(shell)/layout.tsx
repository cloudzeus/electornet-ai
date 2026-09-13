import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "Διαχείριση", template: "%s · Διαχείριση euronics" }, robots: { index: false, follow: false } };

/** Every page in the shell requires a session; each page then checks its own permission. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
