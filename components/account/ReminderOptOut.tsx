"use client";

import { useState } from "react";
import { BellOff, Loader2 } from "lucide-react";

/** Διακοπή των υπενθυμίσεων service & εγγύησης (SMS και email) από τον προσωπικό σύνδεσμο — καταγράφεται ως συγκατάθεση. */
export function ReminderOptOut({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p role="status" className="m-0 font-bold text-eu-green text-[length:var(--fs-14)]">Δεν θα λαμβάνεις άλλες υπενθυμίσεις service & εγγύησης. Μπορείς να το αλλάξεις από τον λογαριασμό σου.</p>;
  return (
    <span className="inline-grid gap-1">
      <button type="button" disabled={state === "busy"} onClick={async () => {
        setState("busy");
        const r = await fetch(`/api/eg/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "optout" }) }).then((x) => x.json()).catch(() => null);
        setState(r?.ok ? "done" : "error");
      }} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-2 font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface disabled:opacity-60">
        {state === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellOff className="size-4" aria-hidden />} Να μη λαμβάνω υπενθυμίσεις
      </button>
      {state === "error" && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">Δεν έγινε. Δοκίμασε ξανά.</span>}
    </span>
  );
}
