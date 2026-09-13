"use client";

import { useEffect, useState } from "react";
import { Mail, Check, Loader2, X } from "lucide-react";
import { useCart } from "./CartProvider";

/**
 * @dynamic «Στείλε μου το καλάθι με email». Signed-in: one click to the
 * account email. Guest: small email field. Sends the current lines to
 * /api/cart/email which stores the cart with a restore link.
 */
export function useEmailCart(source: string) {
  const { lines } = useCart();
  const [session, setSession] = useState<{ email: string; firstName: string } | null>(null);
  useEffect(() => { fetch("/api/account/me", { cache: "no-store" }).then((r) => r.json()).then((j) => j.authenticated && setSession({ email: j.email, firstName: j.firstName })).catch(() => null); }, []);
  const send = async (email?: string, reason?: string) => {
    const r = await fetch("/api/cart/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, reason, source, lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty, variant: l.variant, addons: l.addons })) }) });
    return (await r.json()) as { ok: boolean; error?: string; email?: string; sent?: boolean; skipped?: boolean };
  };
  return { session, send, count: lines.length };
}

export function EmailCartButton({ className = "" }: { className?: string }) {
  const { session, send, count } = useEmailCart("cart");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!count) return null;
  const go = async (to?: string) => { setBusy(true); setErr(null); const r: { ok: boolean; error?: string; email?: string } = await send(to).catch(() => ({ ok: false, error: "Κάτι πήγε στραβά." })); setBusy(false); if (!r.ok) return setErr(r.error ?? "Κάτι πήγε στραβά."); setDone(r.email ?? to ?? ""); setOpen(false); };
  if (done) return <p role="status" className={`m-0 inline-flex items-center gap-2 rounded-full bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-14)] px-4 min-h-11 ${className}`}><Check className="size-4" aria-hidden /> Το καλάθι στάλθηκε στο {done}</p>;
  return (
    <div className={`grid gap-2 ${className}`}>
      <button type="button" disabled={busy} onClick={() => (session ? go() : setOpen((o) => !o))} className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />} {session ? `Στείλε μου το καλάθι στο ${session.email}` : "Στείλε μου το καλάθι με email"}</button>
      {open && !session && (
        <form onSubmit={(e) => { e.preventDefault(); go(email); }} className="flex gap-2"><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Το email σου" className="flex-1 min-w-0 rounded-full border-2 border-eu-line px-4 min-h-11 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" aria-label="Email" /><button type="submit" disabled={busy} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-60">Αποστολή</button><button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /></button></form>
      )}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
      {open && !session && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Στέλνουμε μόνο αυτό το καλάθι με σύνδεσμο επαναφοράς (ισχύει 30 ημέρες). Καμία εμπορική επικοινωνία χωρίς συναίνεση.</p>}
    </div>
  );
}

/** On /kalathi?restore=TOKEN: pulls the saved lines into the cart once. */
export function CartRestore({ token }: { token: string }) {
  const { add, hydrated } = useCart();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  useEffect(() => {
    if (!hydrated || state !== "idle") return;
    let alive = true;
    fetch(`/api/cart/email?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((j: { ok: boolean; lines?: { product: Parameters<typeof add>[0]; qty: number; variant?: string; addons: { slug: string; title: string; price: number }[] }[] }) => {
      if (!alive) return;
      if (!j.ok || !j.lines) return setState("error");
      j.lines.forEach((l) => add(l.product, { qty: l.qty, variant: l.variant, addons: l.addons, openMiniCart: false }));
      setState("done");
      history.replaceState(null, "", "/kalathi");
    }).catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [hydrated, token, add, state]);
  if (state === "done") return <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-14)] px-4 py-2 inline-flex items-center gap-2"><Check className="size-4" aria-hidden /> Το καλάθι σου επαναφέρθηκε από το email.</p>;
  if (state === "error") return <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-4 py-2">Ο σύνδεσμος επαναφοράς έληξε ή δεν ισχύει.</p>;
  return null;
}
