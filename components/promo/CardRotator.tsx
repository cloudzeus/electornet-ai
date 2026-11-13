"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

const STEP_MS = 4500;
// κάθε κάρτα θέλει ~11,5rem για να μην είναι στριμωγμένη· ποτέ πάνω από 3 μαζί
const perFor = (w: number, rem: number) => Math.max(1, Math.min(3, Math.floor((w + 0.75 * rem) / (12.25 * rem))));

/**
 * Οι κάρτες προϊόντων ενός πλατιού banner: δείχνει όσες χωράνε άνετα (1–3) και κάθε 4,5″ τις αλλάζει με τις επόμενες της καμπάνιας.
 * Κάθε νέα κάρτα «ανεβαίνει» με μικρή καθυστέρηση από την προηγούμενη και μετά μπαίνουν τα κείμενά της (μάρκα, τίτλος, τιμή) — globals.css, «.eu-card-in».
 * Σταματά όσο ο πελάτης έχει το ποντίκι ή την εστίαση πάνω της, όταν δεν φαίνεται στην οθόνη, και με «λιγότερη κίνηση» στη συσκευή.
 * Πριν μετρηθεί το πλάτος (server) δείχνει τις πρώτες κάρτες με τους κανόνες CSS του banner (hideUntil).
 */
export function CardRotator({ children, hideUntil, label }: { children: ReactNode; /** κλάσεις που κρύβουν τη 2η/3η κάρτα σε στενό χώρο, μέχρι να μετρηθεί το πλάτος */ hideUntil: string[]; label: string }) {
  const cards = Children.toArray(children);
  const n = cards.length;
  const root = useRef<HTMLUListElement>(null);
  const [per, setPer] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hold, setHold] = useState(false);
  const [seen, setSeen] = useState(false);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const ro = new ResizeObserver(([e]) => setPer(perFor(e.contentRect.width, rem)));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    const t = setTimeout(() => setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches), 0);
    return () => { ro.disconnect(); io.disconnect(); clearTimeout(t); };
  }, []);

  const show = per ?? Math.min(3, n);
  const pages = Math.ceil(n / show);
  const running = per != null && pages > 1 && !hold && seen && !calm;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setPage((p) => p + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [running, page]);

  // η τελευταία σελίδα συμπληρώνεται από την αρχή, ώστε να μη μένει ποτέ κενή θέση
  const start = ((page % pages) * show) % n;
  const idx = Array.from({ length: Math.min(show, n) }, (_, k) => (start + k) % n);
  return (
    <ul ref={root} aria-label={label} className="m-0 p-0 list-none grid gap-3 min-w-0 @xl:grid-flow-col @xl:auto-cols-fr"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      {idx.map((i, k) => (
        <li key={`${page}-${i}`} className={`min-w-0 grid ${per == null ? hideUntil[k] ?? "" : ""} ${page > 0 ? "eu-card-in" : ""}`}>{cards[i]}</li>
      ))}
    </ul>
  );
}
