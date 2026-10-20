import type { Metadata } from "next";
import { AuthForm } from "@/components/account/AuthForm";
import { safeNext } from "@/lib/security/safe-next";

export const metadata: Metadata = { title: "Εγγραφή" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = (await searchParams).next;
  // μόνο εσωτερικές διαδρομές (όχι «//άλλο-site», «/\άλλο-site», κωδικοποιημένες παραλλαγές)
  const next = safeNext(raw, "/logariasmos");
  return (
    <div className="eu-container">
      <div className="eu-canvas eu-gutter py-10 max-w-[560px]">
        <AuthForm mode="register" next={next} />
      </div>
    </div>
  );
}
