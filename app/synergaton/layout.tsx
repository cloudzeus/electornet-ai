import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Πύλη συνεργατών", template: "%s · Πύλη συνεργατών Euronics" },
  description: "Η πύλη των μελών Euronics: καταστήματα, σύνδεση διαθεσιμότητας, παραγγελίες παραλαβής.",
  robots: { index: false, follow: false },
};

/** Πύλη συνεργατών (synergaton.*): δική της εμφάνιση, χωρίς header/footer του eshop. */
export default function PortalRoot({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-eu-surface text-eu-ink text-[length:var(--fs-15)]">{children}</div>;
}
