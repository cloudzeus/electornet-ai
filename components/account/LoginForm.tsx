"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { SocialLogin } from "@/components/checkout/SocialLogin";

/** @dynamic Customer login (email + password). Social providers reuse the checkout component; every attempt is logged with evidence. */
export function LoginForm({ initialEmail = "", next = "/logariasmos" }: { initialEmail?: string; next?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ email: initialEmail, password: "", show: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "w-full rounded-full border-2 border-eu-line px-4 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue bg-white";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/account/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email, password: f.password }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) return setErr(j.error ?? "Λάθος email ή κωδικός.");
      router.push(next); router.refresh();
    } catch { setErr("Κάτι πήγε στραβά. Δοκίμασε ξανά."); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
      {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">{err}</p>}
      <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Email<input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} /></label>
      <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between">Κωδικός<Link href={`/ksexasa-kodiko${f.email ? `?email=${encodeURIComponent(f.email)}` : ""}`} className="font-bold text-eu-blue hover:underline">Ξέχασα τον κωδικό</Link></span><span className="relative"><input type={f.show ? "text" : "password"} required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={`${field} pr-12`} /><button type="button" onClick={() => setF({ ...f, show: !f.show })} aria-label={f.show ? "Απόκρυψη" : "Εμφάνιση"} className="absolute right-2 top-1/2 -translate-y-1/2 size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface">{f.show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button></span></label>
      <button type="submit" disabled={busy} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 inline-flex items-center justify-center gap-2 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />} Σύνδεση</button>
      <div className="relative text-center text-eu-muted text-[length:var(--fs-13)] before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-eu-line"><span className="relative bg-white px-2">ή</span></div>
      <SocialLogin />
    </form>
  );
}
