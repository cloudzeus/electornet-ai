import Link from "next/link";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { HelpDrawer } from "./help/HelpDrawer";
import { HelpSpotlight } from "./help/HelpSpotlight";
import { LogOut, ExternalLink } from "lucide-react";
import { visibleNav } from "./nav";
import { getFeatures } from "@/lib/admin/features";
import { can } from "@/lib/rbac/permissions";
import { signOut } from "@/lib/auth";
import { AdminNavLinks } from "./AdminNavLinks";
import { AdminTitle } from "./AdminTitle";
import { DensityToggle } from "./DensityToggle";

/**
 * Back-office frame: navy sidebar (groups filtered by the user's permissions and the features enabled in Settings),
 * top bar with the signed-in user and sign-out, content area on the grey
 * surface. Adaptive: πλαϊνή στήλη από @5xl· κάτω από αυτό λεπτή μπάρα με συρτάρι μενού.
 */
export async function AdminShell({ user, children, title }: { user: { name?: string | null; email?: string | null; roles: string[]; permissions: string[] }; children: ReactNode; title?: string }) {
  // μόνο ό,τι επιτρέπουν τα δικαιώματα ΚΑΙ είναι ενεργό στις Ρυθμίσεις
  const groups = visibleNav(user, await getFeatures().catch(() => ({})), can);
  const navGroups = groups.map((g) => ({ label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label })) }));
  const userBlock = (
    <div data-private className="px-5 py-4 text-[length:var(--fs-14)]">
      <div className="font-bold truncate">{user.name}</div>
      <div className="text-eu-on-dark-2 truncate">{user.email}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {user.roles.map((r) => (
          <span key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-[length:var(--fs-13)] font-semibold">{r}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-11 font-bold text-[length:var(--fs-14)]">
            <LogOut className="size-4" aria-hidden /> Αποσύνδεση
          </button>
        </form>
        <DensityToggle />
      </div>
    </div>
  );
  return (
    <div className="eu-admin min-h-dvh grid grid-cols-1 @5xl:grid-cols-[clamp(15rem,13rem+4vw,18rem)_minmax(0,1fr)] bg-eu-surface eu-container">
      {/* μεγάλη οθόνη: πλαϊνή στήλη που μένει στη θέση της · κινητό / tablet: λεπτή μπάρα με «Μενού» (συρτάρι) */}
      <aside className="bg-eu-navy text-white flex flex-col">
        <div className="px-4 @5xl:px-5 min-h-14 @5xl:py-4 flex items-center gap-3 @5xl:border-b border-white/10">
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={110} height={28} className="h-6 w-auto shrink-0" />
          <span className="hidden @sm:inline rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-2 py-0.5">Admin</span>
          <span className="ml-auto @5xl:hidden min-w-0"><AdminNavLinks variant="drawer" groups={navGroups} footer={userBlock} /></span>
        </div>
        <div className="hidden @5xl:flex flex-col flex-1">
          <AdminNavLinks groups={navGroups} />
          <div className="mt-auto border-t border-white/10">{userBlock}</div>
        </div>
      </aside>
      <div className="min-w-0 flex flex-col">
        <header className="bg-white border-b border-eu-line px-4 @md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0"><AdminTitle fallback={title ?? "Διαχείριση"} /></div>
          <div className="shrink-0 flex items-center gap-2">
            <HelpDrawer />
            <Link href="/" className="shrink-0 inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 whitespace-nowrap">
              <ExternalLink className="size-4" aria-hidden /><span className="hidden @md:inline">Προβολή site</span>
            </Link>
          </div>
        </header>
        <main className="eu-container min-w-0 p-4 @md:p-6 grid gap-6 content-start">{children}</main>
        {/* «Δείξε μου» / σημεία βοήθειας / ?help=… πάνω σε κάθε σελίδα */}
        <Suspense fallback={null}><HelpSpotlight /></Suspense>
      </div>
    </div>
  );
}
