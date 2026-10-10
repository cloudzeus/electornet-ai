"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";

const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });

/**
 * Επέκταση εγγύησης +2 έτη για παλιά αγορά. Δωρεάν (CCCWARRANTY): ενεργοποιείται αμέσως. Με τιμή: πληρωμή στη Viva
 * και ενεργοποίηση μόλις επιβεβαιωθεί. Οι όροι και η τιμή ελέγχονται στον server.
 */
export function ExtendWarrantyButton({ deviceId, price = null }: { deviceId: string; price?: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const paid = price != null && price > 0;
  const go = async () => {
    if (paid && !window.confirm(`Επέκταση εγγύησης +2 έτη με ${eur(price)}. Θα μεταφερθείς στη Viva για την πληρωμή. Συνέχεια;`)) return;
    setBusy(true); setMsg(null);
    try {
      if (paid) {
        const r = await fetch(`/api/account/devices/${deviceId}/extend/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        const j = (await r.json()) as { ok: boolean; url?: string; error?: string };
        if (j.ok && j.url) { window.location.assign(j.url); return; }
        setMsg({ ok: false, text: j.error ?? "Η πληρωμή δεν ξεκίνησε." });
      } else {
        const r = await fetch(`/api/account/devices/${deviceId}/extend`, { method: "POST" });
        const j = (await r.json()) as { ok: boolean; extendedUntil?: string; error?: string };
        if (j.ok) { setMsg({ ok: true, text: `Έγινε! Εγγύηση έως ${new Date(j.extendedUntil!).toLocaleDateString("el-GR")}.` }); router.refresh(); }
        else setMsg({ ok: false, text: j.error ?? "Δεν έγινε η επέκταση." });
      }
    } catch { setMsg({ ok: false, text: "Σφάλμα δικτύου. Δοκίμασε ξανά." }); }
    setBusy(false);
  };
  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={go} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60 cursor-pointer ${paid ? "border-2 border-eu-navy text-eu-navy bg-white hover:bg-eu-surface" : "bg-eu-green text-white hover:brightness-95"}`}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : paid ? <CreditCard className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
        {paid ? `Επέκταση +2 έτη · ${eur(price)}` : "Δωρεάν επέκταση +2 έτη"}
      </button>
      {msg && <span role="status" className={`text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
    </span>
  );
}
