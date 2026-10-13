import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { OrderTimeline } from "@/components/account/OrderTimeline";
import { trackOrder } from "@/lib/account/data";

export const metadata: Metadata = { title: "Παρακολούθηση παραγγελίας", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Δημόσιος εντοπισμός: αριθμός παραγγελίας + κινητό ή email της παραγγελίας (χωρίς λογαριασμό), με το widget
 * παρακολούθησης του courier. Το email «Η παραγγελία στάλθηκε» ανοίγει εδώ με τον αριθμό συμπληρωμένο.
 */
export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ no?: string; contact?: string }> }) {
  const { no, contact } = await searchParams;
  const order = no && contact ? await trackOrder(no, contact) : null;
  const needContact = !!no && !contact;
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Παρακολούθηση παραγγελίας" }]} />
      <PageIntro kicker="Εξυπηρέτηση" title="Παρακολούθηση παραγγελίας" lead="Δώσε τον αριθμό παραγγελίας και το κινητό ή το email σου. Δεν χρειάζεται λογαριασμός." />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @lg:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
        <form action="/entopismos" className="bg-eu-surface rounded-xl p-5 grid gap-3">
          <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink">
            Αριθμός παραγγελίας
            <input name="no" required defaultValue={no ?? ""} placeholder="EUR-20261013-0001" autoCapitalize="characters" className="rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)]" />
          </label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink">
            Κινητό ή email
            <input name="contact" required autoFocus={needContact} autoComplete="tel" defaultValue={contact ?? ""} placeholder="69xxxxxxxx ή email" className="rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)]" />
          </label>
          <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 hover:bg-eu-blue">
            Αναζήτηση
          </button>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Ο αριθμός είναι στο email επιβεβαίωσης. Χρησιμοποίησε το κινητό ή το email που έδωσες στην παραγγελία.</p>
        </form>
        <div>
          {order ? (
            <div className="bg-white rounded-xl border border-eu-line p-5">
              <OrderTimeline order={order} />
            </div>
          ) : needContact ? (
            <div className="bg-eu-surface rounded-xl p-5 text-eu-ink-2 text-[length:var(--fs-15)]">
              Για την παραγγελία <b className="text-eu-ink">{no}</b> συμπλήρωσε και το κινητό ή το email σου — έτσι μόνο εσύ βλέπεις τα στοιχεία της.
            </div>
          ) : no ? (
            <div role="alert" className="bg-eu-surface rounded-xl p-5 text-eu-ink-2 text-[length:var(--fs-15)]">
              Δεν βρέθηκε παραγγελία με αυτόν τον αριθμό και αυτό το κινητό/email. Έλεγξε το email επιβεβαίωσης ή κάλεσε στο{" "}
              <a href="tel:2104835143" className="text-eu-blue underline">
                210 483 5143
              </a>
              .
            </div>
          ) : (
            <div className="bg-eu-surface rounded-xl p-5 text-eu-ink-2 text-[length:var(--fs-15)]">
              Έχεις λογαριασμό;{" "}
              <Link href="/logariasmos/paraggelies" className="text-eu-blue underline">
                Δες όλες τις παραγγελίες σου
              </Link>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
