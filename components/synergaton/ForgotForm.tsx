"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { forgotPassword } from "@/app/synergaton/actions";
import { btn, Callout } from "./ui";
import { Field, inputCls } from "./wizard";

export function ForgotForm({ base }: { base: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent) return (
    <div className="grid gap-4">
      <Callout tone="good" title="Αν υπάρχει λογαριασμός με αυτό το email, το link είναι καθ' οδόν.">Ισχύει 1 ώρα και χρησιμοποιείται μία φορά. Κοίτα και στα ανεπιθύμητα.</Callout>
      <Link href={`${base}/eisodos`} className={btn("secondary", "lg")}>Πίσω στην είσοδο</Link>
    </div>
  );
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await forgotPassword(email); if (r.ok) setSent(true); else setErr(r.error); }); }} noValidate>
      {err && <Callout tone="bad">{err}</Callout>}
      <Field id="email" label="Email λογαριασμού" required help="Θα λάβεις link για νέο κωδικό.">
        <input id="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} />
      </Field>
      <button type="submit" disabled={pending || !email} className={`${btn("primary", "lg")} w-full`}>{pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <MailCheck className="size-5" aria-hidden />}Στείλε μου link</button>
      <Link href={`${base}/eisodos`} className={`${btn("ghost")} justify-self-center`}>Πίσω στην είσοδο</Link>
    </form>
  );
}
