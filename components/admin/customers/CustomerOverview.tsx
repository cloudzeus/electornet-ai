"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ActivityTab, Overview, Requests, loadPeek, type TabKey } from "./CustomerList";
import type { Peek } from "@/lib/customers/peek";

/** Οι ενότητες της γρήγορης εικόνας → οι καρτέλες της πλήρους καρτέλας πελάτη. */
const TO_WORKSPACE: Record<TabKey, string> = { overview: "overview", buys: "orders", requests: "service", warranty: "devices", loyalty: "loyalty", erp: "erp", activity: "overview" };

/**
 * Η πρώτη σελίδα της καρτέλας πελάτη: στοιχεία, αξία πελάτη, αγορές ανά έτος, σημειώσεις, αιτήματα (service, επιστροφές,
 * GDPR, κριτικές) και χρονολόγιο — από την ίδια ανάγνωση με το άνοιγμα γραμμής της λίστας.
 */
export function CustomerOverviewTab({ id, go }: { id: string; go: (tab: string) => void }) {
  const [p, setP] = useState<Peek | null | undefined>(undefined);
  useEffect(() => { let live = true; void loadPeek(id).then((x) => { if (live) setP(x); }); return () => { live = false; }; }, [id]);
  if (p === undefined) return <section className="rounded-2xl bg-white border border-eu-line p-4"><span className="inline-flex items-center gap-2 text-eu-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span></section>;
  if (!p) return null;
  const card = "rounded-2xl bg-white border border-eu-line p-3 @md:p-4 min-w-0";
  return (
    <div data-help="customer.overview" className="grid gap-3">
      <section className={card} aria-label="Σύνοψη πελάτη"><Overview p={p} go={(t) => go(TO_WORKSPACE[t])} /></section>
      <div className="grid gap-3 @5xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <section className={`${card} grid gap-2`} aria-labelledby="ov-req"><h3 id="ov-req" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Αιτήματα</h3><Requests p={p} /></section>
        <section className={`${card} grid gap-2`} aria-labelledby="ov-act"><h3 id="ov-act" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Χρονολόγιο</h3><ActivityTab p={p} /></section>
      </div>
    </div>
  );
}
