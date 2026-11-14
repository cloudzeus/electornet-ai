"use client";

import { Printer } from "lucide-react";

/** Εκτύπωση της τρέχουσας σελίδας (το μενού και η μπάρα κρύβονται ήδη στην εκτύπωση από το AdminShell). */
export function PrintButton({ label = "Εκτύπωση" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="print:hidden inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
