import type { Metadata } from "next";
import { accountConsents, requireCustomer } from "@/lib/account/data";
import { ConsentsForm } from "@/components/account/ConsentsForm";

export const metadata: Metadata = { title: "Ειδοποιήσεις & συγκαταθέσεις" };

/** /logariasmos/eidopoiiseis — από το μητρώο συναινέσεων· κάθε αλλαγή γράφει νέα εγγραφή (POST /api/account/consents). */
export default async function NotificationsPage() {
  const me = await requireCustomer("/logariasmos/eidopoiiseis");
  const consents = await accountConsents(me.id);
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Ειδοποιήσεις & συγκαταθέσεις</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Διάλεξε τι θέλεις να μαθαίνεις και από ποιο κανάλι. Οι ενημερώσεις παραγγελίας με email είναι απαραίτητες για την εκτέλεσή της.</p>
      </div>
      <ConsentsForm initial={consents} />
    </div>
  );
}
