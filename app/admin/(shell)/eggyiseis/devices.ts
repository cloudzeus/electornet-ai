import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Κεντρική λίστα συσκευών & εγγυήσεων (CustomerDevice) για τη σελίδα «Εγγυήσεις συσκευών» και το CSV της.
 * Η πραγματική λήξη είναι η μεγαλύτερη από `warrantyUntil` και `extendedUntil` — σε SQL `GREATEST(…)`, που αγνοεί
 * τα NULL στον Postgres. Γι' αυτό φίλτρα και ταξινόμηση γίνονται με raw SQL (το Prisma δεν ταξινομεί κατά max δύο στηλών).
 */

export const STATUS_LABEL = {
  all: "Όλες",
  active: "Σε εγγύηση",
  exp30: "Λήγουν σε 30 ημέρες",
  exp60: "Λήγουν σε 60 ημέρες, χωρίς επέκταση",
  expired: "Έληξαν",
  extended: "Με ενεργή επέκταση",
  nodate: "Χωρίς ημερομηνία εγγύησης",
  open: "Με ανοιχτό αίτημα service",
} as const;
export type DeviceStatus = keyof typeof STATUS_LABEL;

export const SOURCE_LABEL: Record<string, string> = { order: "Παραγγελία e-shop", erp: "SoftOne", manual: "Ο πελάτης", staff: "Προσωπικό" };

export const SORT_LABEL = { purchased_desc: "Νεότερες αγορές πρώτα", end_asc: "Λήξη εγγύησης: πρώτα οι νωρίτερες", end_desc: "Λήξη εγγύησης: πρώτα οι αργότερες" } as const;
export type DeviceSort = keyof typeof SORT_LABEL;

/** Αιτήματα service που δεν έχουν κλείσει (ίδια λίστα με την ουρά του service). */
export const OPEN_TICKET_STATUSES = ["new", "scheduled", "in-progress", "waiting-parts"];

export const PER_PAGE = 50;

export interface DeviceFilter { q: string; status: DeviceStatus; source: string; brand: string; sort: DeviceSort }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilter(sp: Record<string, string | string[] | undefined> | URLSearchParams): DeviceFilter {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) ?? "" : one(sp[k]));
  const status = get("status"), source = get("source"), sort = get("sort");
  return {
    q: get("q").trim().slice(0, 100),
    status: status in STATUS_LABEL ? (status as DeviceStatus) : "all",
    source: source in SOURCE_LABEL ? source : "",
    brand: get("brand").trim().slice(0, 80),
    sort: sort in SORT_LABEL ? (sort as DeviceSort) : "purchased_desc",
  };
}

