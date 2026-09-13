import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { LoginForm } from "@/components/account/LoginForm";
import { getCustomerSession } from "@/lib/account/session";

export const metadata: Metadata = { title: "Σύνδεση" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const { email = "", next = "/logariasmos" } = await searchParams;
  if (await getCustomerSession()) redirect(next);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Σύνδεση" }]} />
      <div className="eu-canvas eu-gutter py-8 max-w-[520px]">
        <div className="rounded-3xl bg-white border border-eu-line p-6 @md:p-8 grid gap-4">
          <div><div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Λογαριασμός</div><h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Σύνδεση</h1></div>
          <LoginForm initialEmail={email} next={next.startsWith("/") ? next : "/logariasmos"} />
          <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Δεν έχεις λογαριασμό; Δημιουργείται αυτόματα με την πρώτη παραγγελία ή <Link href="/checkout" className="text-eu-blue underline">στο ταμείο</Link>.</p>
        </div>
      </div>
    </div>
  );
}
