import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";

export const metadata = { title: "Διαγραφή από το newsletter", robots: { index: false, follow: false } };

/**
 * Διαγραφή από το newsletter προσφορών: το GET του συνδέσμου του email έρχεται εδώ και δεν διαγράφει τίποτα.
 * Η διαγραφή γίνεται με απλή φόρμα POST (δουλεύει και χωρίς JS) που επιστρέφει εδώ με ?done=1.
 * Το token δεν ελέγχεται ποτέ ώστε να μη φαίνεται αν υπάρχει.
 */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const [{ token }, { done }] = await Promise.all([params, searchParams]);
  const isDone = done === "1";
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Newsletter", href: "/newsletter" }, { label: "Διαγραφή" }]} />
      <PageIntro
        tone="blue"
        kicker="Newsletter"
        title={isDone ? "Διαγραφήκατε από το newsletter" : "Διαγραφή από το newsletter"}
        lead={isDone ? "Δεν θα λαμβάνετε πια προσφορές με email από εμάς. Μπορείτε να ξαναγραφτείτε όποτε θέλετε." : "Θέλετε να σταματήσετε να λαμβάνετε προσφορές με email από τη Euronics;"}
      />
      <div className="eu-canvas eu-gutter py-8 max-w-[640px]">
        {isDone ? (
          <p role="status" className="m-0 text-[length:var(--fs-15)]">Η διαγραφή σας καταχωρήθηκε. Τα email για παραγγελίες και υπηρεσίες δεν επηρεάζονται. <Link href="/newsletter" className="text-eu-blue underline">Επανεγγραφή</Link></p>
        ) : (
          <form method="post" action={`/api/newsletter/u/${encodeURIComponent(token)}`}>
            <p className="m-0 mb-4 text-eu-muted text-[length:var(--fs-15)]">Με το κουμπί παρακάτω διαγράφεστε αμέσως. Τα email για παραγγελίες και υπηρεσίες δεν επηρεάζονται.</p>
            <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-11 md:min-h-9 hover:bg-eu-blue">Διαγραφή από το newsletter</button>
          </form>
        )}
        <p className="m-0 mt-6 text-eu-muted text-[length:var(--fs-14)]">Τα στοιχεία σας τα επεξεργάζεται η MEGA ELECTRICS ΑΕΒΕ (Euronics). <Link href="/aporrito" className="text-eu-blue underline">Πολιτική Απορρήτου</Link>.</p>
      </div>
    </div>
  );
}
