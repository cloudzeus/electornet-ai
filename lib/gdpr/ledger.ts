import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Φίλτρα του μητρώου συναινέσεων (οθόνη GDPR → Συναινέσεις και εξαγωγή CSV). */
export interface LedgerFilter { q: string; topic: string; decision: "" | "granted" | "withdrawn"; period: "" | "90" | "year" }
export const LEDGER_PAGE = 50;

export function parseLedgerFilter(p: { q?: string | null; topic?: string | null; decision?: string | null; period?: string | null }): LedgerFilter {
  return { q: (p.q ?? "").trim().slice(0, 120), topic: p.topic ?? "", decision: p.decision === "granted" || p.decision === "withdrawn" ? p.decision : "", period: p.period === "90" || p.period === "year" ? p.period : "" };
}

export function ledgerWhere(f: LedgerFilter, now = new Date()): Prisma.ConsentWhereInput {
  const has = { contains: f.q, mode: "insensitive" as const };
  const from = f.period === "90" ? new Date(now.getTime() - 90 * 86400000) : f.period === "year" ? new Date(now.getFullYear(), 0, 1) : null;
  return {
    ...(f.q ? { OR: [{ email: has }, { customer: { OR: [{ email: has }, { lastName: has }, { firstName: has }] } }] } : {}),
    ...(f.topic ? { topic: f.topic } : {}),
    ...(f.decision ? { granted: f.decision === "granted" } : {}),
    ...(from ? { at: { gte: from } } : {}),
  };
}

export async function listLedger(f: LedgerFilter, page: number, take = LEDGER_PAGE) {
  const where = ledgerWhere(f);
  const [total, rows] = await Promise.all([
    db.consent.count({ where }),
    db.consent.findMany({ where, orderBy: { at: "desc" }, skip: (Math.max(1, page) - 1) * take, take, include: { customer: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / take)) };
}

/**
 * Τι ισχύει τώρα: η τελευταία απόφαση κάθε ανθρώπου ανά θέμα και κανάλι. Άνθρωπος = πελάτης, αλλιώς email,
 * αλλιώς (επισκέπτης, cookies) το hash της IP.
 */
export async function currentConsents() {
  return db.$queryRaw<{ topic: string; channel: string; yes: number; no: number }[]>`
    select topic, channel, count(*) filter (where granted)::int as yes, count(*) filter (where not granted)::int as no
    from (select distinct on (coalesce("customerId", email, "ipHash", id), topic, channel) topic, channel, granted
          from "Consent" order by coalesce("customerId", email, "ipHash", id), topic, channel, "at" desc) x
    group by topic, channel order by count(*) desc, topic, channel`;
}
