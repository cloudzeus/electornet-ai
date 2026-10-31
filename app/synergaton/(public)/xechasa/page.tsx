import { portalBase } from "@/lib/partner-portal/session";
import { ForgotForm } from "@/components/synergaton/ForgotForm";

export const metadata = { title: "Ξέχασα τον κωδικό" };

export default async function ForgotPage() {
  const base = await portalBase();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-32)] leading-tight">Ξέχασα τον κωδικό</h1>
        <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">Γράψε το email του λογαριασμού σου στην πύλη.</p>
      </div>
      <ForgotForm base={base} />
    </div>
  );
}
