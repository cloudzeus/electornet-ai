"use client";

import { useEffect } from "react";

const IDLE_MS = 5 * 60_000;

/**
 * Μετρά τον ενεργό χρόνο του προσωπικού (Χρήστες → Αναφορά δραστηριότητας): ένα ping το λεπτό,
 * μόνο όσο η καρτέλα φαίνεται και υπήρξε κίνηση (ποντίκι, πλήκτρο, κύλιση) τα τελευταία 5 λεπτά.
 */
export function PresencePing() {
  useEffect(() => {
    let active = Date.now();
    const touch = () => { active = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - active > IDLE_MS) return;
      fetch("/api/admin/presence", { method: "POST", body: location.pathname, keepalive: true }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 60_000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, touch, { capture: true })); };
  }, []);
  return null;
}
