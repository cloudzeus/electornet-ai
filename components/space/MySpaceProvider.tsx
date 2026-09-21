"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { MySpace } from "@/lib/space/fit";

interface Ctx {
  space: MySpace | null;
  setSpace: (s: MySpace | null) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Ο πελάτης ζήτησε έλεγχο «χωράει;» σε ΑΥΤΗ τη λίστα / προϊόν. Όχι μόνιμη κατάσταση: σβήνει όταν αλλάξει σελίδα. */
  checking: boolean;
  setChecking: (v: boolean) => void;
}
const C = createContext<Ctx | null>(null);
const KEY = "euronics.mySpace.v1";

/**
 * @dynamic «Ο χώρος μου» — the customer's door width / lift / niche, entered
 * once and reused by the Fit check, the PDP schematic and the AI advisor.
 * Οι διαστάσεις θυμούνται· το «Χωράει / Δεν χωράει» πάνω στις κάρτες ΟΧΙ: εμφανίζεται μόνο όταν ο πελάτης
 * το ζητήσει (διακόπτης στη λίστα, κουμπί στο προϊόν, ή μόλις αποθηκεύσει τον χώρο του) και σβήνει στην επόμενη σελίδα. Demo: localStorage. Production: customer profile
 * (account) with anonymous cookie fallback, GDPR: no personal data.
 */
export function MySpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpaceState] = useState<MySpace | null>(null);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<{ on: boolean; path: string }>({ on: false, path: "" });
  const pathname = usePathname();
  const checking = check.on && check.path === pathname; // άλλη σελίδα = νέος έλεγχος, όχι κληρονομημένος
  const setChecking = useCallback((v: boolean) => setCheck({ on: v, path: window.location.pathname }), []);
  useEffect(() => {
    // Deferred so the server-rendered markup hydrates first (no sync setState in effect).
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) setSpaceState(JSON.parse(raw));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const setSpace = useCallback((s: MySpace | null) => {
    setSpaceState(s);
    if (s) setCheck({ on: true, path: window.location.pathname }); // μόλις έδωσε διαστάσεις: αυτό που ζήτησε είναι να δει τι χωράει
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {}
  }, []);
  const v = useMemo(() => ({ space, setSpace, open, setOpen, checking, setChecking }), [space, setSpace, open, checking, setChecking]);
  return <C.Provider value={v}>{children}</C.Provider>;
}

export function useMySpace(): Ctx {
  const c = useContext(C);
  if (!c) return { space: null, setSpace: () => {}, open: false, setOpen: () => {}, checking: false, setChecking: () => {} };
  return c;
}
