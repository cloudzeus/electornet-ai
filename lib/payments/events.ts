import "server-only";
import { db } from "@/lib/db";
import { failureRows, spikeOf, type BoardOrder, type PayEvent, type PayEventKind } from "./events-core";

/**
 * Ιστορικό πληρωμής στη βάση (πίνακας PaymentEvent, prisma/sql/2026-11-24-payment-events.sql).
 * Καταγραφή και αναγνώσεις δεν πετούν ποτέ: μια πληρωμή δεν σταματά επειδή δεν γράφτηκε ιστορικό, και οι οθόνες ανοίγουν
 * (άδειες) ακόμη κι αν ο πίνακας δεν έχει δημιουργηθεί.
 */
export async function logPayment(orderId: string, kind: PayEventKind, d: { source: string; method?: string | null; psp?: string; pspOrder?: string | null; txId?: string | null; eventId?: unknown; card?: string | null }) {
  try {
    // ο κωδικός αιτίας μπορεί να έρθει από τη διεύθυνση επιστροφής: δεκτός μόνο ως μικρός θετικός ακέραιος
    const n = Number(d.eventId), eventId = d.eventId != null && d.eventId !== "" && Number.isInteger(n) && n > 0 && n < 10_000_000 ? n : null;
    const data = { orderId, kind, source: d.source.slice(0, 20), method: d.method ?? null, psp: d.psp ?? null, pspOrder: d.pspOrder?.slice(0, 64) ?? null, txId: d.txId?.slice(0, 64) ?? null, eventId, card: d.card ?? null };
    if (data.txId) await db.paymentEvent.upsert({ where: { txId_kind: { txId: data.txId, kind } }, create: data, update: { ...(eventId ? { eventId } : {}), ...(data.card ? { card: data.card } : {}) } });
    // χωρίς συναλλαγή (π.χ. ακύρωση στη σελίδα της Viva): η ανανέωση της σελίδας επιστροφής δεν γράφει δεύτερη γραμμή
    else if (kind === "started" || !(await db.paymentEvent.count({ where: { orderId, kind, pspOrder: data.pspOrder, txId: null } }))) await db.paymentEvent.create({ data });
  } catch (e) {
    console.warn(`[payment-event] ${kind} δεν γράφτηκε: ${e instanceof Error ? e.message.split("\n").pop() : e}`);
  }
}

export async function paymentEvents(orderId: string): Promise<PayEvent[]> {
  try {
    return await db.paymentEvent.findMany({ where: { orderId }, orderBy: { at: "asc" }, take: 200, select: { at: true, kind: true, source: true, method: true, pspOrder: true, txId: true, eventId: true, card: true } });
  } catch { return []; }
}

/**
 * Τα δεδομένα της σελίδας «Αποτυχημένες πληρωμές» για τις τελευταίες `days` ημέρες, μαζί με την προηγούμενη ίση περίοδο
 * για σύγκριση. Κάθε παραγγελία ανήκει στην περίοδο της πρώτης της προσπάθειας. `ready` = false: ο πίνακας δεν υπάρχει ακόμα.
 */
export async function failureBoard(days: number, now: number = Date.now()) {
  const from = new Date(now - days * 86_400_000), prevFrom = new Date(now - 2 * days * 86_400_000);
  try {
    const [events, first] = await Promise.all([
      db.paymentEvent.findMany({ where: { at: { gte: prevFrom } }, orderBy: { at: "asc" }, take: 20_000, select: { orderId: true, at: true, kind: true, source: true, method: true, pspOrder: true, txId: true, eventId: true, card: true } }),
      db.paymentEvent.findFirst({ orderBy: { at: "asc" }, select: { at: true } }),
    ]);
    const by = new Map<string, PayEvent[]>();
    for (const { orderId, ...e } of events) by.set(orderId, [...(by.get(orderId) ?? []), e]);
    const orders = await db.order.findMany({ where: { id: { in: [...by.keys()] } }, select: { id: true, number: true, total: true, status: true, payment: { select: { status: true, method: true } } } });
    const all: BoardOrder[] = orders.map((o) => ({ id: o.id, number: o.number, total: Number(o.total), status: o.status, payStatus: o.payment?.status ?? null, payMethod: o.payment?.method ?? null, events: by.get(o.id)! }));
    const isCur = (o: BoardOrder) => +new Date(o.events[0].at) >= +from;
    const cur = failureRows(all.filter(isCur), now), prev = failureRows(all.filter((o) => !isCur(o)), now);
    return { ready: true as const, since: first?.at ?? null, tried: cur.tried, rows: cur.rows, prev: { tried: prev.tried, missed: prev.rows.length }, spike: spikeOf(events, now) };
  } catch {
    return { ready: false as const, since: null, tried: 0, rows: [], prev: { tried: 0, missed: 0 }, spike: null };
  }
}
