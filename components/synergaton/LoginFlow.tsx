"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, MailCheck, RotateCcw } from "lucide-react";
import { loginStep1, loginStep2 } from "@/app/synergaton/actions";
import { btn, Callout, focusRing } from "./ui";
import { Field, inputCls } from "./wizard";

/** Είσοδος σε δύο βήματα: email + κωδικός → 6ψήφιος κωδικός από το email (επικόλληση, αυτόματη υποβολή στο 6ο ψηφίο). */
export function LoginFlow({ base }: { base: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"cred" | "otp">("cred");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === "otp") codeRef.current?.focus(); }, [step]);

  const submit1 = () => start(async () => {
    setErr(null);
    const r = await loginStep1(email, password);
    if (!r.ok) { setErr(r.error); return; }
    setChallenge({ id: r.challengeId, masked: r.maskedEmail }); setCode(""); setStep("otp");
  });
  const submit2 = (c = code) => start(async () => {
    if (!challenge) return;
    setErr(null);
    const r = await loginStep2(challenge.id, c);
    if (r.ok) { router.replace(base || "/"); router.refresh(); return; }
    setErr(r.error);
    if (r.restart) { setStep("cred"); setChallenge(null); }
    else setCode("");
  });

  return (
    <div className="grid gap-6">
      <div>
        <p className="m-0 text-eu-blue font-bold uppercase tracking-[0.08em] text-[length:var(--fs-12)]">{step === "cred" ? "Βήμα 1 από 2" : "Βήμα 2 από 2"}</p>
        <h1 className="m-0 mt-1 font-heading font-extrabold text-eu-ink text-[length:var(--fs-32)] leading-tight">{step === "cred" ? "Είσοδος" : "Έλεγξε το email σου"}</h1>
        <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">{step === "cred" ? "Με το email και τον κωδικό που όρισες από την πρόσκληση." : <>Στείλαμε 6ψήφιο κωδικό στο <b className="text-eu-ink">{challenge?.masked}</b>. Ισχύει 10 λεπτά.</>}</p>
      </div>
      {err && <Callout tone="bad">{err}</Callout>}
      {step === "cred" ? (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit1(); }} noValidate>
          <Field id="email" label="Email" required>
            <input id="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} required />
          </Field>
          <Field id="password" label="Κωδικός" required>
            <div className="relative">
              <input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls()} pr-12`} required />
              <button type="button" onClick={() => setShow((v) => !v)} className={`absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center size-10 rounded-lg text-eu-ink-3 hover:bg-eu-surface-2 ${focusRing}`} aria-label={show ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"} aria-pressed={show}>{show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}</button>
            </div>
          </Field>
          <button type="submit" disabled={pending || !email || !password} className={`${btn("primary", "lg")} w-full`}>{pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}Συνέχεια <ArrowRight className="size-5" aria-hidden /></button>
          <Link href={`${base}/xechasa`} className={`justify-self-center text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline rounded ${focusRing} min-h-11 inline-flex items-center`}>Ξέχασα τον κωδικό</Link>
        </form>
      ) : (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit2(); }}>
          <label htmlFor="otp" className="sr-only">Κωδικός 6 ψηφίων</label>
          <div className="relative">
            <input ref={codeRef} id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) submit2(v); }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-text" aria-describedby="otp-help" />
            <div className="grid grid-cols-6 gap-2 pointer-events-none" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={`grid place-items-center aspect-[4/5] rounded-xl border-2 bg-white font-heading font-extrabold text-eu-navy text-[length:var(--fs-28)] tabular-nums transition-colors ${i === code.length ? "border-eu-blue ring-[3px] ring-eu-blue/20" : code[i] ? "border-eu-navy" : "border-eu-line"}`}>{code[i] ?? ""}</span>
              ))}
            </div>
          </div>
          <p id="otp-help" className="m-0 flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-13)]"><MailCheck className="size-4" aria-hidden /> Δεν ήρθε; Κοίτα στα ανεπιθύμητα ή ξαναζήτησέ τον.</p>
          <button type="submit" disabled={pending || code.length !== 6} className={`${btn("primary", "lg")} w-full`}>{pending && <Loader2 className="size-5 animate-spin" aria-hidden />}Είσοδος</button>
          <button type="button" onClick={() => { setStep("cred"); setErr(null); }} className={`${btn("ghost")} justify-self-center`}><RotateCcw className="size-4" aria-hidden /> Νέος κωδικός</button>
        </form>
      )}
    </div>
  );
}
