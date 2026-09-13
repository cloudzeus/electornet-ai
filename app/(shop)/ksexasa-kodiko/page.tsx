import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ForgotPassword } from "@/components/account/ForgotPassword";
import { getSettings } from "@/lib/cms/settings";

export const metadata: Metadata = { title: "Ξέχασα τον κωδικό μου" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  const { advisor } = await getSettings();
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Ο λογαριασμός μου", href: "/logariasmos" }, { label: "Ξέχασα τον κωδικό" }]} />
      <div className="eu-canvas eu-gutter py-8 grid grid-cols-1 @3xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-8 items-start">
        <div className="rounded-3xl bg-white border border-eu-line p-6 @md:p-8 grid gap-4">
          <div><div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Λογαριασμός</div><h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Ξέχασα τον κωδικό μου</h1></div>
          <ForgotPassword initialEmail={email} />
        </div>
        <aside className="hidden @3xl:flex items-start gap-4 rounded-3xl bg-eu-navy text-white p-6 relative overflow-hidden"><span className="eu-ambient" aria-hidden /><Image src={advisor.avatarHead} alt="" width={72} height={72} className="relative rounded-full size-[72px] object-cover shrink-0 ring-4 ring-eu-yellow" /><div className="relative"><div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] uppercase tracking-wide">{advisor.name}</div><p className="m-0 mt-1 font-heading font-bold text-[length:var(--fs-20)] leading-tight">Ένα λεπτό και είσαι ξανά μέσα.</p><p className="m-0 mt-2 text-eu-on-dark-2 text-[length:var(--fs-15)]">Ο κωδικός μιας χρήσης έρχεται στο email σου και ισχύει 10 λεπτά. Δεν θα σου ζητήσουμε ποτέ κωδικό τηλεφωνικά.</p></div></aside>
      </div>
    </div>
  );
}
