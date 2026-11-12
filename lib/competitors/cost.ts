import "server-only";
import { getTable } from "@/lib/softone/lookups";

/**
 * Κόστος αγοράς ανά είδος (MTRL) από το SoftOne, ΜΟΝΟ ανάγνωση (GetTable), ποτέ τιμή πώλησης (PRICER/PRICEW/NUM04).
 * Πηγές (επαληθευμένες με τις γραμμές των παραστατικών αγοράς, SOSOURCE=1251):
 * - `MTRCPRICES.PURLPRICE` (PERIOD=0, τελευταία χρήση > 0): σταθμισμένο κόστος, καθαρό μετά τις εκπτώσεις· πλησιάζει την πραγματική τελευταία αγορά.
 * - `MTRSUPPRCS.LASTPRICE` (ενεργός προμηθευτής με τη νεότερη LASTBUYDATE): η τιμή της ΤΕΛΕΥΤΑΙΑΣ γραμμής ΟΠΟΙΟΥΔΗΠΟΤΕ παραστατικού
 *   αγοράς, ΠΡΙΝ από την έκπτωση γραμμής, και πιάνει και παραστατικά εξόδων (π.χ. 5,5 αντί 139 στο 136818). Γι' αυτό
 *   γίνεται δεκτή (`supplier-last`) μόνο όταν συμφωνεί με το PURLPRICE (±15%)· αλλιώς μένει το PURLPRICE (`purl`).
 *   Χωρίς PURLPRICE δεν υπάρχει τρόπος επαλήθευσης, άρα το είδος λείπει από τον χάρτη.
 * `null` = δεν διαβάζεται το PURLPRICE (σφάλμα υπηρεσίας) → η δικλείδα κόστους κρύβεται. Μία κλήση ανά πηγή ανά 50 MTRL.
 */
const BATCH = 50;
const TOLERANCE = 0.15;
export type Cost = { cost: number; source: "supplier-last" | "purl" };
const n = (v: string) => Number(String(v).replace(",", "."));

export async function readCosts(mtrls: number[]): Promise<Map<number, Cost> | null> {
  const ids = [...new Set(mtrls.filter((x) => Number.isInteger(x) && x > 0))];
  const out = new Map<number, Cost>();
  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const list = ids.slice(i, i + BATCH).join(",");
      const purl = new Map<number, { year: number; cost: number }>();
      for (const [m, y, , p] of await getTable("MTRCPRICES", ["MTRL", "FISCPRD", "PERIOD", "PURLPRICE"], `MTRL IN (${list}) AND PERIOD=0`)) {
        const cost = n(p), year = n(y);
        if (cost > 0 && year > (purl.get(n(m))?.year ?? -1)) purl.set(n(m), { year, cost });
      }
      // ο προμηθευτής είναι επιβεβαίωση, όχι προαπαιτούμενο: αν η ανάγνωσή του αποτύχει μένει το PURLPRICE
      const sup = new Map<number, { date: string; last: number }>();
      try {
        for (const [m, , , last, date, act] of await getTable("MTRSUPPRCS", ["MTRL", "TRDR", "SUPPRICE", "LASTPRICE", "LASTBUYDATE", "ISACTIVE"], `MTRL IN (${list})`)) {
          if (act === "1" && n(last) > 0 && date > (sup.get(n(m))?.date ?? "")) sup.set(n(m), { date, last: n(last) });
        }
      } catch { /* σκόπιμα */ }
      for (const [m, p] of purl) {
        const s = sup.get(m);
        out.set(m, s && Math.abs(s.last / p.cost - 1) <= TOLERANCE ? { cost: s.last, source: "supplier-last" } : { cost: p.cost, source: "purl" });
      }
    }
  } catch { return null; }
  return out;
}
