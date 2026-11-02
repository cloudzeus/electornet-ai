import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accountCustomer, requireCustomer } from "@/lib/account/data";
import { ProfileForm, type EmailStatus } from "@/components/account/ProfileForm";

export const metadata: Metadata = { title: "Τα στοιχεία μου" };

const EMAIL_STATUS = new Set<EmailStatus>(["ok", "expired", "taken"]);

/**
 * /logariasmos/stoixeia — τα στοιχεία του πελάτη από τη βάση· οι αλλαγές μέσω του account API, με ιστορικό.
 * `?email=ok|expired|taken`: επιστροφή από τον σύνδεσμο επιβεβαίωσης νέου email (/api/account/email/confirm).
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ email?: string | string[] }> }) {
  const me = await requireCustomer("/logariasmos/stoixeia");
  const [c, sp] = await Promise.all([accountCustomer(me.id), searchParams]);
  if (!c) notFound();
  const raw = typeof sp.email === "string" ? (sp.email as EmailStatus) : null;
  const emailStatus = raw && EMAIL_STATUS.has(raw) ? raw : null;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Τα στοιχεία μου</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Πελάτης #{me.number} · μέλος από {new Date(c.memberSince).toLocaleDateString("el-GR", { month: "long", year: "numeric" })}</p>
      </div>
      <ProfileForm customer={c} hasPassword={!!c.hasPassword} emailStatus={emailStatus} />
    </div>
  );
}
