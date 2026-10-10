"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

const NAME: Record<string, string> = { card: "Κάρτα", apple: "Apple Pay", google: "Google Pay", paypal: "PayPal", iris: "IRIS", klarna: "Klarna" };

/** «Δοκίμασε ξανά»: νέα πληρωμή στη Viva για την ίδια παραγγελία, με τον τρόπο που θα διαλέξει ο πελάτης. */
export function RetryPayment({ number, k, methods, current }: { number: string; k: string; methods: string[]; current: string }) {
  const [pay, setPay] = useState(methods.includes(current) ? current : methods[0] ?? "card");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/payments/viva/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ no: number, k, pay }) });
      const j = (await r.json()) as { ok: boolean; redirect?: string; error?: string };
      if (j.ok && j.redirect) { window.location.assign(j.redirect); return; }
      setErr(j.error ?? "Δεν ξεκίνησε η πληρωμή. Δοκίμασε σε λίγο.");
    } catch { setErr("Σφάλμα δικτύου. Δοκίμασε ξανά."); }
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <fieldset className="m-0 p-0 border-0 flex flex-wrap gap-2">
        <legend className="mb-2 font-bold text-eu-ink text-[length:var(--fs-15)]">Τρόπος πληρωμής</legend>
        {methods.map((m) => (
          <label key={m} className={`rounded-full border-2 px-4 min-h-12 inline-flex items-center font-bold text-[length:var(--fs-15)] cursor-pointer ${pay === m ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue"}`}>
            <input type="radio" name="retry-pay" className="sr-only" checked={pay === m} onChange={() => setPay(m)} /> {NAME[m] ?? m}
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={go} disabled={busy} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-6 min-h-14 text-[length:var(--fs-16)] hover:bg-eu-yellow-dark disabled:opacity-60">
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />} Δοκίμασε ξανά την πληρωμή
      </button>
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
    </div>
  );
}
