import type { Metadata } from "next";
import { AuthForm } from "@/components/account/AuthForm";
import { safeNext } from "@/lib/security/safe-next";

export const metadata: Metadata = { title: "Εγγραφή" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; verify?: string }> }) {
  const sp = await searchParams, raw = sp.next;
  // μόνο εσωτερικές διαδρομές (όχι «//άλλο-site», «/\άλλο-site», κωδικοποιημένες παραλλαγές)
  const next = safeNext(raw, "/logariasmos");
  return (
    <div className="eu-container">
      <div className="eu-canvas eu-gutter py-10 max-w-[560px] grid gap-3">
        {sp.verify === "expired" && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-4 py-3">Ο σύνδεσμος επιβεβαίωσης έληξε ή δεν είναι σωστός. Συμπλήρωσε ξανά τα στοιχεία σου για να σου στείλουμε νέο.</p>}
        <AuthForm mode="register" next={next} />
      </div>
    </div>
  );
}
