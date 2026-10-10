"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

/** Δωρεάν επέκταση εγγύησης +2 έτη για παλιά αγορά (οι όροι ελέγχονται στον server). */
export function ExtendWarrantyButton({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/account/devices/${deviceId}/extend`, { method: "POST" });
      const j = (await r.json()) as { ok: boolean; extendedUntil?: string; error?: string };
      if (j.ok) { setMsg({ ok: true, text: `Έγινε! Εγγύηση έως ${new Date(j.extendedUntil!).toLocaleDateString("el-GR")}.` }); router.refresh(); }
      else setMsg({ ok: false, text: j.error ?? "Δεν έγινε η επέκταση." });
    } catch { setMsg({ ok: false, text: "Σφάλμα δικτύου. Δοκίμασε ξανά." }); }
    setBusy(false);
  };
  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:brightness-95 disabled:opacity-60 cursor-pointer">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />} Δωρεάν επέκταση +2 έτη
      </button>
      {msg && <span role="status" className={`text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
    </span>
  );
}
