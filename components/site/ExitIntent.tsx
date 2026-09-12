"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X, Mail, Check, Sparkles } from "lucide-react";
import { useCart } from "@/components/commerce/CartProvider";
import { ProductImage } from "@/components/commerce/ProductImage";
import { priceLong } from "@/lib/format";

const KEY = "euronics.exitIntent.v1";

/**
 * @dynamic Exit intent: when the pointer leaves towards the browser chrome
 * (desktop) or the tab is hidden and shown again with items in the cart
 * (mobile), the advisor asks why — one tap — and offers to email the cart.
 * Logged in (session) → one click sends it to the account email; guest →
 * email field. Once per session, never on checkout or success pages.
 * Production: reason → Demand Radar; cart email via Klaviyo/Brevo with the
 * cart token; GDPR: transactional email, no marketing without consent.
 */
export function ExitIntent() {
  const path = usePathname();
  const { lines, subtotal, hydrated } = useCart();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<{ name: string; email: string } | null>(null);
  const [sent, setSent] = useState(false);
  const { advisor } = useSettings();
  const REASONS = advisor.exitIntent.reasons.map((r) => r.label);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("euronics.session");
      const t = setTimeout(() => setSession(raw ? JSON.parse(raw) : null), 0);
      return () => clearTimeout(t);
    } catch {}
  }, [open]);

  useEffect(() => {
    if (!hydrated || !advisor.exitIntent.enabled || lines.length === 0 || path.startsWith("/checkout")) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(KEY) === "1";
    } catch {}
    if (shown) return;
    const fire = () => {
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {}
      setOpen(true);
    };
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) fire();
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && (document as { __euHidden?: number }).__euHidden && Date.now() - (document as { __euHidden?: number }).__euHidden! > 2000) fire();
      if (document.visibilityState === "hidden") (document as { __euHidden?: number }).__euHidden = Date.now();
    };
    const t = setTimeout(() => {
      document.addEventListener("mouseout", onLeave);
      document.addEventListener("visibilitychange", onVis);
    }, advisor.exitIntent.delayMs);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hydrated, lines.length, path, advisor.exitIntent.enabled, advisor.exitIntent.delayMs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const target = session?.email ?? email;
  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <button type="button" className="absolute inset-0 bg-eu-navy/55 backdrop-blur-sm" aria-label="Κλείσιμο" onClick={() => setOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(640px,92vw)] bg-white rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] overflow-hidden grid grid-cols-1 @md:grid-cols-[200px_minmax(0,1fr)] animate-[eu-sheet_.35s_var(--eu-ease-out)]">
        <div className="relative bg-eu-navy text-white p-5 overflow-hidden isolate hidden @md:flex items-end justify-center">
          <span className="eu-ambient" aria-hidden />
          <Image src={advisor.avatar} alt="" width={140} height={295} className="relative eu-float drop-shadow-[0_18px_24px_rgba(0,0,0,.4)]" />
        </div>
        <div className="p-5 @md:p-6 grid gap-4 content-start">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" aria-hidden /> Ο {advisor.name} ρωτάει
              </div>
              <h2 id="exit-title" className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">
                {advisor.exitIntent.title}
              </h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={`rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] transition-colors ${reason === r ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink hover:bg-eu-chip"}`}>
                {r}
              </button>
            ))}
          </div>
          {reason && (
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">
              {advisor.exitIntent.reasons.find((r) => r.label === reason)?.reply}
            </p>
          )}
          <div className="rounded-2xl border border-eu-line p-3 grid gap-2">
            <div className="flex items-center justify-between text-[length:var(--fs-14)] text-eu-muted">
              <span>Το καλάθι σου · {lines.length} {lines.length === 1 ? "προϊόν" : "προϊόντα"}</span>
              <span className="font-extrabold text-eu-ink">{priceLong(subtotal)}</span>
            </div>
            <div className="flex gap-2">
              {lines.slice(0, 4).map((l) => (
                <ProductImage key={l.product.id} src={l.product.image} sizes="48px" className="size-12" rounded="rounded-lg" />
              ))}
            </div>
          </div>
          {sent ? (
            <div className="rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-15)] px-4 py-3 inline-flex items-center gap-2">
              <Check className="size-4" aria-hidden /> Σου έστειλα το καλάθι στο {target}.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!target) return;
                setSent(true);
              }}
              className="grid gap-2"
            >
              {session ? (
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue">
                  <Mail className="size-4" aria-hidden /> Στείλε μου το καλάθι στο {session.email}
                </button>
              ) : (
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="exit-email">
                    Email
                  </label>
                  <input id="exit-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Το email σου για το καλάθι" className="flex-1 min-w-0 rounded-full border-2 border-eu-line px-4 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
                  <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-blue">
                    <Mail className="size-4" aria-hidden /> Στείλε
                  </button>
                </div>
              )}
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{advisor.exitIntent.emailNote}</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
