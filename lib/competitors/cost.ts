import "server-only";
import { getTable } from "@/lib/softone/lookups";

/**
 * Κόστος αγοράς ανά είδος (MTRL) από το SoftOne: `MTRCPRICES.PURLPRICE` (ITECPRICES στο ITEM, «Τελ.τιμή αγοράς»),
 * γραμμή PERIOD=0 (ετήσια), τελευταία χρήση με τιμή > 0. ΜΟΝΟ ανάγνωση (GetTable). Ποτέ τιμή πώλησης (PRICER/PRICEW/NUM04).
 * `null` = το πεδίο δεν διαβάζεται (σφάλμα υπηρεσίας) → η δικλείδα κόστους κρύβεται. Είδος χωρίς κόστος > 0 λείπει από τον χάρτη.
 */
const BATCH = 50;
export async function readCosts(mtrls: number[]): Promise<Map<number, number> | null> {
  const ids = [...new Set(mtrls.filter((n) => Number.isInteger(n) && n > 0))];
  const best = new Map<number, { year: number; cost: number }>();
  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const rows = await getTable("MTRCPRICES", ["MTRL", "FISCPRD", "PERIOD", "PURLPRICE"], `MTRL IN (${ids.slice(i, i + BATCH).join(",")}) AND PERIOD=0`);
      for (const [m, y, , p] of rows) {
        const mtrl = Number(m), year = Number(y), cost = Number(String(p).replace(",", "."));
        if (!(cost > 0) || !Number.isFinite(year)) continue;
        if (year > (best.get(mtrl)?.year ?? -1)) best.set(mtrl, { year, cost });
      }
    }
  } catch { return null; }
  return new Map([...best].map(([m, v]) => [m, v.cost]));
}
