"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

/** Screenshot της σελίδας σε υπολογιστή ή κινητό (τα τραβά αυτόματα το `npm run help:shots`). */
export function ShotTabs({ desktop, mobile, title }: { desktop?: string; mobile?: string; title: string }) {
  const [v, setV] = useState<"d" | "m">(desktop ? "d" : "m");
  const src = v === "d" ? desktop : mobile;
  return (
    <figure className="m-0 grid gap-2">
      {desktop && mobile && (
        <div role="tablist" aria-label="Συσκευή" className="justify-self-start flex gap-1 rounded-full bg-white border border-eu-line p-1">
          {([["d", "Υπολογιστής", Monitor], ["m", "Κινητό", Smartphone]] as const).map(([k, l, I]) => <button key={k} type="button" role="tab" aria-selected={v === k} onClick={() => setV(k)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${v === k ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}><I className="size-4" aria-hidden />{l}</button>)}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- στατικό screenshot του wiki */}
      {src && <img src={src} alt={`Η σελίδα «${title}» σε ${v === "d" ? "υπολογιστή" : "κινητό"}`} loading="lazy" className={`rounded-xl border border-eu-line shadow-sm bg-white ${v === "m" ? "max-w-[20rem]" : "w-full"}`} />}
      <figcaption className="text-eu-muted text-[length:var(--fs-12)]">Αυτόματο screenshot — ανανεώνεται με κάθε αλλαγή της σελίδας.</figcaption>
    </figure>
  );
}
