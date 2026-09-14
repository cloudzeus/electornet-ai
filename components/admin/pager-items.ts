/**
 * Κοινή λογική σελιδοποίησης για τους πίνακες της διαχείρισης: ποιες σελίδες
 * δείχνουμε (πρώτη, τελευταία και ±`win` γύρω από την τρέχουσα) και πού μπαίνει
 * το «…». Την ίδια συνάρτηση και τα ίδια στυλ χρησιμοποιούν τόσο η έκδοση με
 * συνδέσμους (`Pagination`) όσο και η έκδοση με κουμπιά (`PagerButtons`).
 */
export function pageItems(page: number, pages: number, win = 2): (number | "gap")[] {
  const nums = new Set<number>([1, pages]);
  for (let i = page - win; i <= page + win; i++) if (i >= 1 && i <= pages) nums.add(i);
  const list = [...nums].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  list.forEach((n, i) => { if (i && n - list[i - 1] > 1) items.push("gap"); items.push(n); });
  return items;
}

export const pagerBox = "inline-flex items-center justify-center min-h-9 min-w-9 px-2 rounded-full font-bold text-[length:var(--fs-13)] tabular-nums";
export const pagerEdge = `${pagerBox} border border-eu-line text-eu-ink hover:border-eu-blue`;
export const pagerOff = `${pagerBox} border border-eu-line opacity-40 pointer-events-none`;
export const pagerCurrent = `${pagerBox} bg-eu-navy text-white`;
