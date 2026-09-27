"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Μετάβαση ανάμεσα στα βήματα: γλιστρά προς τα εμπρός ή προς τα πίσω, ανάλογα με την κατεύθυνση. */
export function StepTransition({ stepKey, dir, children }: { stepKey: string; dir: 1 | -1; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div key={stepKey} custom={dir}
        variants={{ enter: (d: number) => ({ opacity: 0, x: still ? 0 : d * 28 }), show: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: still ? 0 : d * -20 }) }}
        initial="enter" animate="show" exit="exit" transition={{ duration: still ? 0.12 : 0.28, ease: EASE }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Κείμενο που αλλάζει (π.χ. «Διαβάζω το κείμενο…» → «Εντοπίζω τις φωτογραφίες…») με ομαλή διασταύρωση. */
export function SwapText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`relative inline-grid ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>{text}</motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * «Διαβάζω το banner»: μια φωτεινή κίτρινη γραμμή σαρώνει την εικόνα από πάνω προς τα κάτω, με απαλό μπλε πλέγμα —
 * ο χρήστης βλέπει ότι κάτι δουλεύει ΠΑΝΩ στο δικό του banner, όχι ένα γενικό spinner.
 */
export function ScanOverlay({ src }: { src: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-eu-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="block w-full max-h-80 object-cover object-top" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(rgba(29,66,138,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(29,66,138,.07)_1px,transparent_1px)] bg-[size:22px_22px]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-full eu-scan-sweep">
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-eu-yellow/25 to-eu-yellow/55" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-eu-yellow shadow-[0_0_18px_4px_rgba(241,196,0,.75)]" />
      </div>
    </div>
  );
}

/** Τα αστέρια του σήματος Euronics που «σκάνε» γύρω από το τικ της επιτυχίας. */
const STAR = "M12 0l2.9 8.3H24l-7.3 5.3 2.8 8.4L12 16.8 4.5 22l2.8-8.4L0 8.3h9.1z";

/** Επιτυχία δημοσίευσης: κύκλος που μεγαλώνει, τικ που ζωγραφίζεται, αστεράκια που πετάγονται και σβήνουν. */
export function SuccessBurst() {
  const still = useReducedMotion();
  const stars = Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2 - Math.PI / 2; return { x: Math.cos(a) * 58, y: Math.sin(a) * 58, r: (i % 2 ? 1 : -1) * 90, s: 0.55 + (i % 3) * 0.2 }; });
  return (
    <span className="relative inline-flex size-16 shrink-0" aria-hidden>
      {!still && stars.map((p, i) => (
        <motion.svg key={i} viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 size-4 -ml-2 -mt-2 fill-eu-yellow"
          initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }} animate={{ x: p.x, y: p.y, scale: [0, p.s * 1.3, p.s], opacity: [0, 1, 0], rotate: p.r }}
          transition={{ duration: 0.9, delay: 0.25 + i * 0.02, ease: EASE }}>
          <path d={STAR} />
        </motion.svg>
      ))}
      <motion.span className="absolute inset-0 rounded-full bg-eu-green" initial={{ scale: still ? 1 : 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }} />
      <svg viewBox="0 0 24 24" className="relative m-auto size-9 fill-none stroke-white stroke-[3]" strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: still ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2, ease: EASE }} />
      </svg>
    </span>
  );
}

export { motion };
