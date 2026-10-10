import "server-only";
import { db } from "@/lib/db";
import { getPlans } from "@/lib/cms/home-plans";
import { getHeroAdminDoc } from "@/lib/cms/hero-slides";
import { slideStatus } from "@/lib/cms/hero-slides-model";
import { snapStats } from "@/lib/snap/stats";
import { can } from "@/lib/rbac/permissions";
import { getFeatures } from "@/lib/admin/features";
import { getSetting } from "@/lib/settings/store";
import type { Tone, WidgetData } from "./catalog";

/**
 * Τα δεδομένα κάθε component του dashboard — όλα από τη βάση (καθόλου δείγματα). Κάθε loader είναι ανεξάρτητος:
 * αν αποτύχει, το component δείχνει μήνυμα σφάλματος και τα υπόλοιπα συνεχίζουν. Οι υπάλληλοι καταστήματος
 * (Staff.storeId) βλέπουν μόνο το κατάστημά τους.
 */
export type DashUser = { id: string; roles: string[]; permissions: string[]; storeId?: string | null };
type Loader = (u: DashUser) => Promise<WidgetData>;

/* ---------------- βοηθητικά ---------------- */
const TZ = "Europe/Athens";
const tzOffset = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: TZ })).getTime() - new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
/** μεσάνυχτα Αθήνας, `daysAgo` ημέρες πριν */
export function dayStart(daysAgo = 0): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d - daysAgo);
  return new Date(utc - tzOffset(new Date(utc)));
}
const eur = (n: number, digits = 0) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits });
const num = (n: number) => n.toLocaleString("el-GR");
const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "μόλις τώρα";
  if (m < 60) return `πριν ${m}′`;
  const h = Math.round(m / 60);
  if (h < 24) return `πριν ${h} ώρ.`;
  const days = Math.round(h / 24);
  return `πριν ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
};
const when = (d: Date) => d.toLocaleString("el-GR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hours = (d: Date) => (Date.now() - d.getTime()) / 3_600_000;
function delta(cur: number, prev: number, upIsGood = true): NonNullable<WidgetData["headline"]>["delta"] {
  if (!prev && !cur) return undefined; // τίποτα για σύγκριση
  if (!prev) return { text: "νέο", dir: "up", good: upIsGood };
  const p = Math.round(((cur - prev) / prev) * 100);
  const dir = p > 0 ? "up" : p < 0 ? "down" : "flat";
  return { text: `${p > 0 ? "+" : ""}${p}%`, dir, good: dir === "flat" || (dir === "up") === upIsGood };
}
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** ημερήσια σειρά N ημερών (ώρα Αθήνας) από γραμμές με ημερομηνία και προαιρετική τιμή */
function daily(rows: { at: Date; v?: number }[], days: number, show: (v: number) => string) {
  const list = Array.from({ length: days }, (_, i) => dayStart(days - 1 - i));
  const by = new Map(list.map((d) => [dayKey(d), 0]));
  for (const r of rows) { const k = dayKey(r.at); if (by.has(k)) by.set(k, by.get(k)! + (r.v ?? 1)); }
  return list.map((d) => ({ label: d.toLocaleDateString("el-GR", { timeZone: TZ, day: "numeric", month: "numeric" }), value: by.get(dayKey(d))!, display: show(by.get(dayKey(d))!) }));
}
const has = (u: DashUser, ...keys: string[]) => keys.some((k) => can(u.permissions, k));
/** υπάλληλος καταστήματος: μόνο ό,τι αφορά το κατάστημά του */
const scoped = (u: DashUser) => !!u.storeId && !has(u, "orders.write") ? u.storeId! : null;
const LIVE = ["paid", "processing", "shipped", "ready-for-pickup", "delivered"];
const FUL: Record<string, string> = { courier: "Courier", "click-collect": "Παραλαβή", appointment: "Ραντεβού" };
const STATUS: Record<string, string> = { pending: "Νέα", paid: "Πληρωμένη", processing: "Σε επεξεργασία", shipped: "Στάλθηκε", "ready-for-pickup": "Έτοιμη για παραλαβή", delivered: "Παραδόθηκε", cancelled: "Ακυρώθηκε", returned: "Επιστροφή" };
const customerName = (o: { customer: { firstName: string; lastName: string } | null; guestEmail: string | null }) => (o.customer ? `${o.customer.firstName} ${o.customer.lastName}`.trim() : o.guestEmail ?? "Επισκέπτης");

/* ---------------- loaders ---------------- */
const L: Record<string, Loader> = {
  async approvals(u) {
    const rows: NonNullable<WidgetData["rows"]> = [];
    if (has(u, "catalog.promos.approve")) {
      const pending = await db.promotionVersion.findMany({ where: { snapshot: { path: ["pending"], equals: true } }, orderBy: { createdAt: "asc" }, take: 30, select: { version: true, createdAt: true, promotion: { select: { id: true, name: true, version: true } } } });
      for (const v of pending.filter((x) => x.version > x.promotion.version)) rows.push({ title: `Προσφορά «${v.promotion.name}»`, sub: "Αλλαγή περιμένει έγκριση", meta: ago(v.createdAt), tone: hours(v.createdAt) > 24 ? "bad" : "warn", href: `/admin/prosfores/${v.promotion.id}` });
      const held = await db.promotion.findMany({ where: { held: true, status: { notIn: ["ended", "archived"] } }, take: 10, select: { id: true, name: true, heldReason: true, updatedAt: true } });
      for (const p of held) rows.push({ title: `Προσφορά «${p.name}» σε αναμονή`, sub: p.heldReason ?? "Κρατήθηκε — θέλει έλεγχο", meta: ago(p.updatedAt), tone: "warn", href: `/admin/prosfores/${p.id}` });
    }
    const home = await getPlans().catch(() => null);
    if (home?.review && (has(u, "cms.zones.publish") || home.review.by === u.id)) rows.push({ title: "Αρχική σελίδα", sub: home.review.by === u.id ? "Το έστειλες — περιμένει έγκριση" : `${home.review.byName}: ${home.review.changes} αλλαγές${home.review.note ? ` — «${home.review.note}»` : ""}`, meta: ago(new Date(home.review.at)), tone: home.review.by === u.id ? "info" : "warn", href: "/admin/cms/home" });
    const brands = await db.cmsDocument.findMany({ where: { collection: "brand.stores.plans", locale: "el" }, select: { key: true, data: true } });
    for (const b of brands) {
      const r = (b.data as { review?: { by: string; byName: string; at: string; note: string; changes: number } | null } | null)?.review;
      if (!r || !(has(u, "cms.publish") || r.by === u.id)) continue;
      rows.push({ title: `Σελίδα μάρκας ${b.key.toUpperCase()}`, sub: r.by === u.id ? "Το έστειλες — περιμένει έγκριση" : `${r.byName}: ${r.changes} αλλαγές${r.note ? ` — «${r.note}»` : ""}`, meta: ago(new Date(r.at)), tone: r.by === u.id ? "info" : "warn", href: `/admin/cms/brand-stores/${b.key}` });
    }
    const mine = rows.filter((r) => r.tone !== "info").length;
    return { rows: rows.slice(0, 8), total: rows.length, empty: "Τίποτα δεν περιμένει έγκριση.", badge: mine ? { n: mine, tone: "warn" } : undefined };
  },

  async "orders-queue"(u) {
    const store = scoped(u);
    const where = { status: { in: ["pending", "paid", "processing"] }, ...(store ? { pickupStoreId: store } : {}) };
    const [total, list] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({ where, orderBy: { createdAt: "asc" }, take: 7, select: { number: true, status: true, fulfilment: true, total: true, createdAt: true, customerId: true, guestEmail: true, customer: { select: { firstName: true, lastName: true } } } }),
    ]);
    const late = await db.order.count({ where: { ...where, createdAt: { lt: new Date(Date.now() - 48 * 3_600_000) } } });
    return {
      stats: [{ label: "Σε αναμονή", value: num(total), tone: total ? "info" : "ok" }, { label: "Πάνω από 48 ώρες", value: num(late), tone: late ? "bad" : "ok" }],
      rows: list.map((o) => ({ title: `#${o.number} · ${customerName(o)}`, sub: `${STATUS[o.status] ?? o.status} · ${FUL[o.fulfilment] ?? o.fulfilment} · ${eur(Number(o.total), 2)}`, meta: ago(o.createdAt), tone: hours(o.createdAt) > 48 ? "bad" : hours(o.createdAt) > 24 ? "warn" : "muted", href: o.customerId ? `/admin/customers/${o.customerId}` : undefined })),
      total, empty: store ? "Καμία παραγγελία σε αναμονή για το κατάστημά σου." : "Καμία παραγγελία σε αναμονή.", badge: late ? { n: late, tone: "bad" } : undefined,
      note: "Η σελίδα παραγγελιών έρχεται σύντομα· κάθε γραμμή ανοίγει τον πελάτη.",
    };
  },

  async shipments() {
    const today = dayStart();
    const [waiting, open, delivered, problems] = await Promise.all([
      db.order.count({ where: { fulfilment: "courier", status: { in: ["pending", "paid", "processing"] }, shipments: { none: { status: { not: "cancelled" } } } } }),
      db.shipment.count({ where: { status: "created" } }),
      db.shipment.count({ where: { status: "delivered", deliveredAt: { gte: today } } }),
      db.shipment.findMany({ where: { OR: [{ status: { in: ["attempted", "on-hold", "returning"] } }, { error: { not: null }, status: { notIn: ["cancelled", "delivered"] } }] }, orderBy: { updatedAt: "desc" }, take: 6, select: { voucher: true, status: true, error: true, carrier: true, updatedAt: true, order: { select: { number: true } } } }),
    ]);
    const P: Record<string, string> = { attempted: "Ανεπιτυχής επίδοση", "on-hold": "Σε αναμονή", returning: "Επιστρέφει" };
    const mix = await db.shipment.groupBy({ by: ["status"], where: { createdAt: { gte: dayStart(30) }, status: { not: "cancelled" } }, _count: { _all: true } });
    const grp = (keys: string[]) => mix.filter((m) => keys.includes(m.status)).reduce((s2, m) => s2 + m._count._all, 0);
    return {
      stats: [
        { label: "Χωρίς voucher", value: num(waiting), tone: waiting ? "warn" : "ok", href: "/admin/apostoles/vouchers" },
        { label: "Για κλείσιμο ημέρας", value: num(open), tone: open ? "info" : "ok", href: "/admin/apostoles/vouchers" },
        { label: "Παραδόθηκαν σήμερα", value: num(delivered), tone: "ok" },
      ],
      rows: problems.map((s) => ({ title: `#${s.order.number} · ${s.voucher ?? "χωρίς voucher"}`, sub: s.error ? `Σφάλμα: ${s.error}` : P[s.status] ?? s.status, meta: ago(s.updatedAt), tone: "bad", href: "/admin/apostoles/vouchers" })),
      parts: [{ label: "Παραδόθηκαν", value: grp(["delivered"]), tone: "ok" }, { label: "Στον δρόμο", value: grp(["created", "closed", "in-transit", "out-for-delivery"]), tone: "info" }, { label: "Πρόβλημα", value: grp(["attempted", "on-hold", "returning", "returned"]), tone: "bad" }],
      empty: "Καμία αποστολή με πρόβλημα.", href: "/admin/apostoles/vouchers", hrefLabel: "Vouchers",
      badge: problems.length ? { n: problems.length, tone: "bad" } : undefined,
    };
  },

  async couriers() {
    const f = await getFeatures();
    const ship = (await getSetting("shipping").catch(() => ({ data: {} as Record<string, unknown> }))).data;
    const C: { id: "geniki" | "acs" | "boxnow" | "elta" | "asap"; name: string; api: boolean; env?: string }[] = [
      { id: "geniki", name: "Γενική Ταχυδρομική", api: true, env: ship.genikiEnv === "live" ? "Παραγωγή" : "Δοκιμαστικό" },
      { id: "acs", name: "ACS", api: false }, { id: "boxnow", name: "BOX NOW", api: false, env: ship.boxnowEnv === "production" ? "Παραγωγή" : "Δοκιμαστικό" },
      { id: "elta", name: "ΕΛΤΑ Courier", api: false }, { id: "asap", name: "ASAP", api: false },
    ];
    const on = C.filter((c) => f[c.id]);
    const by = await db.shipment.groupBy({ by: ["carrier", "status"], where: { createdAt: { gte: dayStart(30) } }, _count: { _all: true } }).catch(() => []);
    const n = (carrier: string, st?: string[]) => by.filter((r) => r.carrier === carrier && (!st || st.includes(r.status))).reduce((s2, r) => s2 + r._count._all, 0);
    return {
      stats: [{ label: "Click & Collect", value: f.clickCollect ? "Ενεργό" : "Ανενεργό", tone: f.clickCollect ? "ok" : "muted" }, { label: "Παράδοση με ραντεβού", value: f.appointment ? "Ενεργή" : "Ανενεργή", tone: f.appointment ? "ok" : "muted" }],
      rows: on.map((c) => ({ title: c.name, sub: `${c.api ? `Vouchers από εδώ · ${c.env}` : "Χωρίς σύνδεση API ακόμη"}${c.api ? ` · ${n(c.id, ["created"])} ανοιχτά` : ""}`, meta: `${n(c.id)} / 30 ημ.`, tone: c.api ? (c.env === "Παραγωγή" ? "ok" : "warn") : "muted", href: c.id === "geniki" ? "/admin/apostoles/vouchers" : "/admin/settings/shipping" })),
      empty: "Κανένας courier ενεργός — ενεργοποίηση στις Ρυθμίσεις → Αποστολές.", emptyTone: "warn",
      href: "/admin/apostoles", hrefLabel: "Κανόνες αποστολής",
    };
  },

  async pickups(u) {
    const store = scoped(u);
    const where = { fulfilment: "click-collect", status: { in: ["paid", "processing", "ready-for-pickup"] }, ...(store ? { pickupStoreId: store } : {}) };
    const [list, ready, waitingLong] = await Promise.all([
      db.order.findMany({ where, orderBy: { createdAt: "asc" }, take: 7, select: { number: true, status: true, total: true, createdAt: true, updatedAt: true, customerId: true, guestEmail: true, customer: { select: { firstName: true, lastName: true } }, pickupStore: { select: { name: true } } } }),
      db.order.count({ where: { ...where, status: "ready-for-pickup" } }),
      db.order.count({ where: { ...where, status: "ready-for-pickup", updatedAt: { lt: new Date(Date.now() - 5 * 86_400_000) } } }),
    ]);
    const prep = await db.order.count({ where: { ...where, status: { in: ["paid", "processing"] } } });
    return {
      stats: [{ label: "Για ετοιμασία", value: num(prep), tone: prep ? "warn" : "ok" }, { label: "Περιμένουν τον πελάτη", value: num(ready), tone: "info" }, { label: "Πάνω από 5 ημέρες", value: num(waitingLong), tone: waitingLong ? "bad" : "ok" }],
      rows: list.map((o) => ({ title: `#${o.number} · ${customerName(o)}`, sub: `${STATUS[o.status]}${o.pickupStore && !store ? ` · ${o.pickupStore.name}` : ""} · ${eur(Number(o.total), 2)}`, meta: ago(o.status === "ready-for-pickup" ? o.updatedAt : o.createdAt), tone: o.status === "ready-for-pickup" ? (hours(o.updatedAt) > 120 ? "bad" : "info") : "warn", href: o.customerId ? `/admin/customers/${o.customerId}` : undefined })),
      empty: "Καμία παραλαβή σε εκκρεμότητα.", badge: prep ? { n: prep, tone: "warn" } : undefined,
    };
  },

  async service(u) {
    const store = scoped(u);
    const open = { status: { in: ["new", "scheduled", "in-progress", "waiting-parts"] }, ...(store ? { storeId: store } : {}) };
    const t0 = dayStart(), t1 = dayStart(-1);
    const K: Record<string, string> = { repair: "Επισκευή", installation: "Εγκατάσταση", delivery: "Παράδοση", pickup: "Παραλαβή", appointment: "Ραντεβού", "warranty-claim": "Εγγύηση" };
    const S: Record<string, string> = { new: "Νέο", scheduled: "Προγραμματισμένο", "in-progress": "Σε εξέλιξη", "waiting-parts": "Αναμονή ανταλλακτικών" };
    const [fresh, today, parts, list] = await Promise.all([
      db.serviceTicket.count({ where: { ...open, status: "new" } }),
      db.serviceTicket.count({ where: { ...open, scheduledAt: { gte: t0, lt: t1 } } }),
      db.serviceTicket.count({ where: { ...open, status: "waiting-parts" } }),
      db.serviceTicket.findMany({ where: open, orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 7, select: { number: true, kind: true, status: true, scheduledAt: true, createdAt: true, customerId: true, customer: { select: { firstName: true, lastName: true } } } }),
    ]);
    return {
      stats: [{ label: "Νέα", value: num(fresh), tone: fresh ? "warn" : "ok" }, { label: "Ραντεβού σήμερα", value: num(today), tone: "info" }, { label: "Αναμονή ανταλλακτικών", value: num(parts), tone: parts ? "warn" : "ok" }],
      rows: list.map((t) => ({ title: `${K[t.kind] ?? t.kind} · ${t.customer.firstName} ${t.customer.lastName}`, sub: `#${t.number} · ${S[t.status] ?? t.status}`, meta: t.scheduledAt ? when(t.scheduledAt) : ago(t.createdAt), tone: t.status === "new" ? "warn" : "muted", href: `/admin/customers/${t.customerId}` })),
      empty: "Κανένα ανοιχτό αίτημα service.", badge: fresh ? { n: fresh, tone: "warn" } : undefined,
    };
  },

  async gdpr() {
    const open = { status: { notIn: ["done", "rejected"] } };
    const [count, list] = await Promise.all([db.gdprRequest.count({ where: open }), db.gdprRequest.findMany({ where: open, orderBy: { dueAt: "asc" }, take: 5, select: { number: true, type: true, email: true, dueAt: true } })]);
    const T: Record<string, string> = { access: "Πρόσβαση", export: "Εξαγωγή", erasure: "Διαγραφή", rectification: "Διόρθωση", objection: "Εναντίωση", restriction: "Περιορισμός" };
    const overdue = list.filter((g) => g.dueAt < new Date()).length;
    return {
      rows: list.map((g) => { const days = Math.ceil((g.dueAt.getTime() - Date.now()) / 86_400_000); return { title: `${T[g.type] ?? g.type} · ${g.email}`, sub: `#${g.number}`, meta: days < 0 ? `εκπρόθεσμο ${-days} ημ.` : `σε ${days} ημ.`, tone: days < 0 ? "bad" : days <= 7 ? "warn" : "muted", href: "/admin/gdpr" }; }),
      total: count, empty: "Κανένα ανοιχτό αίτημα.", href: "/admin/gdpr", hrefLabel: "GDPR", badge: overdue ? { n: overdue, tone: "bad" } : count ? { n: count, tone: "info" } : undefined,
    };
  },

  async payments() {
    const since = new Date(Date.now() - 86_400_000);
    const [failed, stuck, erpFailed, erpQueued] = await Promise.all([
      db.payment.count({ where: { status: "failed", updatedAt: { gte: since } } }),
      db.payment.count({ where: { status: "pending", updatedAt: { lt: new Date(Date.now() - 3_600_000) }, order: { status: { notIn: ["cancelled"] }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } } }),
      db.erpSync.count({ where: { status: "failed" } }),
      db.erpSync.count({ where: { status: "queued" } }),
    ]);
    return {
      stats: [
        { label: "Αποτυχημένες πληρωμές (24ω)", value: num(failed), tone: failed ? "bad" : "ok" },
        { label: "Πληρωμές που κρέμονται >1 ώρα", value: num(stuck), tone: stuck ? "warn" : "ok" },
        { label: "Δεν πέρασαν στο SoftOne", value: num(erpFailed), tone: erpFailed ? "bad" : "ok" },
        { label: "Σε ουρά για SoftOne", value: num(erpQueued), tone: "info" },
      ],
      badge: failed + erpFailed ? { n: failed + erpFailed, tone: "bad" } : undefined,
    };
  },

  async sales() {
    const t0 = dayStart(), y0 = dayStart(1), w0 = dayStart(7), p0 = dayStart(14);
    const nowMs = Date.now(), sameTimeYesterday = new Date(nowMs - 86_400_000);
    const agg = (gte: Date, lt: Date) => db.order.aggregate({ where: { status: { in: LIVE }, createdAt: { gte, lt } }, _sum: { total: true }, _count: { _all: true } });
    const [today, yest, week, prevWeek] = await Promise.all([agg(t0, new Date(nowMs + 1)), agg(y0, sameTimeYesterday), agg(w0, new Date(nowMs + 1)), agg(p0, w0)]);
    const v = (a: Awaited<ReturnType<typeof agg>>) => Number(a._sum.total ?? 0);
    const aov = week._count._all ? v(week) / week._count._all : 0;
    const dDay = delta(v(today), v(yest)), dWeek = delta(v(week), v(prevWeek));
    const last14 = await db.order.findMany({ where: { status: { in: LIVE }, createdAt: { gte: dayStart(13) } }, select: { createdAt: true, total: true } });
    return {
      headline: { value: eur(v(today)), label: `σήμερα · ${num(today._count._all)} παραγγελίες`, delta: dDay && { ...dDay, text: `${dDay.text} από χθες ίδια ώρα` } },
      stats: [
        { label: "7 ημέρες", value: eur(v(week)) },
        { label: "έναντι προηγούμενου 7ημέρου", value: dWeek?.text ?? "—", tone: dWeek ? (dWeek.good ? "ok" : "warn") : undefined },
        { label: "Μέση παραγγελία", value: eur(aov) },
        { label: "Παραγγελίες 7 ημερών", value: num(week._count._all) },
      ],
      series: daily(last14.map((o) => ({ at: o.createdAt, v: Number(o.total) })), 14, (x) => eur(x)),
      note: "Πληρωμένες, σε εξέλιξη και παραδομένες (όχι ακυρωμένες).",
    };
  },

  async "orders-trend"() {
    const from = dayStart(13);
    const rows = await db.order.findMany({ where: { status: { in: LIVE }, createdAt: { gte: from } }, select: { createdAt: true, total: true } });
    const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const days = Array.from({ length: 14 }, (_, i) => dayStart(13 - i));
    const by = new Map(days.map((d) => [key(d), { n: 0, v: 0 }]));
    for (const r of rows) { const b = by.get(key(r.createdAt)); if (b) { b.n++; b.v += Number(r.total); } }
    const total = rows.length;
    return {
      bars: days.map((d) => { const b = by.get(key(d))!; return { label: d.toLocaleDateString("el-GR", { timeZone: TZ, day: "numeric", month: "numeric" }), value: b.n, display: `${b.n} παραγγελίες · ${eur(b.v)}` }; }),
      stats: [{ label: "Σύνολο 14 ημερών", value: num(total) }, { label: "Τζίρος", value: eur(rows.reduce((s, r) => s + Number(r.total), 0)) }],
      empty: total ? undefined : "Καμία παραγγελία τις τελευταίες 14 ημέρες.",
    };
  },

  async promos() {
    const now = new Date(), in48 = new Date(Date.now() + 48 * 3_600_000), in7 = new Date(Date.now() + 7 * 86_400_000);
    const [active, ending, starting, budget] = await Promise.all([
      db.promotion.count({ where: { status: "active", held: false } }),
      db.promotion.findMany({ where: { status: "active", endsAt: { gte: now, lte: in48 } }, orderBy: { endsAt: "asc" }, take: 4, select: { id: true, name: true, endsAt: true } }),
      db.promotion.findMany({ where: { status: { in: ["scheduled", "draft"] }, startsAt: { gte: now, lte: in7 } }, orderBy: { startsAt: "asc" }, take: 4, select: { id: true, name: true, startsAt: true, status: true } }),
      db.promotion.findMany({ where: { status: "active", budgetEur: { not: null } }, select: { id: true, name: true, budgetEur: true, spentEur: true } }),
    ]);
    const mixP = await db.promotion.groupBy({ by: ["status"], where: { status: { in: ["active", "scheduled", "paused", "draft"] } }, _count: { _all: true } });
    const pc = (k: string) => mixP.find((m) => m.status === k)?._count._all ?? 0;
    const burning = budget.filter((p) => Number(p.budgetEur) > 0 && Number(p.spentEur) / Number(p.budgetEur) >= 0.8);
    return {
      stats: [{ label: "Ενεργές", value: num(active), tone: "ok", href: "/admin/prosfores" }, { label: "Λήγουν σε 48 ώρες", value: num(ending.length), tone: ending.length ? "warn" : "ok" }, { label: "Ξεκινούν σε 7 ημέρες", value: num(starting.length), tone: "info", href: "/admin/prosfores/imerologio" }, { label: "Budget ≥ 80%", value: num(burning.length), tone: burning.length ? "bad" : "ok" }],
      rows: [
        ...burning.map((p) => ({ title: p.name, sub: `Budget ${eur(Number(p.spentEur))} από ${eur(Number(p.budgetEur))}`, meta: `${Math.round((Number(p.spentEur) / Number(p.budgetEur)) * 100)}%`, tone: "bad" as Tone, href: `/admin/prosfores/${p.id}` })),
        ...ending.map((p) => ({ title: p.name, sub: "Λήγει", meta: when(p.endsAt!), tone: "warn" as Tone, href: `/admin/prosfores/${p.id}` })),
        ...starting.map((p) => ({ title: p.name, sub: p.status === "draft" ? "Ξεκινά — είναι ακόμη πρόχειρο!" : "Ξεκινά", meta: when(p.startsAt!), tone: (p.status === "draft" ? "bad" : "info") as Tone, href: `/admin/prosfores/${p.id}` })),
      ],
      parts: [{ label: "Ενεργές", value: pc("active"), tone: "ok" }, { label: "Προγραμματισμένες", value: pc("scheduled"), tone: "info" }, { label: "Σε παύση", value: pc("paused"), tone: "warn" }, { label: "Πρόχειρα", value: pc("draft"), tone: "muted" }],
      empty: "Τίποτα δεν λήγει ή ξεκινά σύντομα.", href: "/admin/prosfores/imerologio", hrefLabel: "Ημερολόγιο",
    };
  },

  async ads() {
    const now = new Date();
    const list = await db.adPlacement.findMany({ where: { status: "active", OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, orderBy: { impressions: "desc" }, take: 6, select: { id: true, title: true, slot: true, impressions: true, clicks: true, endsAt: true } });
    const imp = list.reduce((s, a) => s + a.impressions, 0), clk = list.reduce((s, a) => s + a.clicks, 0);
    return {
      stats: [{ label: "Ενεργές θέσεις", value: num(list.length) }, { label: "Εμφανίσεις", value: num(imp) }, { label: "CTR", value: imp ? `${((clk / imp) * 100).toFixed(1)}%` : "—" }],
      rows: list.map((a) => ({ title: a.title, sub: `${a.slot} · ${num(a.impressions)} εμφανίσεις · ${num(a.clicks)} κλικ`, meta: a.impressions ? `${((a.clicks / a.impressions) * 100).toFixed(1)}%` : "—", tone: a.endsAt && a.endsAt.getTime() - Date.now() < 48 * 3_600_000 ? "warn" : "muted", href: "/admin/prosfores/theseis" })),
      empty: "Καμία ενεργή διαφημιστική θέση.", href: "/admin/prosfores/theseis", hrefLabel: "Θέσεις",
    };
  },

  async customers() {
    const w0 = dayStart(7), p0 = dayStart(14);
    const [n7, nPrev, subs, pending, newSubs] = await Promise.all([
      db.customer.count({ where: { createdAt: { gte: w0 }, source: "web" } }),
      db.customer.count({ where: { createdAt: { gte: p0, lt: w0 }, source: "web" } }),
      db.newsletterSubscriber.count({ where: { status: "subscribed" } }),
      db.newsletterSubscriber.count({ where: { status: "pending" } }),
      db.newsletterSubscriber.count({ where: { status: "subscribed", confirmedAt: { gte: w0 } } }),
    ]);
    const recent = await db.customer.findMany({ where: { createdAt: { gte: dayStart(13) }, source: "web" }, select: { createdAt: true } });
    return {
      headline: { value: num(n7), label: "νέοι λογαριασμοί σε 7 ημέρες", delta: delta(n7, nPrev) },
      series: daily(recent.map((c) => ({ at: c.createdAt })), 14, (x) => `${x} νέοι`),
      stats: [{ label: "Newsletter", value: num(subs), href: "/admin/newsletter" }, { label: "Νέες εγγραφές 7 ημ.", value: num(newSubs), tone: "ok" }, { label: "Χωρίς επιβεβαίωση", value: num(pending), tone: pending ? "warn" : "ok" }],
      href: "/admin/customers", hrefLabel: "Πελάτες",
    };
  },

  async warranty() {
    // 1η του μήνα, ώρα Αθήνας
    const m0 = dayStart(Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(new Date())) - 1);
    const [paid, open, expiring] = await Promise.all([
      db.warrantyExtension.aggregate({ where: { status: "paid", paidAt: { gte: m0 } }, _sum: { amount: true }, _count: { _all: true } }),
      db.warrantyExtension.count({ where: { status: { in: ["failed", "review"] } } }),
      db.customerDevice.count({ where: { warrantyUntil: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) }, extendedUntil: null } }),
    ]);
    return {
      headline: { value: eur(Number(paid._sum.amount ?? 0)), label: `τον μήνα · ${num(paid._count._all)} επεκτάσεις` },
      stats: [{ label: "Θέλουν έλεγχο", value: num(open), tone: open ? "warn" : "ok", href: "/admin/epektasi-eggyisis" }, { label: "Λήγουν σε 30 ημ. (χωρίς επέκταση)", value: num(expiring), tone: "info" }],
      href: "/admin/epektasi-eggyisis", hrefLabel: "Επέκταση εγγύησης",
    };
  },

  async "catalog-health"() {
    const active = { active: true };
    const [total, noImg, noPrice, noStock, eprel, dims] = await Promise.all([
      db.product.count({ where: active }),
      db.product.count({ where: { ...active, media: { none: { hidden: false } } } }),
      db.product.count({ where: { ...active, price: null } }),
      db.product.count({ where: { ...active, stock: { lte: 0 } } }),
      db.product.count({ where: { ...active, eprelStatus: { in: ["ambiguous", "none"] } } }),
      db.product.count({ where: { ...active, dimStatus: "conflict" } }),
    ]);
    const t = (n: number, bad = 0.05): Tone => (!n ? "ok" : total && n / total > bad ? "bad" : "warn");
    return {
      headline: { value: num(total), label: "ενεργά προϊόντα" },
      stats: [
        { label: "Χωρίς εικόνα", value: num(noImg), tone: t(noImg), href: "/admin/catalog?f=noimg", n: noImg, of: total },
        { label: "Χωρίς τιμή", value: num(noPrice), tone: t(noPrice), href: "/admin/catalog", n: noPrice, of: total },
        { label: "Χωρίς απόθεμα", value: num(noStock), tone: t(noStock, 0.3), n: noStock, of: total },
        { label: "Χωρίς EPREL", value: num(eprel), tone: t(eprel, 0.2), href: "/admin/eprel", n: eprel, of: total },
        { label: "Διαστάσεις σε σύγκρουση", value: num(dims), tone: t(dims), href: "/admin/catalog/dimensions?f=conflict", n: dims, of: total },
      ],
      href: "/admin/catalog", hrefLabel: "Κατάλογος",
    };
  },

  async cms() {
    const docs = await db.cmsDocument.findMany({ where: { collection: { in: ["home.layout", "brand.stores", "hero.slides", "page.zones"] }, locale: "el", key: { not: "plans" } }, select: { collection: true, key: true, data: true, published: true, updatedAt: true, publishedAt: true } });
    const label = (c: string, k: string) => (c === "home.layout" ? ["Αρχική σελίδα", "/admin/cms/home"] : c === "brand.stores" ? [`Σελίδα μάρκας ${k.toUpperCase()}`, `/admin/cms/brand-stores/${k}`] : c === "hero.slides" ? ["Hero slides", "/admin/cms/slides"] : [`Ζώνες σελίδας «${k}»`, "/admin/cms/pages"]);
    const dirty = docs.filter((d) => d.data && (!d.published || JSON.stringify(d.data) !== JSON.stringify(d.published)));
    const plans = await db.cmsDocument.findMany({ where: { OR: [{ collection: "home.layout", key: "plans" }, { collection: "brand.stores.plans" }], locale: "el" }, select: { collection: true, key: true, data: true } });
    const sched = plans.flatMap((p) => ((p.data as { scenarios?: { name: string; status: string; publishAt: string | null }[] } | null)?.scenarios ?? []).filter((s) => s.status === "scheduled" && s.publishAt).map((s) => ({ ...s, where: p.collection === "home.layout" ? ["Αρχική", "/admin/cms/home"] : [`Μάρκα ${p.key.toUpperCase()}`, `/admin/cms/brand-stores/${p.key}`] })));
    return {
      stats: [{ label: "Αδημοσίευτα πρόχειρα", value: num(dirty.length), tone: dirty.length ? "warn" : "ok" }, { label: "Προγραμματισμένες δημοσιεύσεις", value: num(sched.length), tone: "info" }],
      rows: [
        ...sched.sort((a, b) => Date.parse(a.publishAt!) - Date.parse(b.publishAt!)).map((s) => ({ title: `${s.where[0]} · «${s.name}»`, sub: "Προγραμματισμένη δημοσίευση", meta: when(new Date(s.publishAt!)), tone: "info" as Tone, href: s.where[1] })),
        ...dirty.sort((a, b) => +b.updatedAt - +a.updatedAt).map((d) => { const [t, h] = label(d.collection, d.key); return { title: t, sub: d.published ? "Αλλαγές που δεν δημοσιεύτηκαν" : "Δεν έχει δημοσιευτεί ποτέ", meta: ago(d.updatedAt), tone: (hours(d.updatedAt) > 72 ? "warn" : "muted") as Tone, href: h }; }),
      ].slice(0, 8),
      empty: "Όλα τα πρόχειρα είναι δημοσιευμένα.",
    };
  },

  async hero() {
    const doc = await getHeroAdminDoc();
    const now = new Date();
    const st = doc.draft.slides.map((s) => slideStatus(s, now));
    const n = (tone: string) => st.filter((x) => x.tone === tone).length;
    const live = n("live") + n("permanent");
    return {
      headline: { value: num(live), label: "slides παίζουν τώρα" },
      stats: [{ label: "Έρχονται", value: num(n("soon")), tone: "info" }, { label: "Έληξαν", value: num(n("ended")), tone: n("ended") ? "warn" : "ok" }, { label: "Ανενεργά", value: num(n("off")), tone: "muted" }],
      href: "/admin/cms/slides", hrefLabel: "Hero slides", badge: live ? undefined : { n: 0, tone: "bad" }, empty: live ? undefined : "Κανένα slide δεν παίζει — το hero δείχνει μόνο την προσφορά ημέρας.",
    };
  },

  async ar() {
    const [enabled, failed, running] = await Promise.all([
      db.productAr.count({ where: { enabled: true } }),
      db.arGeneration.count({ where: { status: "failed", updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      db.arGeneration.count({ where: { status: { in: ["queued", "running", "converting"] } } }),
    ]);
    return { headline: { value: num(enabled), label: "προϊόντα με AR" }, stats: [{ label: "Σε εξέλιξη", value: num(running), tone: "info" }, { label: "Απέτυχαν (7 ημ.)", value: num(failed), tone: failed ? "bad" : "ok" }], href: "/admin/ar", hrefLabel: "AR" };
  },

  async wishlist() {
    const [drop, back] = await Promise.all([db.wishlistItem.count({ where: { notifyPriceDrop: true } }), db.wishlistItem.count({ where: { notifyBackInStock: true } })]);
    return { stats: [{ label: "Περιμένουν πτώση τιμής", value: num(drop) }, { label: "Περιμένουν απόθεμα", value: num(back) }], href: "/admin/reports/wishlist", hrefLabel: "Αναφορά" };
  },

  async ermis() {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const days14 = Array.from({ length: 14 }, (_, i) => dayKey(dayStart(13 - i)));
    const [advisor, snap, perDay] = await Promise.all([db.aiUsage.count({ where: { feature: "advisor", day } }), snapStats(7).catch(() => null), db.aiUsage.groupBy({ by: ["day"], where: { feature: "advisor", day: { in: days14 } }, _count: { _all: true } })]);
    return { series: days14.map((k) => { const v = perDay.find((r) => r.day === k)?._count._all ?? 0; return { label: `${k.slice(8)}/${Number(k.slice(5, 7))}`, value: v, display: `${v} απαντήσεις` }; }), stats: [{ label: "Απαντήσεις Ερμή σήμερα", value: num(advisor), href: "/admin/reports/ai" }, { label: "Σαρώσεις Snap (7 ημ.)", value: num((snap as { total?: number } | null)?.total ?? 0) }], note: "Μόνο πραγματικά νούμερα (το ραντάρ δείχνει ακόμη δείγματα)." };
  },

  async erp() {
    const kinds = ["webcat", "specgroup", "item"];
    const runs = await Promise.all(kinds.map((k) => db.s1SyncRun.findFirst({ where: { kind: k }, orderBy: { at: "desc" }, select: { kind: true, at: true, ok: true, error: true, updated: true, created: true } })));
    const conflicts = await db.customer.count({ where: { erpSyncStatus: { in: ["failed", "conflict"] } } });
    const K: Record<string, string> = { webcat: "Κατηγορίες", specgroup: "Χαρακτηριστικά", item: "Είδη" };
    const fails = runs.filter((r) => r && !r.ok).length;
    return {
      rows: runs.filter(Boolean).map((r) => ({ title: K[r!.kind] ?? r!.kind, sub: r!.ok ? `+${r!.created} νέα · ${r!.updated} ενημερώσεις` : `Σφάλμα: ${r!.error ?? "άγνωστο"}`, meta: ago(r!.at), tone: !r!.ok ? "bad" : hours(r!.at) > 26 ? "warn" : "ok", href: "/admin/softone/sync" })),
      stats: [{ label: "Πελάτες σε σύγκρουση", value: num(conflicts), tone: conflicts ? "warn" : "ok" }],
      empty: "Δεν έχει τρέξει ακόμη συγχρονισμός.", href: "/admin/softone/sync", hrefLabel: "Συγχρονισμός", badge: fails ? { n: fails, tone: "bad" } : undefined,
    };
  },

  async emails() {
    const since = new Date(Date.now() - 86_400_000);
    const [sent, failedList, failed] = await Promise.all([
      db.emailLog.count({ where: { status: "sent", at: { gte: since } } }),
      db.emailLog.findMany({ where: { status: "failed", at: { gte: since } }, orderBy: { at: "desc" }, take: 4, select: { template: true, error: true, at: true } }),
      db.emailLog.count({ where: { status: "failed", at: { gte: since } } }),
    ]);
    const sent14 = await db.emailLog.findMany({ where: { status: "sent", at: { gte: dayStart(13) } }, select: { at: true } });
    return { series: daily(sent14, 14, (x) => `${x} emails`), stats: [{ label: "Στάλθηκαν (24ω)", value: num(sent), tone: "ok" }, { label: "Απέτυχαν", value: num(failed), tone: failed ? "bad" : "ok" }], rows: failedList.map((e) => ({ title: e.template, sub: e.error ?? "Αποτυχία αποστολής", meta: ago(e.at), tone: "bad", href: "/admin/emails" })), href: "/admin/emails", hrefLabel: "Emails", badge: failed ? { n: failed, tone: "bad" } : undefined };
  },

  async ai() {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const month = day.slice(0, 7);
    const [today, mon] = await Promise.all([
      db.aiUsage.groupBy({ by: ["feature"], where: { day }, _sum: { billedEur: true } }),
      db.aiUsage.aggregate({ where: { day: { startsWith: month } }, _sum: { billedEur: true } }),
    ]);
    const t = today.reduce((s, r) => s + (r._sum.billedEur ?? 0), 0);
    const days14 = Array.from({ length: 14 }, (_, i) => dayKey(dayStart(13 - i)));
    const perDay = await db.aiUsage.groupBy({ by: ["day"], where: { day: { in: days14 } }, _sum: { billedEur: true } });
    const F: Record<string, string> = { advisor: "Ερμής", "alt-text": "Περιγραφές εικόνων", copy: "Κείμενα", agent: "Agent", test: "Δοκιμές" };
    return { series: days14.map((k) => { const v = perDay.find((r) => r.day === k)?._sum.billedEur ?? 0; return { label: `${k.slice(8)}/${Number(k.slice(5, 7))}`, value: v, display: eur(v, 2) }; }), headline: { value: eur(t, 2), label: "σήμερα" }, stats: [{ label: "Τον μήνα", value: eur(mon._sum.billedEur ?? 0, 2) }, ...today.sort((a, b) => (b._sum.billedEur ?? 0) - (a._sum.billedEur ?? 0)).slice(0, 3).map((r) => ({ label: F[r.feature] ?? r.feature, value: eur(r._sum.billedEur ?? 0, 2) }))], href: "/admin/reports/ai", hrefLabel: "Κόστος AI" };
  },

  async backups() {
    const last = await db.backupRun.findFirst({ where: { deletedAt: null }, orderBy: { at: "desc" }, select: { at: true, ok: true, bytes: true, error: true } });
    if (!last) return { empty: "Δεν έχει γίνει κανένα backup.", badge: { n: 1, tone: "bad" }, href: "/admin/backups" };
    const old = hours(last.at) > 26;
    return { headline: { value: last.ok ? (old ? "Παλιό" : "Εντάξει") : "Απέτυχε", label: `${ago(last.at)}${last.bytes ? ` · ${(last.bytes / 1_048_576).toFixed(1)} MB` : ""}` }, rows: last.ok ? [] : [{ title: "Σφάλμα", sub: last.error ?? "άγνωστο", tone: "bad" }], href: "/admin/backups", hrefLabel: "Backups", badge: !last.ok || old ? { n: 1, tone: "bad" } : undefined };
  },

  async activity() {
    const list = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { action: true, entity: true, entityId: true, createdAt: true, staff: { select: { name: true } } } });
    return { rows: list.map((a) => ({ title: `${a.staff?.name ?? "Σύστημα"} · ${a.action}`, sub: `${a.entity}${a.entityId ? ` · ${a.entityId}` : ""}`, meta: ago(a.createdAt), tone: "muted" })), href: "/admin/audit", hrefLabel: "Audit", empty: "Καμία ενέργεια ακόμη." };
  },

  async staff() {
    const t0 = dayStart();
    const [active, today] = await Promise.all([db.staff.count({ where: { active: true } }), db.staff.findMany({ where: { lastLoginAt: { gte: t0 } }, orderBy: { lastLoginAt: "desc" }, take: 6, select: { name: true, lastLoginAt: true } })]);
    return { stats: [{ label: "Ενεργοί λογαριασμοί", value: num(active) }, { label: "Συνδέθηκαν σήμερα", value: num(today.length), tone: "info" }], rows: today.map((s) => ({ title: s.name, meta: ago(s.lastLoginAt!), tone: "muted" })), href: "/admin/staff", hrefLabel: "Προσωπικό" };
  },
};

/** Δεδομένα ενός component· ποτέ δεν ρίχνει σφάλμα (το component δείχνει τι πήγε στραβά). */
export async function loadWidget(id: string, u: DashUser): Promise<WidgetData | null> {
  const fn = L[id];
  if (!fn) return null;
  try {
    return await Promise.race([fn(u), new Promise<WidgetData>((_, rej) => setTimeout(() => rej(new Error("Αργή απάντηση της βάσης")), 8000))]);
  } catch (e) {
    console.error(`[dashboard] ${id}`, e);
    return { error: e instanceof Error ? e.message : "Σφάλμα" };
  }
}
