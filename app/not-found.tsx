import Link from "next/link";
import Image from "@/components/ui/Image";
import { getSettings } from "@/lib/cms/settings-server";

export const metadata = { title: "Η σελίδα δεν βρέθηκε", robots: { index: false } };

/**
 * 404 για διευθύνσεις έξω από το shop (εκεί ισχύει το app/(shop)/not-found.tsx με header και αναζήτηση).
 * Ο Ερμής εδώ είναι μόνο περσόνα: μασκότ και κείμενο, χωρίς αναζήτηση ή συνομιλία. Με «Απόκρυψη του Ερμή» ουδέτερο κείμενο.
 */
export default async function NotFound() {
  const { advisor } = await getSettings();
  return (
    <>
      <header className="bg-eu-navy">
        <div className="eu-canvas eu-gutter flex items-center min-h-16">
          <Link href="/" aria-label="euronics, αρχική">
            <Image src="/design/logo-on-blue.svg" alt="euronics" width={132} height={34} priority className="h-[26px] @lg:h-[34px] w-auto" />
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 eu-canvas eu-gutter py-14 max-w-[640px] mx-auto text-center">
        {advisor.enabled && <Image src={advisor.avatar} alt="" width={110} height={232} className="mx-auto mb-4 eu-float drop-shadow-[0_18px_24px_rgba(18,42,88,.25)]" priority />}
        <div className="font-extrabold text-eu-yellow-ink text-[length:var(--fs-13-5)] tracking-wide mb-2">Σφάλμα 404</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-32)] leading-[1.1]">{advisor.enabled ? advisor.notFound.title : "Δεν βρήκαμε αυτή τη σελίδα"}</h1>
        <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-16)]">Ίσως ο σύνδεσμος άλλαξε ή η σελίδα αποσύρθηκε. Ξεκίνα από εδώ:</p>
        <nav className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Χρήσιμες σελίδες">
          {[["/", "Αρχική"], ["/prosfores", "Προσφορές"], ["/proionta", "Όλα τα προϊόντα"], ["/katastimata", "Καταστήματα"], ["/entopismos", "Παρακολούθηση παραγγελίας"]].map(([h, t]) => (
            <Link key={h} href={h} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-11 inline-flex items-center hover:bg-eu-surface">
              {t}
            </Link>
          ))}
        </nav>
      </main>
    </>
  );
}
