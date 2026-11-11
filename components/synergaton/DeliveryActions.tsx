"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackageCheck } from "lucide-react";
import { portalDeliveryStepAction } from "@/app/synergaton/(app)/paraggelies/actions";

/** Τα δύο κουμπιά του συνεργάτη σε μια παράδοση. Τα βήματα που δεν τον αφορούν τα σημειώνει η Euronics. */
export function DeliveryActions({ orderId, waiting }: { orderId: string; waiting: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (key: "partner" | "customer") => start(async () => { setErr(null); try { await portalDeliveryStepAction(orderId, key, name); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Δεν καταχωρίστηκε"); } });
  const received = waiting === "customer";
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {!received && <button type="button" disabled={busy} onClick={() => run("partner")} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-bold px-4 min-h-12 text-[length:var(--fs-15)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackageCheck className="size-4" aria-hidden />} Το παρέλαβα</button>}
        <label className="grid gap-0.5 flex-1 min-w-[180px] max-w-xs"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ποιος παρέλαβε (για την παράδοση)</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Όνομα παραλήπτη" className="min-h-12 rounded-xl border-2 border-eu-line bg-white px-3 text-[length:var(--fs-15)]" /></label>
        <button type="button" disabled={busy} onClick={() => run("customer")} className="inline-flex items-center gap-1.5 rounded-full bg-eu-green text-white font-bold px-4 min-h-12 text-[length:var(--fs-15)] disabled:opacity-60"><Check className="size-4" aria-hidden /> Παρέδωσα στον πελάτη</button>
      </div>
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-14)]">{err}</p>}
    </div>
  );
}
