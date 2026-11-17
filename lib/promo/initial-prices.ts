import "server-only";
import { db } from "@/lib/db";

const SECTION = "s1-initial-prices";

/**
 * «Αρχική Τιμή Web» του SoftOne (`MTREXTRA.NUM03`) ανά κωδικό είδους (MTRL), σε ευρώ — η διαγραμμένη τιμή των προσφορών
 * «Διαγραμμένες τιμές SoftOne». Τη γράφει ο συγχρονισμός τιμών των 10 λεπτών· το eshop μόνο τη διαβάζει.
 * shortcut: ζει σε μία γραμμή `Setting` (σήμερα ~130 είδη)· αν γίνουν χιλιάδες, να γίνει στήλη στο `S1Item`.
 */
export async function initialPrices(): Promise<Map<string, number>> {
  const row = await db.setting.findUnique({ where: { section: SECTION }, select: { data: true } });
  return new Map(Object.entries((row?.data ?? {}) as Record<string, number>));
}

/** Αποθηκεύει τον νέο χάρτη· `true` αν άλλαξε κάτι (τότε ξαναϋπολογίζονται οι έτοιμες τιμές προσφορών). */
export async function saveInitialPrices(next: Record<string, number>): Promise<boolean> {
  const prev = Object.fromEntries(await initialPrices());
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  if (![...keys].some((k) => prev[k] !== next[k])) return false;
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data: next }, update: { data: next } });
  return true;
}
