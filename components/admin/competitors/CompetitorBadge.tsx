// Badge τιμής Κωτσόβολου — ΜΟΝΟ στη διαχείριση (ποτέ σε σελίδα του eshop).
import { ArrowDown, ArrowUp, Equal, HelpCircle, Minus } from "lucide-react";
import { badge, type BadgeKind, type KotView } from "@/lib/competitors/badge";

// Χρώμα με νόημα: κόκκινο = είμαστε ακριβότεροι, πράσινο = φθηνότεροι, μπλε = ίδια, πορτοκαλί = θέλει έλεγχο, γκρι = χωρίς σύγκριση.
// Το κόκκινο κείμενο είναι πιο σκούρο από το eu-red ώστε να περνά 4,5:1 (εγκεκριμένο mockup).
const STYLE: Record<BadgeKind, string> = {
  up: "bg-[#fdecea] text-[#a3271a] border-[#f3c7c1]",
  down: "bg-[#e6f2ea] text-[#17602f] border-[#bfdcc9]",
  eq: "bg-eu-chip text-eu-blue border-[#c3cfe6]",
  suggested: "bg-eu-amber/12 text-eu-ink border-eu-amber/40",
  gone: "bg-eu-surface-2 text-eu-ink-3 border-eu-line",
  none: "bg-eu-surface-2 text-eu-ink-3 border-eu-line",
};
const ICON: Record<BadgeKind, typeof ArrowUp | null> = { up: ArrowUp, down: ArrowDown, eq: Equal, suggested: HelpCircle, gone: Minus, none: null };
const HINT: Record<BadgeKind, string> = {
  up: "Είμαστε ακριβότεροι από τον Κωτσόβολο",
  down: "Είμαστε φθηνότεροι από τον Κωτσόβολο",
  eq: "Πρακτικά ίδια τιμή με τον Κωτσόβολο (±0,5%)",
  suggested: "Βρέθηκε πιθανό ζευγάρι — άνοιξε το προϊόν και επιβεβαίωσέ το για να μετρά",
  gone: "Το ζευγάρι δεν διατίθεται πια στον Κωτσόβολο — δεν μετρά στη μαζική αλλαγή",
  none: "Χωρίς ζευγάρι στον Κωτσόβολο",
};

export function CompetitorBadge({ price, size = "sm" }: { price: KotView | null; size?: "sm" | "lg" }) {
  const b = badge(price, size === "sm");
  if (size === "sm" && !price) return <span className="text-eu-muted" title="Η κατηγορία δεν συγκρίνεται ή δεν έχει ελεγχθεί ακόμη">—</span>;
  const Icon = ICON[b.kind];
  const lg = size === "lg";
  return (
    <span title={HINT[b.kind]}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tabular-nums max-w-full ${lg ? "px-3 py-1.5 text-[length:var(--fs-14)]" : "px-2 py-0.5 text-[length:var(--fs-12)] whitespace-nowrap"} ${STYLE[b.kind]}`}>
      {Icon && <Icon className={lg ? "size-4 shrink-0" : "size-3.5 shrink-0"} strokeWidth={2.5} aria-hidden />}
      <span className={lg ? "min-w-0" : "truncate"}>{b.text}</span>
    </span>
  );
}
