import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { pageItems, pagerCurrent, pagerEdge, pagerOff } from "./pager-items";

/**
 * Σελιδοποίηση για τους πίνακες της διαχείρισης: πρώτη, προηγούμενη,
 * αριθμημένες σελίδες γύρω από την τρέχουσα, επόμενη, **τελευταία**.
 *
 * Server component με συνδέσμους (όχι state): λειτουργεί χωρίς JavaScript,
 * κάθε σελίδα έχει δικό της URL που μοιράζεται και ανοίγει σε νέα καρτέλα.
 * Το `href` το φτιάχνει ο καλών, ώστε να κρατά τα δικά του φίλτρα και το
 * όνομα της παραμέτρου (`page`, `p`, …). Για πίνακες που κρατούν τη σελίδα σε
 * state (π.χ. η βιβλιοθήκη πολυμέσων) υπάρχει το `PagerButtons`.
 */
export function Pagination({ page, pages, total, href, label = "εγγραφές", window: win = 2 }: {
  page: number;
  pages: number;
  total?: number;
  href: (p: number) => string;
  label?: string;
  /** πόσες σελίδες δεξιά/αριστερά της τρέχουσας */
  window?: number;
}) {
  if (pages <= 1) return total != null ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)] tabular-nums">{total.toLocaleString("el-GR")} {label}</p> : null;
  const items = pageItems(page, pages, win);

  return (
    <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-1.5">
      {total != null && <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums mr-1">{total.toLocaleString("el-GR")} {label}</span>}
      <Link href={href(1)} aria-label="Πρώτη σελίδα" className={page <= 1 ? pagerOff : pagerEdge}><ChevronsLeft className="size-4" aria-hidden /></Link>
      <Link href={href(page - 1)} aria-label="Προηγούμενη σελίδα" className={page <= 1 ? pagerOff : pagerEdge}><ChevronLeft className="size-4" aria-hidden /></Link>
      {items.map((it, i) =>
        it === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-eu-muted select-none">…</span>
        ) : it === page ? (
          <span key={it} aria-current="page" className={pagerCurrent}>{it}</span>
        ) : (
          <Link key={it} href={href(it)} className={pagerEdge}>{it}</Link>
        ),
      )}
      <Link href={href(page + 1)} aria-label="Επόμενη σελίδα" className={page >= pages ? pagerOff : pagerEdge}><ChevronRight className="size-4" aria-hidden /></Link>
      <Link href={href(pages)} aria-label="Τελευταία σελίδα" className={page >= pages ? pagerOff : pagerEdge}><ChevronsRight className="size-4" aria-hidden /></Link>
    </nav>
  );
}
