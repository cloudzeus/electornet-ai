import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accountCustomer, requireCustomer } from "@/lib/account/data";
import { ProfileForm } from "@/components/account/ProfileForm";

export const metadata: Metadata = { title: "Τα στοιχεία μου" };

/** /logariasmos/stoixeia — τα στοιχεία του πελάτη από τη βάση· οι αλλαγές μέσω του account API, με ιστορικό. */
export default async function ProfilePage() {
  const me = await requireCustomer("/logariasmos/stoixeia");
  const c = await accountCustomer(me.id);
  if (!c) notFound();
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Τα στοιχεία μου</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Πελάτης #{me.number} · μέλος από {new Date(c.memberSince).toLocaleDateString("el-GR", { month: "long", year: "numeric" })}</p>
      </div>
      <ProfileForm customer={c} />
    </div>
  );
}
