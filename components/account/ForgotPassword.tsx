"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck, Eye, EyeOff, Loader2, RotateCcw, Check } from "lucide-react";

/**
 * @dynamic «Ξέχασα τον κωδικό» in three steps: email → 6-digit OTP (10 min,
 * resend after 60 s) → new password. The API never says whether an account
 * exists; the OTP is verified server-side with an attempt limit.
 */
type Step = "email" | "code" | "password" | "done";
const field = "w-full rounded-full border-2 border-eu-line px-4 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue bg-white";

export function ForgotPassword({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: "", b: "", show: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (!cooldown) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  type Resp = { ok: boolean; error?: string; token?: string; throttled?: boolean };
  const post = async (url: string, body: unknown): Promise<Resp> => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return (await r.json()) as Resp; };
  const request = async () => {
    setBusy(true); setErr(null);
    const j = await post("/api/account/password/forgot", { email }).catch((): Resp => ({ ok: false, error: "Κάτι πήγε στραβά." }));
    setBusy(false);
    if (!j.ok) return setErr(j.error ?? "Κάτι πήγε στραβά.");
    setStep("code"); setCooldown(60); setDigits(Array(6).fill("")); setTimeout(() => inputs.current[0]?.focus(), 50);
  };
  const verify = async (code = digits.join("")) => {
    if (code.length < 6) return;
    setBusy(true); setErr(null);
    const j = await post("/api/account/password/verify", { email, code }).catch((): Resp => ({ ok: false, error: "Κάτι πήγε στραβά." }));
    setBusy(false);
    if (!j.ok || !j.token) { setErr(j.error ?? "Λάθος κωδικός."); setDigits(Array(6).fill("")); inputs.current[0]?.focus(); return; }
    setToken(j.token); setStep("password");
  };
  const reset = async () => {
    if (pw.a !== pw.b) return setErr("Οι δύο κωδικοί δεν ταιριάζουν.");
    setBusy(true); setErr(null);
    const j = await post("/api/account/password/reset", { token, password: pw.a }).catch((): Resp => ({ ok: false, error: "Κάτι πήγε στραβά." }));
    setBusy(false);
    if (!j.ok) return setErr(j.error ?? "Κάτι πήγε στραβά.");
    setStep("done");
  };
  const onDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) { const next = Array(6).fill(""); clean.slice(0, 6).split("").forEach((ch, k) => (next[k] = ch)); setDigits(next); inputs.current[Math.min(5, clean.length - 1)]?.focus(); if (clean.length >= 6) verify(clean.slice(0, 6)); return; }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) inputs.current[i + 1]?.focus();
    if (clean && i === 5 && next.every(Boolean)) verify(next.join(""));
  };
  const strength = pw.a.length >= 8 && /[A-Za-zΑ-Ωα-ω]/.test(pw.a) && /\d/.test(pw.a);
  const steps: [Step, string][] = [["email", "Email"], ["code", "Κωδικός OTP"], ["password", "Νέος κωδικός"]];

  return (
    <div className="grid gap-5">
      <ol className="m-0 p-0 list-none flex items-center gap-2 text-[length:var(--fs-13)] font-bold">
        {steps.map(([k, l], i) => { const done = steps.findIndex((s) => s[0] === step) > i || step === "done"; const cur = step === k; return <li key={k} className="inline-flex items-center gap-1.5"><span className={`size-6 rounded-full grid place-items-center ${done ? "bg-eu-green text-white" : cur ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-muted"}`}>{done ? <Check className="size-3.5" aria-hidden /> : i + 1}</span><span className={cur ? "text-eu-ink" : "text-eu-muted"}>{l}</span>{i < 2 && <span className="w-6 h-px bg-eu-line mx-1" aria-hidden />}</li>; })}
      </ol>
      {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">{err}</p>}

      {step === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); request(); }} className="grid gap-3">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Γράψε το email του λογαριασμού σου. Θα σου στείλουμε έναν κωδικό 6 ψηφίων που ισχύει για 10 λεπτά.</p>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Email<span className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} pl-11`} /></span></label>
          <button type="submit" disabled={busy || !email} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 inline-flex items-center justify-center gap-2 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />} Στείλε μου κωδικό</button>
        </form>
      )}

      {step === "code" && (
        <div className="grid gap-3">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Αν υπάρχει λογαριασμός με το <b>{email}</b>, μόλις στείλαμε έναν κωδικό 6 ψηφίων. Έλεγξε και τα ανεπιθύμητα.</p>
          <div className="flex justify-between gap-2" role="group" aria-label="Κωδικός 6 ψηφίων">
            {digits.map((dg, i) => <input key={i} ref={(el) => { inputs.current[i] = el; }} inputMode="numeric" pattern="\d*" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} value={dg} onChange={(e) => onDigit(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus(); }} aria-label={`Ψηφίο ${i + 1}`} className="w-full max-w-14 aspect-[3/4] rounded-2xl border-2 border-eu-line text-center font-heading font-extrabold text-[length:var(--fs-24)] text-eu-navy outline-none focus:border-eu-blue bg-white" />)}
          </div>
          <button type="button" disabled={busy || digits.some((x) => !x)} onClick={() => verify()} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 inline-flex items-center justify-center gap-2 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />} Επιβεβαίωση</button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--fs-14)]">
            <button type="button" disabled={cooldown > 0 || busy} onClick={request} className="inline-flex items-center gap-1.5 font-bold text-eu-blue disabled:text-eu-muted"><RotateCcw className="size-4" aria-hidden /> {cooldown > 0 ? `Νέος κωδικός σε ${cooldown}s` : "Στείλε νέο κωδικό"}</button>
            <button type="button" onClick={() => { setStep("email"); setErr(null); }} className="font-bold text-eu-muted hover:text-eu-ink">Άλλο email</button>
          </div>
        </div>
      )}

      {step === "password" && (
        <form onSubmit={(e) => { e.preventDefault(); reset(); }} className="grid gap-3">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Ο κωδικός επιβεβαιώθηκε. Όρισε τον νέο κωδικό σου.</p>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Νέος κωδικός<span className="relative"><input type={pw.show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} className={`${field} pr-12`} /><button type="button" onClick={() => setPw({ ...pw, show: !pw.show })} aria-label={pw.show ? "Απόκρυψη" : "Εμφάνιση"} className="absolute right-2 top-1/2 -translate-y-1/2 size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface">{pw.show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button></span></label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Επανάληψη<input type={pw.show ? "text" : "password"} required autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} className={field} /></label>
          <ul className="m-0 p-0 list-none text-[length:var(--fs-13)] grid gap-0.5">{[["Τουλάχιστον 8 χαρακτήρες", pw.a.length >= 8], ["Γράμματα και αριθμοί", /[A-Za-zΑ-Ωα-ω]/.test(pw.a) && /\d/.test(pw.a)], ["Οι δύο κωδικοί ταιριάζουν", pw.a.length > 0 && pw.a === pw.b]].map(([l, ok]) => <li key={String(l)} className={`inline-flex items-center gap-1.5 ${ok ? "text-eu-green" : "text-eu-muted"}`}><Check className="size-3.5" aria-hidden /> {l}</li>)}</ul>
          <button type="submit" disabled={busy || !strength || pw.a !== pw.b} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 inline-flex items-center justify-center gap-2 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση κωδικού</button>
        </form>
      )}

      {step === "done" && (
        <div className="grid gap-3">
          <div className="rounded-2xl bg-eu-green/10 border border-eu-green/30 p-4 flex items-start gap-3"><span className="size-10 rounded-full bg-eu-green text-white grid place-items-center shrink-0"><Check className="size-5" aria-hidden /></span><div><b className="text-eu-ink">Ο κωδικός σου άλλαξε.</b><div className="text-eu-ink-2 text-[length:var(--fs-14)]">Σου στείλαμε και email επιβεβαίωσης. Αν δεν ήσουν εσύ, κάλεσέ μας στο 210 483 5143.</div></div></div>
          <button type="button" onClick={() => router.push(`/syndesi?email=${encodeURIComponent(email)}`)} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue">Σύνδεση με τον νέο κωδικό</button>
        </div>
      )}
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Για την ασφάλειά σου καταγράφουμε την IP και τη συσκευή κάθε αιτήματος επαναφοράς.</p>
    </div>
  );
}
