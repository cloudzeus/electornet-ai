import { PrismaClient } from "@prisma/client";

/**
 * Ο Postgres του server είναι κοινός με άλλα projects (100 συνδέσεις για ΟΛΕΣ). Μπροστά του τρέχει **PgBouncer** (θύρα
 * 6432), που μοιράζει λίγες πραγματικές συνδέσεις στη βάση σε πολλές της εφαρμογής — έτσι η εφαρμογή μπορεί να έχει
 * περισσότερες (λιγότερη ουρά όταν μια σελίδα κάνει πολλά ερωτήματα μαζί) χωρίς να γεμίζει τη βάση.
 *   μέσω PgBouncer (θύρα 6432): προεπιλογή 25 ανά διεργασία · απευθείας (5432): 8
 * `DB_POOL` αλλάζει την προεπιλογή· αν το DATABASE_URL ορίζει ήδη `connection_limit`, ισχύει εκείνο.
 * ΟΧΙ `pgbouncer=true`: ο PgBouncer δέχεται prepared statements (δοκιμή 14/10/2026, 400 ερωτήματα / 25 συνδέσεις,
 * 0 σφάλματα) και το `pgbouncer=true` τα κλείνει — κάθε ερώτημα ~5× πιο αργό. Αλλαγές σχήματος: DIRECT_URL (5432).
 */
export const viaPgBouncer = (url: string | undefined) => !!url && /:6432(\/|$)/.test(url.split("?")[0]);
function pooledUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  const extra = [
    ...(/[?&]connection_limit=/.test(url) ? [] : [`connection_limit=${Number(process.env.DB_POOL) || (viaPgBouncer(url) ? 25 : 8)}`]),
    // περιμένει ελεύθερη σύνδεση έως 20″ (προεπιλογή Prisma 10″) — με κοινή βάση οι αιχμές συμβαίνουν
    ...(/[?&]pool_timeout=/.test(url) ? [] : ["pool_timeout=20"]),
  ];
  return extra.length ? `${url}${sep}${extra.join("&")}` : url;
}

/** Prisma client singleton (survives HMR in dev). */
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ datasources: { db: { url: pooledUrl() } }, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;
