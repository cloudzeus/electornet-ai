import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { db } from "@/lib/db";
import { onboardingOf } from "@/lib/partner-portal/data";
import type { SetupAdvice } from "@/lib/partner-portal/ai";
import { NewConnection } from "@/components/synergaton/connection/NewConnection";
import { PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Νέα σύνδεση" };

export default async function NewConnectionPage() {
  const u = await requirePortalUser();
  const base = await portalBase();
  const stores = await db.store.findMany({ where: { partnerId: u.partner.id }, orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true } });
  const advice = (onboardingOf(u.partner.onboarding).advice ?? null) as SetupAdvice | null;
  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Απόθεμα" title="Νέα σύνδεση" sub="Διαλέξτε πώς θα μας στέλνετε το απόθεμα και για ποια καταστήματα. Αλλάζει αργότερα." />
      <div data-help="portal.new-connection"><NewConnection stores={stores} advice={advice} base={base} /></div>
    </div>
  );
}
