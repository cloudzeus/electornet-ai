"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Παράθυρο επιλογής σε όλη την οθόνη, πάντα ΠΑΝΩ από ό,τι είναι ανοιχτό. Είναι native <dialog> με showModal(), άρα μπαίνει
 * στο top layer του browser: ένα σκέτο `fixed` + z-index έμενε κάτω από τα παράθυρα ρυθμίσεων της ζώνης, που είναι κι αυτά
 * <dialog> (το top layer νικά κάθε z-index). Portal στο body, για να μην το κόβει sticky/κλιπαρισμένος πρόγονος.
 */
export function TopLayer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(
    <dialog ref={ref} aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-0 p-0 border-0 w-screen h-dvh max-w-none max-h-none bg-transparent backdrop:bg-transparent @container">
      {children}
    </dialog>,
    document.body,
  );
}
