"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Ακύρωση ραντεβού / αιτήματος service που δεν έχει ξεκινήσει (PATCH /api/account/tickets/[id]). */
export function CancelAppointment({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!confirm("Να ακυρωθεί αυτό το ραντεβού;")) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/account/tickets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).then((x) => x.json() as Promise<{ ok: boolean; error?: string }>).catch(() => ({ ok: false, error: "Σφάλμα δικτύου." }));
    setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.error ?? "Δεν ακυρώθηκε.");
  };
  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line text-eu-muted font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:border-eu-red hover:text-eu-red disabled:opacity-60 cursor-pointer">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Ακύρωση
      </button>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{err}</span>}
    </span>
  );
}
