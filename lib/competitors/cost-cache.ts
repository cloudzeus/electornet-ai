import "server-only";
import { getTable } from "@/lib/softone/lookups";
import { readCosts, type Cost } from "./cost";

/**
 * Κόστος αγοράς για τη λίστα του καταλόγου και το παράθυρο «Αλλαγή τιμής», για όσα προϊόντα δεν έχουν αποθηκευμένο κόστος
 * (ζευγάρια Κωτσόβολου). Ζωντανή ανάγνωση SoftOne (μόνο GetTable) με κρυφή μνήμη 6 ωρών ανά MTRL και όριο χρόνου, ώστε η
 * σελίδα να μην περιμένει το ERP: ό,τι δεν πρόλαβε φαίνεται «—» και έρχεται στο επόμενο άνοιγμα.
 * Νέα είδη χωρίς PURLPRICE: η τελευταία τιμή προμηθευτή (MTRSUPPRCS.LASTPRICE) ως `supplier-unverified` — μόνο για
 * προβολή· η μαζική αλλαγή τιμών κρατά το επιβεβαιωμένο κόστος του readCosts (μπορεί να είναι γραμμή παραστατικού εξόδων).
 */
export type ViewCost = { cost: number; source: Cost["source"] | "supplier-unverified" };
const TTL = 6 * 3600_000;
const WAIT_MS = 2500;
const mem = new Map<number, { c: ViewCost | null; at: number }>();
let inflight: Promise<void> | null = null;
const num = (v: string) => Number(String(v).replace(",", "."));

async function supplierLast(mtrls: number[]): Promise<Map<number, ViewCost>> {
  const out = new Map<number, { date: string; last: number }>();
  for (let i = 0; i < mtrls.length; i += 50) {
    // ίδια διάταξη πεδίων με το readCosts (επαληθευμένη)
    for (const [m, , , last, date, act] of await getTable("MTRSUPPRCS", ["MTRL", "TRDR", "SUPPRICE", "LASTPRICE", "LASTBUYDATE", "ISACTIVE"], `MTRL IN (${mtrls.slice(i, i + 50).join(",")})`)) {
      if (act === "1" && num(last) > 0 && date > (out.get(num(m))?.date ?? "")) out.set(num(m), { date, last: num(last) });
    }
  }
  return new Map([...out].map(([m, x]) => [m, { cost: x.last, source: "supplier-unverified" as const }]));
}

async function load(miss: number[]) {
  const r = await readCosts(miss);
  if (!r) return; // σφάλμα υπηρεσίας: τίποτα στη μνήμη, ξαναδοκιμή στο επόμενο άνοιγμα
  const rest = miss.filter((m) => !r.has(m));
  const sup = rest.length ? await supplierLast(rest).catch(() => new Map<number, ViewCost>()) : new Map<number, ViewCost>();
  const at = Date.now();
  for (const m of miss) mem.set(m, { c: r.get(m) ?? sup.get(m) ?? null, at });
}

export async function liveCosts(mtrls: number[]): Promise<Map<number, ViewCost>> {
  const now = Date.now();
  const miss = [...new Set(mtrls.filter((m) => Number.isInteger(m) && m > 0 && !((mem.get(m)?.at ?? 0) > now - TTL)))];
  if (miss.length && !inflight) inflight = load(miss).catch(() => {}).finally(() => { inflight = null; });
  if (inflight) await Promise.race([inflight, new Promise((r) => setTimeout(r, WAIT_MS))]);
  const out = new Map<number, ViewCost>();
  for (const m of mtrls) { const x = mem.get(m)?.c; if (x) out.set(m, x); }
  return out;
}
