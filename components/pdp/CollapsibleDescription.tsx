"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Η περιγραφή με τις ενότητες του κατασκευαστή φτάνει τις 10+ οθόνες στο κινητό: δείχνουμε την αρχή (~480px κινητό,
 * ~640px υπολογιστής) με σβήσιμο από κάτω και ένα κουμπί για τα υπόλοιπα. Όλο το κείμενο μένει στο HTML (SEO).
 * Αν τελικά χωράει, το κουμπί και το σβήσιμο φεύγουν.
 */
export function CollapsibleDescription({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setFits(el.scrollHeight <= el.clientHeight + 8);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  const clamped = !open && !fits;
  return (
    <div>
      <div ref={box} id="desc-body" className={`relative ${open ? "" : "max-h-[30rem] @md:max-h-[40rem] overflow-hidden"}`}>
        <div>{children}</div>
        {clamped && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-white/0 to-white" aria-hidden />}
      </div>
      {!fits && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="desc-body"
          onClick={() => {
            setOpen(!open);
            // στο κλείσιμο ο αναγνώστης θα έμενε κάπου χαμηλά, σε άλλη ενότητα — γύρνα στην αρχή της περιγραφής
            if (open) document.getElementById("description")?.scrollIntoView({ block: "start" });
          }}
          className="mt-4 inline-flex items-center gap-2 min-h-11 px-5 rounded-lg border border-eu-line bg-white font-bold text-eu-ink text-[length:var(--fs-15)] transition-colors hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue"
        >
          {open ? "Λιγότερα" : count > 1 ? `Δείξε όλη την περιγραφή · ${count} ενότητες` : "Δείξε όλη την περιγραφή"}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}
