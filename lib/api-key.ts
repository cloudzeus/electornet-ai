import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Έλεγχος API key για εξωτερικά συστήματα (π.χ. ταμεία καταστημάτων). Το κλειδί έρχεται ως «Authorization: Bearer eu_…»
 * ή «x-api-key». Αποθηκεύεται μόνο το sha256 του (Ρυθμίσεις → API keys, super-admin). Χρειάζεται το scope ή «*».
 */
let touched = new Map<string, number>();
export async function verifyApiKey(req: Request, scope: string) {
  const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!/^eu_[\w-]{20,}$/.test(raw)) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const key = await db.apiKey.findUnique({ where: { hash } });
  if (!key || !key.active || (key.expiresAt && key.expiresAt < new Date())) return null;
  if (!key.scopes.includes(scope) && !key.scopes.includes("*")) return null;
  // lastUsedAt το πολύ μία φορά το λεπτό ανά κλειδί
  if (Date.now() - (touched.get(key.id) ?? 0) > 60_000) { touched.set(key.id, Date.now()); if (touched.size > 1000) touched = new Map(); void db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => null); }
  return key;
}
