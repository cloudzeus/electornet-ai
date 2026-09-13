import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { NewsletterForm } from "@/components/widgets/NewsletterForm";
import { activeConsentText } from "@/lib/gdpr/consent";

export const metadata = { title: "Newsletter" };

/** Landing for confirm / unsubscribe links and a plain signup form. */
export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const consentText = (await activeConsentText("newsletter").catch(() => null))?.text ?? "Συμφωνώ να λαμβάνω newsletter από τη Euronics.";
  const msg = ok === "confirmed" ? { t: "Η εγγραφή σου επιβεβαιώθηκε", d: "Ευχαριστούμε! Θα λαμβάνεις ένα email την εβδομάδα με τις πραγματικές προσφορές." } : ok === "already" ? { t: "Είσαι ήδη εγγεγραμμένος", d: "Δεν χρειάζεται να κάνεις κάτι άλλο." } : ok === "unsubscribed" ? { t: "Διαγράφηκες από το newsletter", d: "Δεν θα ξαναλάβεις εμπορική επικοινωνία από εμάς. Μπορείς να ξαναγραφτείς όποτε θέλεις." } : ok === "invalid" ? { t: "Ο σύνδεσμος δεν ισχύει", d: "Ίσως έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Κάνε νέα εγγραφή παρακάτω." } : null;
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Newsletter" }]} />
      <PageIntro tone="blue" kicker="Newsletter" title={msg?.t ?? "Μάθε πρώτος τις πραγματικές προσφορές"} lead={msg?.d ?? "Ένα email την εβδομάδα. Διαγραφή με ένα κλικ, όποτε θέλεις."} />
      <div className="eu-canvas eu-gutter py-8 max-w-[640px]">
        {ok !== "confirmed" && ok !== "already" && <NewsletterForm consentText={consentText} labels={{ email: "Το email σου", submit: "Εγγραφή", privacy: "Πολιτική Απορρήτου" }} />}
        <p className="m-0 mt-4 text-eu-muted text-[length:var(--fs-14)]">Τα στοιχεία σου τα επεξεργάζεται η MEGA ELECTRICS ΑΕΒΕ (Euronics) μόνο για την αποστολή newsletter. <Link href="/aporrito" className="text-eu-blue underline">Πολιτική Απορρήτου</Link>.</p>
      </div>
    </div>
  );
}