/** Query string με τα μη κενά φίλτρα (για συνδέσμους, σελιδοποίηση και CSV). */
export function filterQuery(f: DeviceFilter, extra: Record<string, string> = {}) {
  const u = new URLSearchParams({ q: f.q, status: f.status === "all" ? "" : f.status, source: f.source, brand: f.brand, sort: f.sort === "purchased_desc" ? "" : f.sort, ...extra });
  [...u.keys()].forEach((k) => !u.get(k) && u.delete(k));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Τρέχουσα στιγμή εκτός render (κανόνας καθαρότητας των components). */
export const nowMs = () => Date.now();

/** Ημερομηνία ως timestamp χωρίς ζώνη (UTC) — όπως τα αποθηκεύει το Prisma. */
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;
const END = Prisma.sql`GREATEST(d."warrantyUntil", d."extendedUntil")`;
const OPEN_EXISTS = Prisma.sql`EXISTS (SELECT 1 FROM "ServiceTicket" t WHERE t."deviceId" = d.id AND t.status IN (${Prisma.join(OPEN_TICKET_STATUSES)}))`;

function statusSql(s: DeviceStatus, now: Date): Prisma.Sql {
  const in30 = new Date(now.getTime() + 30 * 86400_000), in60 = new Date(now.getTime() + 60 * 86400_000);
  switch (s) {
    case "active": return Prisma.sql`${END} >= ${ts(now)}`;
    case "exp30": return Prisma.sql`${END} >= ${ts(now)} AND ${END} < ${ts(in30)}`;
    case "exp60": return Prisma.sql`${END} >= ${ts(now)} AND ${END} < ${ts(in60)} AND d."extendedUntil" IS NULL`;
    case "expired": return Prisma.sql`${END} < ${ts(now)}`;
    case "extended": return Prisma.sql`d."extendedUntil" >= ${ts(now)}`;
    case "nodate": return Prisma.sql`${END} IS NULL`;
    case "open": return OPEN_EXISTS;
    default: return Prisma.sql`TRUE`;
  }
}

function whereSql(f: DeviceFilter, now: Date): Prisma.Sql {
  const parts: Prisma.Sql[] = [statusSql(f.status, now)];
  if (f.source) parts.push(Prisma.sql`d."registeredBy" = ${f.source}`);
  if (f.brand) parts.push(Prisma.sql`d.brand ILIKE ${f.brand.replace(/[\\%_]/g, (m) => `\\${m}`)}`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const digits = f.q.replace(/\D/g, "");
    const cols = [Prisma.sql`d.serial`, Prisma.sql`d.model`, Prisma.sql`d.title`, Prisma.sql`d.brand`, Prisma.sql`d."invoiceNo"`, Prisma.sql`c."firstName"`, Prisma.sql`c."lastName"`, Prisma.sql`(c."firstName" || ' ' || c."lastName")`, Prisma.sql`(c."lastName" || ' ' || c."firstName")`, Prisma.sql`c.email`, Prisma.sql`c.mobile`, Prisma.sql`c.phone`];
    const ors = cols.map((col) => Prisma.sql`${col} ILIKE ${like}`);
    if (digits.length >= 6) ors.push(Prisma.sql`c."phoneKey" LIKE ${`%${digits.slice(-10)}%`}`);
    parts.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  return Prisma.join(parts, " AND ");
}

const ORDER: Record<DeviceSort, Prisma.Sql> = {
  purchased_desc: Prisma.sql`d."purchasedAt" DESC NULLS LAST, d."createdAt" DESC, d.id`,
  end_asc: Prisma.sql`${END} ASC NULLS LAST, d.id`,
  end_desc: Prisma.sql`${END} DESC NULLS LAST, d.id`,
};

export interface DeviceRow {
  id: string; brand: string; title: string; model: string | null; serial: string | null;
  purchasedAt: Date | null; warrantyMonths: number; warrantyUntil: Date | null; extendedUntil: Date | null; extendedPlan: string | null;
  invoiceNo: string | null; notes: string | null; registeredBy: string; createdAt: Date;
  customerId: string; customerNumber: number; firstName: string; lastName: string; company: string | null; email: string | null; mobile: string | null; phone: string | null;
  openTickets: number;
}

/** Μία σελίδα συσκευών με τα στοιχεία του πελάτη και τα ανοιχτά αιτήματα service. */
export async function listDevices(f: DeviceFilter, opts: { skip: number; take: number }, now = new Date(nowMs())) {
  const where = whereSql(f, now);
  const [rows, count] = await Promise.all([
    db.$queryRaw<DeviceRow[]>(Prisma.sql`
      SELECT d.id, d.brand, d.title, d.model, d.serial, d."purchasedAt", d."warrantyMonths", d."warrantyUntil", d."extendedUntil", d."extendedPlan",
             d."invoiceNo", d.notes, d."registeredBy", d."createdAt",
             c.id AS "customerId", c.number AS "customerNumber", c."firstName", c."lastName", c.company, c.email, c.mobile, c.phone,
             (SELECT COUNT(*)::int FROM "ServiceTicket" t WHERE t."deviceId" = d.id AND t.status IN (${Prisma.join(OPEN_TICKET_STATUSES)})) AS "openTickets"
      FROM "CustomerDevice" d JOIN "Customer" c ON c.id = d."customerId"
      WHERE ${where}
      ORDER BY ${ORDER[f.sort]}
      LIMIT ${opts.take} OFFSET ${opts.skip}`),
    db.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n FROM "CustomerDevice" d JOIN "Customer" c ON c.id = d."customerId" WHERE ${where}`),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

/** Οι μετρήσεις της κορυφής (σε όλες τις συσκευές, ανεξάρτητα από τα φίλτρα) — ένα πέρασμα του πίνακα. */
export async function deviceKpis(now = new Date(nowMs())) {
  const [r] = await db.$queryRaw<Record<"total" | "active" | "exp30" | "exp60" | "expired" | "extended" | "nodate" | "open", number>[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${statusSql("active", now)})::int AS active,
      COUNT(*) FILTER (WHERE ${statusSql("exp30", now)})::int AS exp30,
      COUNT(*) FILTER (WHERE ${statusSql("exp60", now)})::int AS exp60,
      COUNT(*) FILTER (WHERE ${statusSql("expired", now)})::int AS expired,
      COUNT(*) FILTER (WHERE ${statusSql("extended", now)})::int AS extended,
      COUNT(*) FILTER (WHERE ${statusSql("nodate", now)})::int AS nodate,
      COUNT(*) FILTER (WHERE ${OPEN_EXISTS})::int AS open
    FROM "CustomerDevice" d`);
  return r ?? { total: 0, active: 0, exp30: 0, exp60: 0, expired: 0, extended: 0, nodate: 0, open: 0 };
}

/** Μάρκες με πλήθος συσκευών, για το φίλτρο. */
export async function deviceBrands() {
  const rows = await db.customerDevice.groupBy({ by: ["brand"], _count: { _all: true }, orderBy: { brand: "asc" } });
  return rows.filter((r) => r.brand.trim()).map((r) => ({ brand: r.brand, n: r._count._all }));
}

/** Ημέρες ως τη λήξη (αρνητικές = έληξε), ή null χωρίς ημερομηνία. */
export function daysLeft(r: { warrantyUntil: Date | null; extendedUntil: Date | null }, now: number) {
  const end = [r.warrantyUntil, r.extendedUntil].filter((x): x is Date => !!x).reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
  return end ? { end, days: Math.ceil((end.getTime() - now) / 86400_000) } : null;
}
