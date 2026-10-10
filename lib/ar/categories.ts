import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ArCats, ArCatRule } from "./plan";
import { isSurface } from "./placement";

/**
 * Ποιες κατηγορίες συμμετέχουν στο AR και πού μπαίνουν — επιλογή της διαχείρισης (AR → Κατηγορίες), slug → κανόνας. Ό,τι δεν έχει
 * ρητή επιλογή (ούτε το ίδιο ούτε κάποιος πρόγονος) ακολουθεί την προεπιλογή του τύπου (βλ. `placement.ts`).
 * Αποθηκεύεται στον πίνακα Setting (section «ar.categories»), χωρίς αλλαγή σχήματος· 60″ στη μνήμη.
 */
const SECTION = "ar.categories";
let mem: { at: number; v: ArCats } | null = null;

export async function getArCategories(): Promise<ArCats> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = normalizeArCats(row?.data);
  mem = { at: Date.now(), v };
  return v;
}

export async function saveArCategories(v: ArCats, userId: string): Promise<ArCats> {
  const prev = await getArCategories();
  await db.setting.upsert({ where: { section: SECTION }, update: { data: v as Prisma.InputJsonValue, updatedById: userId }, create: { section: SECTION, data: v as Prisma.InputJsonValue, updatedById: userId } });
  mem = null;
  return prev;
}

/** Καθαρός κανόνας ανά slug (δέχεται και την παλιά μορφή slug → true/false)· άδειοι κανόνες πετιούνται. */
export function normalizeArCats(raw: unknown): ArCats {
  const out: ArCats = {};
  for (const [k, x] of Object.entries((raw as Record<string, unknown>) ?? {})) {
    const r: ArCatRule = {};
    if (typeof x === "boolean") r.on = x;
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.on === "boolean") r.on = o.on;
      if (isSurface(o.surface)) r.surface = o.surface;
    }
    if (r.on !== undefined || r.surface) out[k] = r;
  }
  return out;
}
