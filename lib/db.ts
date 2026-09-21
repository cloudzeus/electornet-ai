import { PrismaClient } from "@prisma/client";

/**
 * Ο Postgres του server δέχεται 100 συνδέσεις για ΟΛΕΣ τις εφαρμογές που φιλοξενεί. Το Prisma ανοίγει από μόνο του
 * (πυρήνες × 2 + 1) ανά διεργασία — 25 στο Mac, ~38 στο staging — και μαζί με τα scripts χτυπούσαμε «too many clients».
 * Όριο ανά διεργασία: `DB_POOL` (προεπιλογή 8)· αν το DATABASE_URL ορίζει ήδη `connection_limit`, ισχύει εκείνο.
 */
function pooledUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${Number(process.env.DB_POOL) || 8}`;
}

/** Prisma client singleton (survives HMR in dev). */
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ datasources: { db: { url: pooledUrl() } }, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;
