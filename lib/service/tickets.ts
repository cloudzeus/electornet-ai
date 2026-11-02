import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";
import { canMove, emailFor, isOpen, KIND_LABEL, MODE_LABEL, nextTicketNumber, parseAttachments, parseTimeline, STATUS_LABEL, type TicketAttachment, type TicketEmail, type TimelineEntry } from "./core";

/**
 * Αιτήματα service: δημιουργία (λογαριασμός, Snap & Find, διαχείριση), ενημέρωση από το προσωπικό με πορεία και
 * email στον πελάτη, αίτημα αλλαγής ώρας / μήνυμα / φωτογραφίες από τον πελάτη. Ένα σημείο για όλους, ώστε η ουρά
 * service και η καρτέλα πελάτη να κάνουν ακριβώς το ίδιο.
 */

export interface Actor { name: string; staffId?: string | null }
const CUSTOMER: Actor = { name: "customer" };

const ev = (customerId: string, meta: object, staffId?: string | null) =>
  db.customerEvent.create({ data: { customerId, kind: "ticket", meta, staffId: staffId ?? null } }).catch(() => null);

const json = (tl: TimelineEntry[]) => tl as unknown as Prisma.InputJsonValue;

/** Νέος αριθμός και δημιουργία· σε σύγκρουση (δύο ταυτόχρονα) ξαναδοκιμάζει με τον επόμενο. */
async function createWithNumber(data: Omit<Prisma.ServiceTicketUncheckedCreateInput, "number">) {
  for (let i = 0; i < 6; i++) {
    const last = await db.serviceTicket.findMany({ where: { number: { startsWith: "SRV-" } }, orderBy: { createdAt: "desc" }, take: 40, select: { number: true } });
    const number = nextTicketNumber(last.map((x) => x.number));
    try {
      return await db.serviceTicket.create({ data: { ...data, number } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new Error("Δεν βρέθηκε ελεύθερος αριθμός αιτήματος.");
}

export interface NewTicket {
  customerId: string;
  kind?: string;
  mode?: string | null;
  description: string;
  deviceId?: string | null;
  storeId?: string | null;
  scheduledAt?: Date | null;
  slot?: string | null;
  attachments?: TicketAttachment[];
  /** πρώτη γραμμή της πορείας */
  note: string;
  by: Actor;
  /** email «Λάβαμε το αίτημα» (προεπιλογή: ναι) */
  notify?: boolean;
}

export async function createServiceTicket(t: NewTicket) {
  // συσκευή μόνο του ίδιου πελάτη
  const device = t.deviceId ? await db.customerDevice.findFirst({ where: { id: t.deviceId, customerId: t.customerId }, select: { id: true, brand: true, title: true, warrantyUntil: true, extendedUntil: true } }) : null;
  const until = device ? Math.max(device.warrantyUntil?.getTime() ?? 0, device.extendedUntil?.getTime() ?? 0) : 0;
  const status = t.scheduledAt ? "scheduled" : "new";
  const row = await createWithNumber({
    customerId: t.customerId, deviceId: device?.id ?? null, kind: t.kind || "repair", mode: t.mode || null, description: t.description.trim().slice(0, 4000),
    storeId: t.storeId || null, scheduledAt: t.scheduledAt ?? null, slot: t.slot || null, inWarranty: device ? until > Date.now() : t.kind !== "repair",
    attachments: t.attachments?.length ? (t.attachments as unknown as Prisma.InputJsonValue) : undefined,
    timeline: json([{ at: new Date().toISOString(), status, note: t.note, by: t.by.name, kind: "status" }]),
  });
  await ev(t.customerId, { by: t.by.name, number: row.number, kind: row.kind }, t.by.staffId);
  if (t.notify !== false) {
    const c = await db.customer.findUnique({ where: { id: t.customerId }, select: { email: true, firstName: true } });
    if (c?.email) {
      const m = await renderTemplate("service-received", { firstName: c.firstName, number: row.number, device: device ? `${device.brand} ${device.title}`.trim() : KIND_LABEL[row.kind] ?? "—", description: row.description, mode: MODE_LABEL[row.mode ?? ""] ?? "—" });
      await sendMail({ to: c.email, template: "service-received", meta: { ticketId: row.id }, ...m }).catch(() => null);
    }
  }
  return row;
}

export interface TicketPatch {
  status?: string;
  scheduledAt?: string | null;
  slot?: string | null;
  technician?: string | null;
  storeId?: string | null;
  mode?: string | null;
  erpJob?: string | null;
  cost?: number | null;
  inWarranty?: boolean;
  /** σημείωση στην πορεία */
  note?: string;
  /** η σημείωση φαίνεται και στον πελάτη */
  publicNote?: boolean;
  /** email στον πελάτη όταν η αλλαγή το αξίζει (ραντεβού, ολοκλήρωση, ακύρωση) */
  notify?: boolean;
}

export type UpdateResult = { ok: true; emailed: TicketEmail | null } | { ok: false; error: string };

/** Ενημέρωση από το προσωπικό: έλεγχος μετάβασης, πορεία, χρονολόγιο πελάτη, email αν ζητήθηκε. */
export async function updateServiceTicket(ticketId: string, p: TicketPatch, by: Actor): Promise<UpdateResult> {
  const t = await db.serviceTicket.findUnique({ where: { id: ticketId }, include: { customer: { select: { id: true, email: true, firstName: true } }, device: { select: { brand: true, title: true } } } });
  if (!t) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
  const status = p.status ?? t.status;
  if (!canMove(t.status, status)) return { ok: false, error: `Δεν γίνεται από «${STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status}» σε «${STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}».` };
  const scheduledAt = p.scheduledAt === undefined ? t.scheduledAt : p.scheduledAt ? new Date(p.scheduledAt) : null;
  if (scheduledAt && isNaN(+scheduledAt)) return { ok: false, error: "Η ημερομηνία ραντεβού δεν είναι σωστή." };
  // ραντεβού σε νέο αίτημα → «Με ραντεβού» αυτόματα
  const finalStatus = status === "new" && scheduledAt && p.status === undefined ? "scheduled" : status;
  const next = {
    status: finalStatus, scheduledAt, slot: p.slot === undefined ? t.slot : p.slot || null, technician: p.technician === undefined ? t.technician : p.technician?.trim() || null,
    storeId: p.storeId === undefined ? t.storeId : p.storeId || null, mode: p.mode === undefined ? t.mode : p.mode || null, erpJob: p.erpJob === undefined ? t.erpJob : p.erpJob?.trim() || null,
    cost: p.cost === undefined ? t.cost : p.cost == null ? null : new Prisma.Decimal(p.cost), inWarranty: p.inWarranty ?? t.inWarranty,
  };
  const changed = (["status", "slot", "technician", "storeId", "mode", "erpJob", "inWarranty"] as const).some((k) => next[k] !== t[k]) || +(next.scheduledAt ?? 0) !== +(t.scheduledAt ?? 0) || String(next.cost ?? "") !== String(t.cost ?? "");
  const note = p.note?.trim() ?? "";
  if (!changed && !note) return { ok: true, emailed: null };
  const tl = parseTimeline(t.timeline);
  const now = new Date().toISOString();
  const what = [
    +(next.scheduledAt ?? 0) !== +(t.scheduledAt ?? 0) && next.scheduledAt ? `ραντεβού ${next.scheduledAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })}` : null,
    next.slot !== t.slot && next.slot ? next.slot : null,
    next.technician !== t.technician && next.technician ? `τεχνικός ${next.technician}` : null,
  ].filter(Boolean).join(", ");
  tl.push({ at: now, status: finalStatus, note: [note, what && !note ? what : null].filter(Boolean).join(" · ") || undefined, by: by.name, kind: changed ? "status" : "note", public: p.publicNote || undefined });
  const mail = p.notify ? emailFor({ status: t.status, scheduledAt: t.scheduledAt, slot: t.slot, technician: t.technician }, next) : null;
  let emailed: TicketEmail | null = null;
  if (mail && t.customer.email) {
    const sent = await sendTicketEmail(mail, { ...t, ...next }, t.customer, t.device, note).catch(() => false);
    if (sent) { emailed = mail; tl.push({ at: new Date().toISOString(), status: finalStatus, by: "system", kind: "email", template: mail, note: `Email στον πελάτη: ${EMAIL_LABEL[mail]}` }); }
  }
  await db.serviceTicket.update({ where: { id: t.id }, data: { ...next, timeline: json(tl) } });
  await ev(t.customerId, { by: by.name, number: t.number, status: finalStatus, ...(emailed ? { emailed } : {}) }, by.staffId);
  return { ok: true, emailed };
}

export const EMAIL_LABEL: Record<TicketEmail, string> = { "appointment-confirmed": "ραντεβού", "service-done": "ολοκλήρωση", "service-cancelled": "ακύρωση" };

const DEFAULT_STORE = { name: "Service Euronics", address: "Δαμάσκου 2", city: "Αχαρνές", zip: "13671", phone: "2104835143", hours: "Δευ–Παρ 09:00–17:00", lat: 38.08, lng: 23.73 };

async function sendTicketEmail(key: TicketEmail, t: { id: string; number: string; customerId: string; storeId: string | null; mode: string | null; scheduledAt: Date | null; slot: string | null; technician: string | null; cost: Prisma.Decimal | null; inWarranty: boolean; description: string }, c: { email: string | null; firstName: string }, device: { brand: string; title: string } | null, note: string) {
  if (!c.email) return false;
  const dev = device ? `${device.brand} ${device.title}`.trim() : "";
  let data: unknown;
  if (key === "appointment-confirmed") {
    const [store, addr] = await Promise.all([
      t.storeId ? db.store.findUnique({ where: { id: t.storeId }, select: { name: true, address: true, city: true, zip: true, phone: true, lat: true, lng: true } }) : null,
      db.address.findFirst({ where: { customerId: t.customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], select: { street: true, number: true, floor: true, zip: true, city: true } }).catch(() => null),
    ]);
    const s = store ? { ...store, phone: store.phone ?? DEFAULT_STORE.phone, hours: "" } : DEFAULT_STORE;
    const address = t.mode === "store" ? `${s.name}, ${s.address}, ${s.city}` : addr ? `${addr.street} ${addr.number ?? ""}${addr.floor ? `, ${addr.floor}ος` : ""}, ${addr.zip} ${addr.city}`.replace(/\s+,/g, ",") : "Στη διεύθυνσή σου";
    data = { firstName: c.firstName, number: t.number, date: t.scheduledAt!.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Athens" }), slot: t.slot || t.scheduledAt!.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }), technician: t.technician || "θα σε ενημερώσει το κατάστημα", store: s, address };
  } else if (key === "service-done") {
    data = { firstName: c.firstName, number: t.number, device: dev || "τη συσκευή σου", work: note || "Ολοκληρώθηκαν οι εργασίες του αιτήματος.", cost: t.inWarranty || !t.cost ? null : Number(t.cost) };
  } else {
    data = { firstName: c.firstName, number: t.number, device: dev, reason: note };
  }
  const m = await renderTemplate(key, data);
  const r = await sendMail({ to: c.email, template: key, meta: { ticketId: t.id }, ...m });
  return r.ok;
}

/* ---------- από τον πελάτη ---------- */

async function mine(customerId: string, ticketId: string) {
  return db.serviceTicket.findFirst({ where: { id: ticketId, customerId }, select: { id: true, number: true, status: true, timeline: true, attachments: true } });
}

/** Ακύρωση από τον πελάτη — μόνο πριν ξεκινήσει η εργασία. */
export async function cancelByCustomer(customerId: string, ticketId: string) {
  const t = await mine(customerId, ticketId);
  if (!t) return { ok: false as const, status: 404, error: "Δεν βρέθηκε." };
  if (!["new", "scheduled"].includes(t.status)) return { ok: false as const, status: 409, error: "Δεν ακυρώνεται πια — κάλεσε το 210 483 5143." };
  const tl = [...parseTimeline(t.timeline), { at: new Date().toISOString(), status: "cancelled", note: "Ακύρωση από τον πελάτη", by: CUSTOMER.name, kind: "status" as const }];
  await db.serviceTicket.update({ where: { id: t.id }, data: { status: "cancelled", timeline: json(tl) } });
  await ev(customerId, { by: "customer", action: "cancelled", number: t.number });
  return { ok: true as const };
}

/** Αίτημα αλλαγής ώρας: δεν αλλάζει το ραντεβού — μπαίνει στην πορεία και φαίνεται ως «θέλει απάντηση» στην ουρά. */
export async function requestReschedule(customerId: string, ticketId: string, r: { date?: string; slot?: string; note?: string }) {
  const t = await mine(customerId, ticketId);
  if (!t) return { ok: false as const, status: 404, error: "Δεν βρέθηκε." };
  if (!isOpen(t.status)) return { ok: false as const, status: 409, error: "Το αίτημα έχει κλείσει." };
  const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined;
  if (date && date < new Date().toISOString().slice(0, 10)) return { ok: false as const, status: 400, error: "Διάλεξε ημέρα από σήμερα και μετά." };
  if (!date && !r.note?.trim()) return { ok: false as const, status: 400, error: "Διάλεξε ημέρα ή γράψε πότε σε βολεύει." };
  const tl = [...parseTimeline(t.timeline), { at: new Date().toISOString(), status: t.status, by: CUSTOMER.name, kind: "reschedule-request" as const, request: { date, slot: r.slot?.slice(0, 40) || undefined }, note: r.note?.trim().slice(0, 500) || undefined }];
  await db.serviceTicket.update({ where: { id: t.id }, data: { timeline: json(tl) } });
  await ev(customerId, { by: "customer", action: "reschedule-request", number: t.number, date, slot: r.slot });
  return { ok: true as const };
}

/** Μήνυμα ή φωτογραφίες από τον πελάτη σε ανοιχτό αίτημα. */
export async function addCustomerInput(customerId: string, ticketId: string, r: { note?: string; attachments?: TicketAttachment[] }) {
  const t = await mine(customerId, ticketId);
  if (!t) return { ok: false as const, status: 404, error: "Δεν βρέθηκε." };
  if (!isOpen(t.status)) return { ok: false as const, status: 409, error: "Το αίτημα έχει κλείσει." };
  const note = r.note?.trim().slice(0, 1000);
  const files = r.attachments ?? [];
  if (!note && !files.length) return { ok: false as const, status: 400, error: "Γράψε μήνυμα ή πρόσθεσε φωτογραφία." };
  const at = new Date().toISOString();
  const tl = [...parseTimeline(t.timeline), { at, status: t.status, by: CUSTOMER.name, kind: files.length && !note ? "attachment" as const : "customer-note" as const, note: note || `Πρόσθεσες ${files.length} ${files.length === 1 ? "αρχείο" : "αρχεία"}` }];
  const attachments = [...parseAttachments(t.attachments), ...files.map((f) => ({ ...f, at, by: "customer" }))];
  await db.serviceTicket.update({ where: { id: t.id }, data: { timeline: json(tl), attachments: attachments as unknown as Prisma.InputJsonValue } });
  await ev(customerId, { by: "customer", action: "message", number: t.number, files: files.length });
  return { ok: true as const };
}
