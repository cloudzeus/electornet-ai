"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Κωδικός κουπονιού με αντιγραφή (και αποθήκευση για το καλάθι / checkout). */
export function CopyCoupon({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); } catch { /* χωρίς πρόσβαση στο πρόχειρο */ }
    try { sessionStorage.setItem("eu.coupon", code); } catch { /* ιδιωτική περιήγηση */ }
    setDone(true); setTimeout(() => setDone(false), 2500);
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-3 rounded-2xl border-2 border-dashed border-eu-navy bg-white px-5 min-h-14 font-mono font-extrabold text-eu-navy text-[length:var(--fs-22)] tracking-wider hover:bg-eu-chip">
      {code}
      <span className="inline-flex items-center gap-1 font-sans text-[length:var(--fs-14)] font-bold text-eu-blue">{done ? <><Check className="size-4" aria-hidden /> Αντιγράφηκε</> : <><Copy className="size-4" aria-hidden /> Αντιγραφή</>}</span>
    </button>
  );
}
