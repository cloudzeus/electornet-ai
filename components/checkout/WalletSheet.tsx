"use client";

import { useEffect, useState } from "react";
import { X, Check, Loader2, MapPin, CreditCard } from "lucide-react";
import { priceLong } from "@/lib/format";
import { AppleMark, GoogleMark, RevolutMark, FaceIdMark } from "./BrandMarks";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("wallet");

export type Wallet = "apple" | "google" | "revolut";

/**
 * @dynamic Wallet payment sheet (Apple Pay / Google Pay / Revolut Pay).
 * Demo: a faithful simulation of the native sheet — card on file,
 * shipping address, total, biometric confirmation, processing, success —
 * so the customer sees the real flow. Production: Payment Request API /
 * Apple Pay JS / Google Pay API / Revolut Checkout widget through the PSP
 * (Viva Wallet, Eurobank ePay, Adyen); tokens never touch our servers.
 */
export function WalletSheet({ kind, total, itemsLabel, address, onDone, onClose }: { kind: Wallet; total: number; itemsLabel: string; address?: string; onDone: () => void; onClose: () => void }) {
  const [stage, setStage] = useState<"review" | "auth" | "processing" | "ok">("review");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage === "review" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stage]);
  useEffect(() => {
    if (stage === "auth") {
      const t = setTimeout(() => setStage("processing"), 1100);
      return () => clearTimeout(t);
    }
    if (stage === "processing") {
      const t = setTimeout(() => setStage("ok"), 1400);
      return () => clearTimeout(t);
    }
    if (stage === "ok") {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
  }, [stage, onDone]);

  const brand = {
    apple: { name: "Apple Pay", bg: "bg-white text-eu-ink", mark: <AppleMark className="size-6" />, card: "Visa •••• 4821 · Apple Card", cta: "Επιβεβαίωση με Face ID", auth: "Κοίτα το iPhone για επιβεβαίωση" },
    google: { name: "Google Pay", bg: "bg-white text-eu-ink", mark: <GoogleMark className="size-6" />, card: "Mastercard •••• 2210", cta: "Πληρωμή", auth: "Επιβεβαίωση με δακτυλικό αποτύπωμα" },
    revolut: { name: "Revolut Pay", bg: "bg-black text-white", mark: <RevolutMark className="h-5" />, card: "Revolut · EUR •••• 7734", cta: "Πληρωμή με Revolut", auth: "Επιβεβαίωση στην εφαρμογή Revolut" },
  }[kind];
  const dark = kind === "revolut";
  const row = `flex items-center justify-between gap-3 py-3 border-b ${dark ? "border-white/15" : "border-eu-line-2"} text-[length:var(--fs-15)]`;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={brand.name}>
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-label={c.kleisimo} onClick={() => stage === "review" && onClose()} />
      <div className={`absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[420px] rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] p-5 pb-8 @md:pb-5 ${brand.bg} animate-[eu-sheet_.35s_var(--eu-ease-out)]`}>
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-[length:var(--fs-17)]">
            {brand.mark} {kind !== "revolut" && brand.name.split(" ")[1]}
          </span>
          {stage === "review" && (
            <button type="button" onClick={onClose} aria-label={c.akyrosi} className={`size-9 rounded-full inline-flex items-center justify-center ${dark ? "bg-white/10" : "bg-eu-surface"}`}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {stage === "ok" ? (
          <div className="py-10 grid gap-3 justify-items-center text-center">
            <span className="size-16 rounded-full bg-eu-green text-white inline-flex items-center justify-center animate-[eu-bump_.5s_var(--eu-ease-out)]">
              <Check className="size-8" aria-hidden />
            </span>
            <div className="font-extrabold text-[length:var(--fs-20)]">{c.egine}</div>
            <div className={`text-[length:var(--fs-14)] ${dark ? "text-white/70" : "text-eu-muted"}`}>{c.i_paraggelia_katachoreitai}</div>
          </div>
        ) : stage === "processing" ? (
          <div className="py-10 grid gap-3 justify-items-center text-center">
            <Loader2 className="size-10 animate-spin" aria-hidden />
            <div className="font-bold text-[length:var(--fs-16)]">{c.epexergasia_pliromis}</div>
          </div>
        ) : stage === "auth" ? (
          <div className="py-10 grid gap-3 justify-items-center text-center">
            <span className="size-16 rounded-2xl inline-flex items-center justify-center animate-pulse text-eu-blue">
              <FaceIdMark className="size-12" />
            </span>
            <div className="font-bold text-[length:var(--fs-16)]">{brand.auth}</div>
          </div>
        ) : (
          <>
            <div className={row}>
              <span className="inline-flex items-center gap-2 font-semibold">
                <CreditCard className="size-4 opacity-70" aria-hidden /> {brand.card}
              </span>
              <span className={`text-[length:var(--fs-13)] ${dark ? "text-white/60" : "text-eu-muted"}`}>{c.allagi}</span>
            </div>
            {address && (
              <div className={row}>
                <span className="inline-flex items-center gap-2 min-w-0">
                  <MapPin className="size-4 opacity-70 shrink-0" aria-hidden /> <span className="truncate">{address}</span>
                </span>
                <span className={`text-[length:var(--fs-13)] shrink-0 ${dark ? "text-white/60" : "text-eu-muted"}`}>{c.allagi}</span>
              </div>
            )}
            <div className={row}>
              <span className={dark ? "text-white/70" : "text-eu-muted"}>{itemsLabel}</span>
              <span className="tabular-nums">{priceLong(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-3 text-[length:var(--fs-15)]">
              <span className="font-bold">{c.pliromi_se_euronics}</span>
              <span className="font-extrabold text-[length:var(--fs-20)] tabular-nums">{priceLong(total)}</span>
            </div>
            <button type="button" onClick={() => setStage("auth")} className={`mt-2 w-full rounded-full font-extrabold text-[length:var(--fs-16)] min-h-13 inline-flex items-center justify-center gap-2 ${dark ? "bg-white text-black" : "bg-black text-white"}`}>
              {kind === "apple" && <FaceIdMark className="size-5" />} {brand.cta}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
