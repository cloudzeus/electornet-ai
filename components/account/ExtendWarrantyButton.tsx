"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });

/**
 * Αγορά επέκτασης εγγύησης +3 έτη για παλιά αγορά: πληρωμή στη Viva και ενεργοποίηση μόλις επιβεβαιωθεί. Οι όροι και
 * η τιμή ελέγχονται πάντα στον server. `token`: από τον προσωπικό σύνδεσμο της συσκευής (χωρίς σύνδεση).
 */
export function ExtendWarrantyButton({ deviceId, price, token }: { deviceId: string; price: number; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    if (!window.confirm(`Επέκταση εγγύησης +3 έτη με ${eur(price)}. Θα μεταφερθείς στη Viva για την πληρωμή. Συνέχεια;`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = token
        ? await fetch(`/api/eg/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pay" }) })
        : await fetch(`/api/account/devices/${deviceId}/extend/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json()) as { ok: boolean; url?: string; error?: string };
      if (j.ok && j.url) { window.location.assign(j.url); return; }
      setMsg({ ok: false, text: j.error ?? "Η πληρωμή δεν ξεκίνησε." });
    } catch { setMsg({ ok: false, text: "Σφάλμα δικτύου. Δοκίμασε ξανά." }); }
    setBusy(false);
  };
  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60 cursor-pointer border-2 border-eu-navy text-eu-navy bg-white hover:bg-eu-surface">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
        Επέκταση +3 έτη · {eur(price)}
      </button>
      {msg && <span role="status" className={`text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
    </span>
  );
}
