"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RefreshCw } from "lucide-react";
import { startPurchaseSync } from "./actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50";

export function PurchaseSyncButtons({ running, ready }: { running: boolean; ready: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const go = (full: boolean) => {
    if (full && !confirm("Πλήρης ανάγνωση των παραγγελιών του eshop από το 2020 (περίπου 16.000 παραστατικά). Μόνο ανάγνωση από το SoftOne — δημιουργεί / ενημερώνει πελάτες, αγορές και συσκευές στο eshop. Θέλει αρκετά λεπτά. Συνέχεια;")) return;
    start(async () => { const r = await startPurchaseSync(full); setMsg(r.ok ? "Ξεκίνησε — τρέχει στο παρασκήνιο. Ανανέωσε τη σελίδα σε λίγο για την πρόοδο." : r.error ?? "Δεν ξεκίνησε."); router.refresh(); });
  };
  const off = pending || running || !ready;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => go(false)} disabled={off} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Νέες αλλαγές</button>
        <button type="button" onClick={() => go(true)} disabled={off} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}><History className="size-4" aria-hidden /> Πλήρες ιστορικό από 2020</button>
      </div>
      {running && <p className="m-0 inline-flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-13)]"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Τρέχει συγχρονισμός…</p>}
      {msg && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</p>}
    </div>
  );
}
