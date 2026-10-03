import type { BrandTheme } from "./brand-store";

/**
 * Πληροφοριακές σελίδες με ζώνες (Περιεχόμενο → Ζώνες σελίδων). Κάθε σελίδα ορίζει ποιες ζώνες έχει.
 * Η αρχική, οι λίστες, η σελίδα προϊόντος και το καλάθι ΔΕΝ είναι εδώ (ακόμη).
 */
export type InfoZone = "top" | "after" | "aside" | "bottom";
export const INFO_ZONES: Record<InfoZone, { label: string; help: string }> = {
  top: { label: "Κάτω από την εισαγωγή", help: "Σε όλο το πλάτος, ακριβώς κάτω από τον τίτλο της σελίδας — για banner, ανακοίνωση, προσφορά." },
  after: { label: "Μετά το κείμενο", help: "Στη στήλη του κειμένου, μετά το περιεχόμενο της σελίδας." },
  aside: { label: "Πλευρική στήλη", help: "Στενή στήλη δίπλα στο κείμενο (σε κινητό μετά το κείμενο). Ταιριάζει σε κουπόνι, διαφήμιση στήλης, ένα κατάστημα." },
  bottom: { label: "Τέλος σελίδας", help: "Σε όλο το πλάτος, στο τέλος — για προϊόντα, προσφορές, καταστήματα." },
};

export type InfoPage = { key: string; path: string; title: string; zones: InfoZone[]; asideSide?: "left" | "right"; main?: string };
const POLICY = (key: string, title: string): InfoPage => ({ key, path: `/${key}`, title, zones: ["top", "after", "aside", "bottom"] });
export const INFO_PAGES: InfoPage[] = [
  { key: "epikoinonia", path: "/epikoinonia", title: "Επικοινωνία", zones: ["top", "aside", "bottom"], asideSide: "right", main: "Φόρμα επικοινωνίας" },
  { key: "syxnes-erotiseis", path: "/syxnes-erotiseis", title: "Συχνές ερωτήσεις", zones: ["top", "after", "aside", "bottom"] },
  POLICY("tropoi-apostolis", "Τρόποι αποστολής"),
  POLICY("tropoi-pliromis", "Τρόποι πληρωμής"),
  POLICY("epistrofes", "Επιστροφές"),
  POLICY("etaireia", "Η εταιρεία"),
  POLICY("oroi-chrisis", "Όροι χρήσης"),
  POLICY("aporrito", "Απόρρητο"),
  POLICY("cookies", "Cookies"),
  POLICY("oikonomika-stoixeia", "Οικονομικά στοιχεία"),
];
export const infoPage = (key: string) => INFO_PAGES.find((p) => p.key === key);

/** Χρώματα Euronics για τα components στις πληροφοριακές σελίδες (τα ίδια components με τις σελίδες μαρκών). */
export const EURONICS_THEME: BrandTheme = { mode: "light", bg: "#ffffff", bg2: "#f3f5f9", ink: "#1a1a1a", muted: "#595959", accent: "#1d428a", accentInk: "#ffffff" };
