import { Database, Globe, Package, Pencil, Store, Zap, type LucideIcon } from "lucide-react";

/**
 * Από πού έρχεται μια πληροφορία προϊόντος — ίδιο χρώμα παντού (χαρακτηριστικά, ενεργειακή ετικέτα, διαστάσεις):
 *  EPREL (πράσινο, επίσημη δήλωση κατασκευαστή) · SoftOne/ERP (μπλε σκούρο) · Icecat (μπλε) · Web (πορτοκαλί) ·
 *  Κατάστημα (πορτοκαλί, εγκεκριμένη πρόταση από άλλο e-shop) · Χειροκίνητα (μωβ) · Άλλη (γκρι). Το χρώμα συνοδεύεται πάντα από εικονίδιο και κείμενο.
 */
export type SourceKey = "eprel" | "s1-desc" | "icecat" | "web" | "shop" | "manual" | "other";
export const SOURCES: Record<SourceKey, { label: string; cls: string; dot: string; Icon: LucideIcon; where: string }> = {
  eprel: { label: "EPREL", cls: "bg-eu-green/12 text-eu-green", dot: "bg-eu-green", Icon: Zap, where: "Επίσημη δήλωση κατασκευαστή στο ευρωπαϊκό μητρώο ενεργειακής σήμανσης — ενημερώνεται με νέα αναζήτηση στο EPREL." },
  "s1-desc": { label: "SoftOne", cls: "bg-eu-navy/10 text-eu-navy", dot: "bg-eu-navy", Icon: Database, where: "Από την αναλυτική περιγραφή του είδους στο SoftOne — αλλάζει στη «Διόρθωση κειμένων & χαρακτηριστικών»." },
  icecat: { label: "Icecat", cls: "bg-eu-blue/10 text-eu-blue", dot: "bg-eu-blue", Icon: Package, where: "Από τον κατάλογο Icecat του κατασκευαστή." },
  web: { label: "Web", cls: "bg-eu-amber/15 text-eu-ink-2", dot: "bg-eu-amber", Icon: Globe, where: "Από το site του κατασκευαστή / το παλιό site." },
  shop: { label: "Κατάστημα", cls: "bg-eu-amber/15 text-eu-ink-2", dot: "bg-eu-amber", Icon: Store, where: "Από σελίδα άλλου ηλεκτρονικού καταστήματος — μπήκε με έγκριση από τα «Στοιχεία από το internet»." },
  manual: { label: "Χειροκίνητα", cls: "bg-eu-purple/12 text-eu-purple", dot: "bg-eu-purple", Icon: Pencil, where: "Καταχωρήθηκε από τη διαχείριση." },
  other: { label: "Άλλη πηγή", cls: "bg-eu-surface text-eu-ink-3", dot: "bg-eu-muted-3", Icon: Package, where: "Χωρίς καταγεγραμμένη πηγή." },
};
export const sourceOf = (s: string | null | undefined) => SOURCES[(s ?? "other") as SourceKey] ?? SOURCES.other;

export function SourceBadge({ source, count, size = "sm" }: { source: string | null | undefined; count?: number; size?: "sm" | "xs" }) {
  const s = sourceOf(source);
  return (
    <span title={s.where} className={`inline-flex items-center gap-1 rounded-full font-bold ${size === "xs" ? "px-2 py-0.5 text-[length:var(--fs-12)]" : "px-2.5 py-1 text-[length:var(--fs-13)]"} ${s.cls}`}>
      <s.Icon className={size === "xs" ? "size-3" : "size-3.5"} aria-hidden />{s.label}{count != null && <span className="tabular-nums">· {count.toLocaleString("el-GR")}</span>}
    </span>
  );
}
