import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { auth, signIn } from "@/lib/auth";
import { currentChallenge, cancelChallenge } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Σύνδεση" };

/** Σύνδεση διαχείρισης σε δύο βήματα (κωδικός → OTP στο email). */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/admin");
  const [{ error }, challenge] = await Promise.all([searchParams, currentChallenge()]);

  async function signInAction(fd: FormData) {
    "use server";
    const id = (await cookies()).get("eu_admin_chal")?.value;
    if (!id) redirect("/admin/login?error=expired");
    try {
      await signIn("credentials", { challengeId: id, code: fd.get("code"), redirectTo: "/admin" });
    } catch (e) {
      if (e instanceof AuthError) redirect("/admin/login?error=otp");
      throw e;
    }
  }
  async function cancelAction() {
    "use server";
    await cancelChallenge();
    redirect("/admin/login");
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-eu-navy p-6 eu-container">
      <div className="w-full max-w-[420px] bg-white rounded-3xl p-8 grid gap-4 shadow-[var(--shadow-overlay)]">
        <div className="flex items-center gap-3">
          <Image src="/design/logo.svg" alt="euronics" width={120} height={30} className="h-7 w-auto" />
          <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] px-2 py-0.5">Admin</span>
        </div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">Σύνδεση στη διαχείριση</h1>
        {error && <p className="m-0 rounded-lg bg-eu-red/10 text-eu-red p-2 text-[length:var(--fs-14)] font-bold">{error === "expired" ? "Η προσπάθεια έληξε. Ξεκίνα από την αρχή." : "Λάθος ή ληγμένος κωδικός μιας χρήσης."}</p>}
        <LoginForm challenge={challenge} signInAction={signInAction} cancelAction={cancelAction} />
      </div>
    </div>
  );
}
