import "server-only";
import { db } from "@/lib/db";
import { ADMIN_NAV } from "@/components/admin/nav";
import { bestMatch } from "@/components/admin/nav-match";
import { athensDay, creditSeconds } from "./core";

const NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items);

/** Η περιοχή του μενού στην οποία ανήκει η διαδρομή (π.χ. "/admin/orders/123" → "/admin/orders"). */
export const areaFor = (path: string) => bestMatch(path, NAV_ITEMS)?.href ?? `/admin/${path.split("/")[2] ?? ""}`.replace(/\/$/, "");
/** Ετικέτα περιοχής για την αναφορά. */
export const areaLabel = (href: string) => (href === "/admin" ? "Αρχική (dashboard)" : NAV_ITEMS.find((i) => i.href === href)?.label ?? href.replace("/admin/", ""));

/** Ένα ping παρουσίας από το AdminShell: πιστώνει ενεργό χρόνο στην περιοχή της τρέχουσας σελίδας. */
export async function recordPresence(staffId: string, path: string) {
  const now = new Date();
  const last = await db.staffPresence.findFirst({ where: { staffId }, orderBy: { lastAt: "desc" }, select: { lastAt: true } });
  const add = creditSeconds(last ? now.getTime() - last.lastAt.getTime() : Infinity);
  if (!add) return;
  const key = { staffId, day: athensDay(now), area: areaFor(path) };
  await db.staffPresence.upsert({ where: { staffId_day_area: key }, create: { ...key, seconds: add, firstAt: now, lastAt: now }, update: { seconds: { increment: add }, lastAt: now } });
}
