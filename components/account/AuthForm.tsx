"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SocialLogin } from "@/components/checkout/SocialLogin";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("auth");

const input = "rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full outline-none focus-visible:ring-2 ring-eu-blue";
const label = "grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink";

/**
 * @dynamic Σύνδεση / εγγραφή πελάτη: email + κωδικός (πραγματικός λογαριασμός, /api/account/login · /register) ή
 * Google / Microsoft / Facebook / Apple. Μετά επιστρέφει στο `next` — π.χ. στη σελίδα του προϊόντος, όπου περιμένει
 * η συσκευή που φωτογράφισε ο πελάτης για να μπει στις «Συσκευές μου».
 */
export function AuthForm({ mode, next = "/logariasmos" }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [magic, setMagic] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = () => { router.push(next); router.refresh(); };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (magic) return;
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget), v = (k: string) => String(f.get(k) ?? "");
    try {
      const r = mode === "register"
        ? await fetch("/api/account/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: v("firstName"), lastName: v("lastName"), email: v("email"), mobile: v("mobile"), password: v("password"), acceptTerms: f.get("terms") === "on", source: next.includes("snap=") ? "snap" : "register" }) })
        : await fetch("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: v("email"), password: v("password") }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setErr(j.error ?? "Κάτι πήγε στραβά. Δοκίμασε ξανά."); return; }
      go();
    } catch { setErr("Σφάλμα δικτύου. Δοκίμασε ξανά."); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-eu-line p-6 grid gap-4">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{mode === "login" ? "Σύνδεση" : "Δημιουργία λογαριασμού"}</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">{mode === "login" ? "Με email και κωδικό, ή με σύνδεσμο μίας χρήσης στο email σου." : "Λίγα πεδία. Τα στοιχεία διεύθυνσης τα ζητάμε μόνο στην πρώτη παραγγελία."}</p>
      </div>
      {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">{err}</p>}
      <SocialLogin next={next} separator="after" />
      {mode === "register" && (
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {c.onoma} <input name="firstName" required className={input} autoComplete="given-name" />
          </label>
          <label className={label}>
            {c.eponymo} <input name="lastName" required className={input} autoComplete="family-name" />
          </label>
        </div>
      )}
      <label className={label}>
        Email <input name="email" type="email" required className={input} autoComplete="email" />
      </label>
      {mode === "register" && (
        <label className={label}>
          {c.kinito} <input name="mobile" type="tel" required className={input} autoComplete="tel" placeholder={c.tha_laveis_kodiko_epivevaiosis} />
        </label>
      )}
      {!magic && (
        <label className={label}>
          {c.kodikos} <input name="password" type="password" required minLength={8} className={input} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
      )}
      {mode === "login" && (
        <div className="flex justify-between text-[length:var(--fs-14)]">
          <label className="flex items-center gap-2 text-eu-ink-2 cursor-pointer">
            <input type="checkbox" className="size-4 accent-eu-blue" /> {c.na_me_thymasai}
          </label>
          <button type="button" onClick={() => setMagic((m) => !m)} className="text-eu-blue font-semibold hover:underline">
            {magic ? "Με κωδικό" : "Ξέχασα τον κωδικό / σύνδεσμος στο email"}
          </button>
        </div>
      )}
      {mode === "register" && (
        <label className="flex items-start gap-2 text-[length:var(--fs-14)] text-eu-ink-2 cursor-pointer">
          <input name="terms" type="checkbox" required className="mt-0.5 size-4 accent-eu-blue" />
          <span>
            Αποδέχομαι τους{" "}
            <Link href="/oroi-chrisis" className="text-eu-blue underline">
              {c.oroys}
            </Link>{" "}
            και την{" "}
            <Link href="/aporrito" className="text-eu-blue underline">
              {c.politiki_aporritoy}
            </Link>
            .
          </span>
        </label>
      )}
      <button type="submit" disabled={busy} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] py-3 min-h-12 hover:bg-eu-blue disabled:opacity-60">
        {busy ? "…" : mode === "login" ? (magic ? "Στείλε μου σύνδεσμο" : "Σύνδεση") : "Εγγραφή"}
      </button>
      {mode === "register" && (
        <p className="m-0 text-center text-eu-muted text-[length:var(--fs-14)]">
          Έχεις ήδη λογαριασμό;{" "}
          <Link href={`/eisodos${next !== "/logariasmos" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-eu-blue underline">
            {c.syndesi}
          </Link>
        </p>
      )}
    </form>
  );
}
