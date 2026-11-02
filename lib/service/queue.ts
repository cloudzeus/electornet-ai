import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { openRescheduleRequest, parseTimeline } from "./core";

/**
 * Η ουρά service της διαχείρισης: προβολές με πλήθη, φίλτρα από τη διεύθυνση (κοινοποιήσιμα), σελιδοποίηση.
 * Οι ημέρες μετρούν σε ώρα Ελλάδας.
 */

export const VIEWS = [
  { key: "open", label: "Ανοιχτά" },
  { key: "new", label: "Νέα, χωρίς ραντεβού" },
  { key: "today", label: "Σήμερα" },
  { key: "upcoming", label: "Επόμενες ημέρες" },
  { key: "requests", label: "Ζητούν αλλαγή ώρας" },
  { key: "in-progress", label: "Σε εξέλιξη" },
  { key: "waiting-parts", label: "Ανταλλακτικά" },
  { key: "stale", label: "Ανοιχτά > 7 ημέρες" },
  { key: "done", label: "Ολοκληρωμένα" },
  { key: "cancelled", label: "Ακυρωμένα" },
  { key: "all", label: "Όλα" },
] as const;
export type View = (typeof VIEWS)[number]["key"];
export const isView = (v: unknown): v is View => VIEWS.some((x) => x.key === v);

const OPEN = ["new", "scheduled", "in-progress", "waiting-parts"];

/** Αρχή της σημερινής ημέρας (Ελλάδα) σε UTC, + n ημέρες. */
export function athensDay(n = 0, now = new Date()) {
  const s = now.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" }); // YYYY-MM-DD
  const offset = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Athens" })).getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(new Date(`${s}T00:00:00Z`).getTime() - offset + n * 86400000);
}

export interface QueueFilters { view: View; q?: string; kind?: string; store?: string; tech?: string; page: number }

function viewWhere(v: View): Prisma.ServiceTicketWhereInput {
  const open = { status: { in: OPEN } };
  switch (v) {
    case "open": case "requests": return open;
    case "new": return { status: "new", scheduledAt: null };
    case "today": return { ...open, scheduledAt: { gte: athensDay(0), lt: athensDay(1) } };
    case "upcoming": return { ...open, scheduledAt: { gte: athensDay(1) } };
    case "in-progress": return { status: "in-progress" };
    case "waiting-parts": return { status: "waiting-parts" };
    case "stale": return { ...open, createdAt: { lt: new Date(Date.now() - 7 * 86400000) } };
    case "done": return { status: "done" };
    case "cancelled": return { status: "cancelled" };
    default: return {};
  }
}

function filterWhere(f: Omit<QueueFilters, "view" | "page">): Prisma.ServiceTicketWhereInput {
  const and: Prisma.ServiceTicketWhereInput[] = [];
  if (f.kind) and.push({ kind: f.kind });
  if (f.store === "none") and.push({ storeId: null });
  else if (f.store) and.push({ storeId: f.store });
  if (f.tech) and.push({ technician: f.tech });
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const words = q.split(/\s+/).filter(Boolean);
    and.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { erpJob: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { device: { is: { OR: [{ serial: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] } } },
        { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
        ...(digits.length >= 6 ? [{ customer: { is: { OR: [{ mobile: { contains: digits } }, { phone: { contains: digits } }, { phoneKey: { contains: digits.slice(-10) } }] } } }] : []),
        { customer: { is: { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })) } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export const PER_PAGE = 40;

export async function loadQueue(f: QueueFilters) {
  const base = filterWhere(f);
  const where: Prisma.ServiceTicketWhereInput = { AND: [base, viewWhere(f.view)] };
  const order: Prisma.ServiceTicketOrderByWithRelationInput[] = f.view === "done" || f.view === "cancelled" || f.view === "all" ? [{ updatedAt: "desc" }] : [{ scheduledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }];
  const select = {
    id: true, number: true, kind: true, status: true, mode: true, description: true, scheduledAt: true, slot: true, technician: true, storeId: true, inWarranty: true, createdAt: true, updatedAt: true, timeline: true, erpJob: true,
    customer: { select: { id: true, firstName: true, lastName: true, mobile: true, phone: true } },
    device: { select: { brand: true, title: true, serial: true } },
  } as const;

  // «Ζητούν αλλαγή ώρας» βγαίνει από την πορεία (JSON) — φιλτράρεται εδώ, σε όλα τα ανοιχτά
  const requestsOf = async (w: Prisma.ServiceTicketWhereInput) => {
    const rows = await db.serviceTicket.findMany({ where: w, select: { id: true, timeline: true } });
    return rows.filter((r) => openRescheduleRequest(parseTimeline(r.timeline))).map((r) => r.id);
  };

  const [counts, requestIds, stores, techs] = await Promise.all([
    Promise.all(VIEWS.filter((v) => v.key !== "requests").map(async (v) => [v.key, await db.serviceTicket.count({ where: { AND: [base, viewWhere(v.key)] } })] as const)),
    requestsOf({ AND: [base, viewWhere("requests")] }),
    db.store.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true } }),
    db.serviceTicket.findMany({ where: { technician: { not: null } }, distinct: ["technician"], select: { technician: true }, take: 200 }),
  ]);
  const finalWhere = f.view === "requests" ? { id: { in: requestIds } } : where;
  const [total, rows] = await Promise.all([
    db.serviceTicket.count({ where: finalWhere }),
    db.serviceTicket.findMany({ where: finalWhere, orderBy: order, skip: (f.page - 1) * PER_PAGE, take: PER_PAGE, select }),
  ]);
  const count = Object.fromEntries([...counts, ["requests", requestIds.length]]) as Record<View, number>;
  const storeName = new Map(stores.map((s) => [s.id, `${s.city} — ${s.name}`]));
  return {
    count, total, stores, technicians: techs.map((t) => t.technician!).filter(Boolean).sort((a, b) => a.localeCompare(b, "el")),
    rows: rows.map((t) => ({ ...t, store: t.storeId ? storeName.get(t.storeId) ?? null : null, request: openRescheduleRequest(parseTimeline(t.timeline)) })),
  };
}

export type QueueRow = Awaited<ReturnType<typeof loadQueue>>["rows"][number];
