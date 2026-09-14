"use client";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { pageItems, pagerBox, pagerCurrent, pagerEdge } from "./pager-items";

/**
 * Ίδια σελιδοποίηση με το `Pagination`, αλλά με κουμπιά: για πίνακες που
 * κρατούν τη σελίδα σε state και φορτώνουν δεδομένα με fetch, όπου δεν
 * υπάρχει URL ανά σελίδα (βιβλιοθήκη πολυμέσων).
 */
export function PagerButtons({ page, pages, total, onPage, label = "αρχεία", window: win = 2 }: {
  page: number;
  pages: number;
  total?: number;
  onPage: (p: number) => void;
  label?: string;
  window?: number;
}) {
  if (pages <= 1) return total != null ? <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{total.toLocaleString("el-GR")} {label}</span> : null;
  const items = pageItems(page, pages, win);
  const btn = `${pagerEdge} disabled:opacity-40 disabled:pointer-events-none`;

  return (
    <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-1.5">
      {total != null && <span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums mr-1">{total.toLocaleString("el-GR")} {label}</span>}
      <button type="button" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Πρώτη σελίδα" className={btn}><ChevronsLeft className="size-4" aria-hidden /></button>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Προηγούμενη σελίδα" className={btn}><ChevronLeft className="size-4" aria-hidden /></button>
      {items.map((it, i) =>
        it === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-eu-muted select-none">…</span>
        ) : it === page ? (
          <span key={it} aria-current="page" className={pagerCurrent}>{it}</span>
        ) : (
          <button key={it} type="button" onClick={() => onPage(it)} className={pagerEdge}>{it}</button>
        ),
      )}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Επόμενη σελίδα" className={btn}><ChevronRight className="size-4" aria-hidden /></button>
      <button type="button" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Τελευταία σελίδα" className={btn}><ChevronsRight className="size-4" aria-hidden /></button>
      <span className={`${pagerBox} sr-only`}>{page}/{pages}</span>
    </nav>
  );
}
