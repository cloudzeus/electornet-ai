"use client";
import { useState, useTransition } from "react";
import { Bell, Play } from "lucide-react";
import { runAlertsNow } from "@/app/admin/(shell)/reports/wishlist/actions";

export function WishlistAlertsRunner() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (dry: boolean) => start(async () => { const r = await runAlertsNow(dry); setMsg(`${dry ? "Δοκιμή" : "Εκτέλεση"}: ${r.checked} αγαπημένα ελέγχθηκαν · ${r.priceDrops} πτώσεις τιμής · ${r.backInStock} επαναφορές διαθεσιμότητας${dry ? " (χωρίς αποστολή)" : ""}.`); });
  return (
    <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
      <button type="button" disabled={pending} onClick={() => run(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold hover:border-eu-navy disabled:opacity-50"><Bell className="size-4" aria-hidden /> Δοκιμή (χωρίς αποστολή)</button>
      <button type="button" disabled={pending} onClick={() => run(false)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-3 min-h-10 font-bold hover:bg-eu-blue disabled:opacity-50"><Play className="size-4" aria-hidden /> Εκτέλεση τώρα</button>
      {msg && <span role="status" className="text-eu-ink-3">{msg}</span>}
    </div>
  );
}
