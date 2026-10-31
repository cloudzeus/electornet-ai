import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { onboardingOf } from "@/lib/partner-portal/data";
import { db } from "@/lib/db";
import type { SetupAdvice } from "@/lib/partner-portal/ai";
import { Questionnaire } from "@/components/synergaton/Questionnaire";
import { Callout, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Ξεκίνημα" };

export default async function StartPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const { welcome } = await searchParams;
  const ob = onboardingOf(u.partner.onboarding);
  const stores = await db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true } });
  const answers = Object.fromEntries(Object.entries(ob.answers ?? {}).map(([k, v]) => [k, String(v)]));
  return (
    <div className="grid gap-5 min-w-0" data-help="portal.start">
      <PageHead eyebrow="Αρχικοποίηση" title="Ξεκίνημα σε 2 λεπτά" sub="Απαντήστε σε 10 σύντομες ερωτήσεις. Ο βοηθός προτείνει τον πιο εύκολο τρόπο να μας στέλνετε τη διαθεσιμότητα και σας οδηγεί βήμα-βήμα." />
      {welcome && <Callout tone="good" title="Ο κωδικός σας ορίστηκε — καλώς ήρθατε!">Ξεκινήστε από το ερωτηματολόγιο· μπορείτε να το αλλάξετε όποτε θέλετε.</Callout>}
      <Questionnaire base={base} initial={answers} storeIds={stores.map((s) => s.id)} savedAdvice={(ob.advice as SetupAdvice | null) ?? null} />
    </div>
  );
}
