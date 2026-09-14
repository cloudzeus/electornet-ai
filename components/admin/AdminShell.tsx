import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { ADMIN_NAV } from "./nav";
import { can } from "@/lib/rbac/permissions";
import { signOut } from "@/lib/auth";
import { AdminNavLinks } from "./AdminNavLinks";
import { AdminTitle } from "./AdminTitle";
import { DensityToggle } from "./DensityToggle";

/**
 * Back-office frame: navy sidebar (groups filtered by the user's permissions),
 * top bar with the signed-in user and sign-out, content area on the grey
 * surface. Adaptive: sidebar becomes a top drawer below @3xl (handled in
 * AdminNavLinks).
 */
export function AdminShell({ user, children, title }: { user: { name?: string | null; email?: string | null; roles: string[]; permissions: string[] }; children: ReactNode; title?: string }) {
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => (i.superOnly ? user.roles.includes("super-admin") : can(user.permissions, i.perm))) })).filter((g) => g.items.length);
  return (
    <div className="eu-admin min-h-dvh grid grid-cols-1 @3xl:grid-cols-[260px_minmax(0,1fr)] bg-eu-surface eu-container">
      <aside className="bg-eu-navy text-white flex flex-col">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-white/10">
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={110} height={28} className="h-6 w-auto" />
          <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-2 py-0.5">Admin</span>
          <span className="ml-auto"><DensityToggle /></span>
        </div>
        <AdminNavLinks groups={groups.map((g) => ({ label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label, soon: i.soon })) }))} />
        <div className="mt-auto px-5 py-4 border-t border-white/10 text-[length:var(--fs-14)]">
          <div className="font-bold truncate">{user.name}</div>
          <div className="text-eu-on-dark-2 truncate">{user.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <span key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-[length:var(--fs-13)] font-semibold">
                {r}
              </span>
            ))}
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button type="submit" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-10 font-bold text-[length:var(--fs-14)]">
              <LogOut className="size-4" aria-hidden /> Αποσύνδεση
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex flex-col">
        <header className="bg-white border-b border-eu-line px-6 py-3 flex items-center justify-between gap-4">
          <AdminTitle fallback={title ?? "Διαχείριση"} />
          <Link href="/" className="text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline">
            Προβολή site →
          </Link>
        </header>
        <main className="p-6 grid gap-6 content-start">{children}</main>
      </div>
    </div>
  );
}
