import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { cleanAfm, isValidAfm } from "@/lib/aade/vat";
import { INTEREST_BANKS, INTEREST_ERP, INTEREST_ESHOP, INTEREST_KINDS, INTEREST_METHODS, type Opt } from "./interest-options";

/**
 * Εκδήλωση ενδιαφέροντος από τη δημόσια σελίδα της πύλης. Δημόσιο endpoint: ο έλεγχος ΑΦΜ λέει μόνο αν είναι μέλος και
 * την επωνυμία (δημόσια στοιχεία)· ποτέ επαφές/email/τηλέφωνα του μέλους. Όριο κλήσεων ανά IP στη μνήμη της διεργασίας.
 */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
function limited(key: string, max: number) {
  const now = Date.now();
  const list = (HITS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) for (const [k, v] of HITS) if (!v.some((t) => now - t < WINDOW_MS)) HITS.delete(k);
  return list.length > max;
}
async function ipOf() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

async function memberByAfm(afm: string) {
  return db.partner.findFirst({ where: { active: true, OR: [{ afm }, { afm: { endsWith: afm } }] }, select: { id: true, name: true }, orderBy: { s1Missing: "asc" } });
}

export type AfmLookup = { ok: true; afm: string; member: { name: string } | null } | { ok: false; error: string };

export async function lookupInterestAfm(raw: string): Promise<AfmLookup> {
  const afm = cleanAfm(raw);
  if (afm.length !== 9) return { ok: false, error: "Ο ΑΦΜ έχει 9 ψηφία." };
  if (!isValidAfm(afm)) return { ok: false, error: "Ο ΑΦΜ δεν είναι έγκυρος· ελέγξτε τα ψηφία." };
  if (limited(`afm:${await ipOf()}`, 20)) return { ok: false, error: "Πολλές αναζητήσεις σε λίγο χρόνο. Δοκιμάστε ξανά σε λίγα λεπτά." };
  const p = await memberByAfm(afm);
  return { ok: true, afm, member: p ? { name: p.name } : null };
}

export type InterestInput = {
  afm: string; businessName?: string; contactName: string; email: string; phone: string;
  kinds: string[]; banks: string[]; erp: string; eshop: string; method: string; notes?: string;
  /** honeypot: κρυφό πεδίο που συμπληρώνουν μόνο bots */
  website?: string;
};
export type InterestResult = { ok: true; member: boolean } | { ok: false; error: string; fields?: Record<string, string> };

const only = (opts: Opt[], vals: string[]) => [...new Set(vals)].filter((v) => opts.some((o) => o.value === v));
const one = (opts: Opt[], v: string) => (opts.some((o) => o.value === v) ? v : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateInterest(d: InterestInput): Record<string, string> {
  const f: Record<string, string> = {};
  if (!isValidAfm(cleanAfm(d.afm ?? ""))) f.afm = "Ο ΑΦΜ δεν είναι έγκυρος.";
  if ((d.contactName ?? "").trim().length < 3) f.contactName = "Γράψτε ονοματεπώνυμο.";
  if (!EMAIL.test((d.email ?? "").trim())) f.email = "Γράψτε ένα έγκυρο email.";
  const tel = (d.phone ?? "").replace(/[\s()+-]/g, "");
  if (!/^\d{10,14}$/.test(tel)) f.phone = "Γράψτε τηλέφωνο με 10 ψηφία (σταθερό ή κινητό).";
  if (!only(INTEREST_KINDS, d.kinds ?? []).length) f.kinds = "Διαλέξτε τουλάχιστον ένα.";
  if (!one(INTEREST_ERP, d.erp)) f.erp = "Διαλέξτε σύστημα.";
  if (!one(INTEREST_ESHOP, d.eshop)) f.eshop = "Διαλέξτε απάντηση.";
  if (!one(INTEREST_METHODS, d.method)) f.method = "Διαλέξτε τρόπο.";
  return f;
}

export async function submitInterest(d: InterestInput): Promise<InterestResult> {
  if (d.website) return { ok: true, member: false };
  const fields = validateInterest(d);
  if (Object.keys(fields).length) return { ok: false, error: "Ελέγξτε τα πεδία με κόκκινο.", fields };
  const ip = await ipOf();
  if (limited(`send:${ip}`, 5)) return { ok: false, error: "Έχουν σταλεί ήδη αρκετές αιτήσεις από αυτή τη σύνδεση. Δοκιμάστε ξανά αργότερα." };
  const afm = cleanAfm(d.afm);
  const p = await memberByAfm(afm);
  const banks = only(INTEREST_BANKS, d.banks ?? []);
  try {
  await db.partnerInterest.create({
    data: {
      afm, partnerId: p?.id ?? null, businessName: p?.name ?? (d.businessName?.trim().slice(0, 200) || null),
      contactName: d.contactName.trim().slice(0, 120), email: d.email.trim().toLowerCase().slice(0, 200), phone: d.phone.trim().slice(0, 40),
      kinds: only(INTEREST_KINDS, d.kinds), banks: banks.includes("no-pos") ? ["no-pos"] : banks,
      erp: one(INTEREST_ERP, d.erp), eshop: one(INTEREST_ESHOP, d.eshop), method: one(INTEREST_METHODS, d.method),
      notes: d.notes?.trim().slice(0, 2000) || null, ip: ip === "unknown" ? null : ip,
    },
  });
  } catch (e) {
    console.error("[partner-interest] αποθήκευση", e);
    return { ok: false, error: "Δεν μπορέσαμε να αποθηκεύσουμε την αίτηση. Δοκιμάστε ξανά σε λίγο." };
  }
  return { ok: true, member: !!p };
}
