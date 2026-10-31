import type { ReactNode } from "react";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { CheckCircle2, PlayCircle, ShieldCheck, Store, Zap } from "lucide-react";
import { portalBase } from "@/lib/partner-portal/session";

/** Είσοδος / κωδικός: δύο στήλες στον υπολογιστή (μπλε πλευρά με το τι κερδίζει το μέλος), μία στο κινητό. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const base = await portalBase();
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-eu-navy text-white px-5 py-6 sm:px-10 sm:py-10 lg:py-14 flex flex-col gap-6 lg:gap-10">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-eu-blue/60 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 bottom-[-8rem] size-[22rem] rounded-full bg-eu-yellow/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={132} height={34} className="h-8 w-auto" />
          <span className="h-6 w-px bg-white/25" aria-hidden />
          <span className="font-bold text-eu-on-dark text-[length:var(--fs-14)]">Πύλη συνεργατών</span>
        </div>
        <div className="relative hidden sm:grid gap-4 max-w-[34rem] lg:mt-auto">
          <h1 className="m-0 font-heading font-extrabold text-[length:var(--fs-42)] leading-[1.05] text-balance">Το κατάστημά σου, <span className="text-eu-yellow">ζωντανά</span> στο euronics.gr.</h1>
          <p className="m-0 text-eu-on-dark text-[length:var(--fs-17)] leading-relaxed">Δήλωσε τα καταστήματά σου, σύνδεσε το σύστημά σου μία φορά και οι πελάτες βλέπουν τι υπάρχει στο ράφι σου — και το παραλαμβάνουν από εσένα.</p>
          <ul className="m-0 p-0 list-none grid gap-2.5 mt-2">
            {[[Store, "Τα καταστήματά σου στον χάρτη και στο checkout"], [Zap, "Διαθεσιμότητα από SoftOne, WooCommerce, XML ή Excel"], [CheckCircle2, "Οδηγός βήμα-βήμα με έλεγχο σε κάθε σημείο"], [ShieldCheck, "Διπλή επαλήθευση· μόνο ανάγνωση από το σύστημά σου"]].map(([I, t]) => {
              const Icon = I as typeof Store;
              return <li key={t as string} className="flex items-center gap-3 text-[length:var(--fs-15)]"><span className="grid place-items-center size-9 rounded-xl bg-white/10 text-eu-yellow shrink-0"><Icon className="size-5" aria-hidden /></span>{t as string}</li>;
            })}
          </ul>
          <Link href={`${base}/kalos-irthes`} className="mt-2 inline-flex items-center gap-2 self-start min-h-11 rounded-full bg-white/10 hover:bg-white/20 px-4 font-bold text-eu-yellow text-[length:var(--fs-15)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-yellow">
            <PlayCircle className="size-5" aria-hidden /> Δες την παρουσίαση (45″)
          </Link>
        </div>
        <p className="relative hidden lg:block m-0 text-eu-on-dark-2 text-[length:var(--fs-13)]">Euronics Ελλάς · Για βοήθεια μίλησε με τον υπεύθυνο συνεργατών της Euronics</p>
      </aside>
      <main id="main" className="flex items-start lg:items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-[28rem]">{children}</div>
      </main>
    </div>
  );
}
