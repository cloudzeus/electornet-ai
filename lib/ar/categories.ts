import "server-only";
import { db } from "@/lib/db";
import type { ArCats } from "./plan";

/**
 * Ποιες κατηγορίες συμμετέχουν στο AR — επιλογή της διαχείρισης (AR → Κατηγορίες), slug → ναι/όχι. Ό,τι δεν έχει
 * ρητή επιλογή (ούτε το ίδιο ούτε κάποιος πρόγονος) ακολουθεί την προεπιλογή του τύπου (βλ. `placement.ts`).
 * Αποθηκεύεται στον πίνακα Setting (section «ar.categories»), χωρίς αλλαγή σχήματος· 60″ στη μνήμη.
 */
const SECTION = "ar.categories";
let mem: { at: number; v: ArCats } | null = null;

export async function getArCategories(): Promise<ArCats> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = Object.fromEntries(Object.entries((row?.data as Record<string, unknown>) ?? {}).filter(([, x]) => typeof x === "boolean")) as ArCats;
  mem = { at: Date.now(), v };
  return v;
}

export async function saveArCategories(v: ArCats, userId: string): Promise<ArCats> {
  const prev = await getArCategories();
  await db.setting.upsert({ where: { section: SECTION }, update: { data: v, updatedById: userId }, create: { section: SECTION, data: v, updatedById: userId } });
  mem = null;
  return prev;
}
