import { requirePermission } from "@/lib/rbac/guard";
import { failureBoard } from "@/lib/payments/events";
import { FailuresView, PERIOD_DAYS, type SP } from "./FailuresView";

export const metadata = { title: "Αποτυχημένες πληρωμές" };
export const dynamic = "force-dynamic";

/**
 * Παραγγελίες → Αποτυχημένες πληρωμές (ui-ux-pro-max, dataviz): πόσοι δοκίμασαν να πληρώσουν online και δεν τα κατάφεραν,
 * γιατί, και ποιοι αξίζουν ένα τηλέφωνο. Όλα τα φίλτρα είναι σύνδεσμοι (μένουν στη διεύθυνση). Τα δεδομένα έρχονται από το
 * ιστορικό πληρωμής (PaymentEvent), που γράφεται από τη στιγμή που ενεργοποιήθηκε· παλιότερες παραγγελίες δεν εμφανίζονται.
 */
export default async function PaymentFailuresPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("orders.read");
  const sp = await searchParams;
  return <FailuresView b={await failureBoard(PERIOD_DAYS(sp.d))} sp={sp} />;
}
