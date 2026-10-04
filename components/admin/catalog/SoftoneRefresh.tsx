"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { pullFromSoftone } from "@/app/admin/(shell)/catalog/actions";

/** «Ενημέρωση από SoftOne» για ένα προϊόν: διαβάζει τώρα το είδος από το ERP και δείχνει τι άλλαξε. */
export function SoftoneRefresh({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button" disabled={pending}
        onClick={() => start(async () => { const r = await pullFromSoftone(productId); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}
        className="inline-flex items-center gap-1.5 rounded-full bg-eu-surface text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-9 hover:bg-eu-navy hover:text-white disabled:opacity-60 cursor-pointer transition-colors"
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden /> {pending ? "Διαβάζω από το SoftOne…" : "Ενημέρωση από SoftOne"}
      </button>
      <span role="status" className={`text-[length:var(--fs-13)] ${msg ? (msg.ok ? "text-eu-green font-semibold" : "text-eu-red font-semibold") : "sr-only"}`}>{msg?.text ?? ""}</span>
    </div>
  );
}
