"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Το nonce του Content-Security-Policy της σελίδας (proxy.ts → app/layout.tsx), για όσα στοιχεία <style> φτιάχνουμε. */
const NonceContext = createContext<string | undefined>(undefined);
export function NonceProvider({ nonce, children }: { nonce?: string; children: ReactNode }) {
  return <NonceContext value={nonce}>{children}</NonceContext>;
}
export const useNonce = () => useContext(NonceContext);

/**
 * Ο κανόνας μιας κλάσης sx, στη θέση του στοιχείου. Όχι `precedence`/`href`: το React τότε ενώνει τα <style> στο <head>
 * και χάνει το nonce (μπλοκάρεται από το CSP). Ο browser κρύβει την τιμή του nonce μετά την ανάγνωση, γι' αυτό το
 * hydration δεν συγκρίνει το attribute.
 */
export function SxStyleTag({ id, css }: { id: string; css: string }) {
  const nonce = useNonce();
  return <style data-sx={id} nonce={nonce} suppressHydrationWarning>{css}</style>;
}
