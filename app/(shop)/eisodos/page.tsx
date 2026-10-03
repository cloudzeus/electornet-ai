import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/account/AuthForm";
import { SOCIAL_ERRORS } from "@/lib/account/social";

export const metadata: Metadata = { title: "Σύνδεση" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const raw = sp.next ?? "";
  const error = sp.error && SOCIAL_ERRORS[sp.error as keyof typeof SOCIAL_ERRORS];
  // μόνο εσωτερικές διαδρομές (όχι «//άλλο-site»)
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/logariasmos";
  return (
    <div className="eu-container">
      <div className="eu-canvas eu-gutter py-10 grid grid-cols-1 @lg:grid-cols-2 gap-8 items-start max-w-[980px]">
        <div className="grid gap-3">
          {error && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-4 py-3">{error}</p>}
          <AuthForm mode="login" next={next} />
        </div>
        <aside className="bg-eu-surface rounded-xl p-6">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-2">Δεν έχεις λογαριασμό;</h2>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">Παρακολούθηση παραγγελιών, εγγυήσεις, επιστροφές και λίστα σε όλες τις συσκευές. Η αγορά ως επισκέπτης παραμένει διαθέσιμη.</p>
          <Link href={next !== "/logariasmos" ? `/eggrafi?next=${encodeURIComponent(next)}` : "/eggrafi"} className="inline-flex mt-4 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 items-center hover:bg-eu-blue">
            Δημιουργία λογαριασμού
          </Link>
          <p className="m-0 mt-5 text-eu-muted text-[length:var(--fs-14)]">
            Έχεις παραγγελία ως επισκέπτης;{" "}
            <Link href="/entopismos" className="text-eu-blue underline">
              Παρακολούθησέ την εδώ
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
