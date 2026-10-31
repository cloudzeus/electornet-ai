import Link from "next/link";
import { checkLink } from "@/lib/partner-portal/auth";
import { portalBase } from "@/lib/partner-portal/session";
import { SetPassword } from "@/components/synergaton/SetPassword";
import { btn, Callout, fmtDateTime } from "@/components/synergaton/ui";

export const metadata = { title: "Ορισμός κωδικού" };
export const dynamic = "force-dynamic";

const WHY = { missing: "Το link δεν είναι έγκυρο. Ίσως αντιγράφηκε μισό.", used: "Το link έχει ήδη χρησιμοποιηθεί ή αντικαταστάθηκε από νεότερο.", expired: "Το link έληξε." };

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = await portalBase();
  const l = await checkLink(token);
  if (!l.ok) {
    return (
      <div className="grid gap-5">
        <h1 className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-32)]">Το link δεν ισχύει</h1>
        <Callout tone="warn" title={WHY[l.reason]}>Ζήτησε νέο link — έρχεται στο email σου σε λίγα δευτερόλεπτα.</Callout>
        <Link href={`${base}/xechasa`} className={btn("primary", "lg")}>Νέο link</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div>
        <p className="m-0 text-eu-blue font-bold uppercase tracking-[0.08em] text-[length:var(--fs-12)]">{l.partner}</p>
        <h1 className="m-0 mt-1 font-heading font-extrabold text-eu-ink text-[length:var(--fs-32)] leading-tight">{l.purpose === "set" ? `Καλώς ήρθες, ${l.name.split(" ")[0]}` : "Νέος κωδικός"}</h1>
        <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">{l.purpose === "set" ? "Όρισε τον κωδικό σου για την πύλη συνεργατών." : "Διάλεξε νέο κωδικό· οι άλλες συνδεδεμένες συσκευές θα αποσυνδεθούν."} Λογαριασμός: <b className="text-eu-ink break-all">{l.email}</b> · το link ισχύει έως {fmtDateTime(l.expiresAt)}.</p>
      </div>
      <SetPassword token={token} email={l.email} base={base} />
    </div>
  );
}
