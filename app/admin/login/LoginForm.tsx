"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { requestOtp, type Step1State } from "./actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue disabled:opacity-70 inline-flex items-center justify-center gap-2">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} {children}
    </button>
  );
}

const field = "rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue";

/**
 * Σύνδεση προσωπικού σε δύο βήματα: κωδικός πρόσβασης, μετά 6ψήφιος κωδικός
 * που στέλνεται στο εταιρικό email. Το πρώτο βήμα δεν δημιουργεί συνεδρία.
 */
export function LoginForm({ challenge, signInAction, cancelAction }: {
  challenge: { id: string; maskedEmail: string; expiresAt: string } | null;
  signInAction: (fd: FormData) => Promise<void>;
  cancelAction: () => Promise<void>;
}) {
  const [state, action] = useActionState<Step1State, FormData>(requestOtp, {});
  const active = challenge ?? (state.sentTo ? { id: "", maskedEmail: state.sentTo, expiresAt: state.expiresAt ?? "" } : null);

  if (!active) {
    return (
      <form action={action} className="grid gap-4">
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Email
          <input name="email" type="email" required autoComplete="username" className={field} />
        </label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Κωδικός
          <input name="password" type="password" required autoComplete="current-password" className={field} />
        </label>
        {state.error && <p className="m-0 rounded-lg bg-eu-red/10 text-eu-red p-2 text-[length:var(--fs-14)] font-bold">{state.error}</p>}
        <Submit>Συνέχεια</Submit>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)] inline-flex items-start gap-1.5"><ShieldCheck className="size-4 shrink-0 mt-0.5" aria-hidden /> Θα σου στείλουμε κωδικό μιας χρήσης στο email σου.</p>
      </form>
    );
  }
  return <OtpStep masked={active.maskedEmail} expiresAt={active.expiresAt} signInAction={signInAction} cancelAction={cancelAction} />;
}

function OtpStep({ masked, expiresAt, signInAction, cancelAction }: { masked: string; expiresAt: string; signInAction: (fd: FormData) => Promise<void>; cancelAction: () => Promise<void> }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const mm = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : null;
  return (
    <form action={signInAction} className="grid gap-4">
      <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink inline-flex items-start gap-2">
        <Mail className="size-4 shrink-0 mt-0.5 text-eu-blue" aria-hidden />
        <span>Στείλαμε 6ψήφιο κωδικό στο <b>{masked}</b>.{mm && left! > 0 ? <> Ισχύει ακόμη <b className="tabular-nums">{mm}</b>.</> : left === 0 ? <> <b className="text-eu-red">Έληξε</b> — ζήτα καινούργιο.</> : null}</span>
      </p>
      <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
        Κωδικός μιας χρήσης
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus placeholder="000000" className="rounded-xl border-2 border-eu-line px-3 min-h-14 text-center tracking-[0.5em] font-extrabold text-[length:var(--fs-24)] outline-none focus:border-eu-blue" />
      </label>
      <Submit>Σύνδεση</Submit>
      <button type="submit" formAction={cancelAction} className="justify-self-center text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline bg-transparent border-0 cursor-pointer">
        Άλλος λογαριασμός
      </button>
    </form>
  );
}
