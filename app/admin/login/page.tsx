import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";

export const metadata = { title: "Σύνδεση" };

/** Back-office login (credentials). SSO buttons can be added as providers in lib/auth.ts. */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/admin");
  const { error } = await searchParams;
  return (
    <div className="min-h-dvh grid place-items-center bg-eu-navy p-6 eu-container">
      <form
        action={async (fd) => {
          "use server";
          try {
            await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/admin" });
          } catch (e) {
            if (e instanceof AuthError) redirect("/admin/login?error=1");
            throw e;
          }
        }}
        className="w-full max-w-[420px] bg-white rounded-3xl p-8 grid gap-4 shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-3">
          <Image src="/design/logo.svg" alt="euronics" width={120} height={30} className="h-7 w-auto" />
          <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-2 py-0.5">Admin</span>
        </div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Σύνδεση στη διαχείριση</h1>
        {error && <p className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">Λάθος email ή κωδικός.</p>}
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Email
          <input name="email" type="email" required autoComplete="username" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
        </label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Κωδικός
          <input name="password" type="password" required autoComplete="current-password" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
        </label>
        <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue">
          Σύνδεση
        </button>
        <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Demo: admin@euronics.gr / admin1234</p>
      </form>
    </div>
  );
}
