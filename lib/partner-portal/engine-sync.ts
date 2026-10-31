import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { engine } from "@/lib/b2b-engine/client";
import type { EngineEvent } from "@/lib/b2b-engine/contracts";
import { portalLog } from "./log";

/**
 * Στέλνει στη μηχανή το αντίγραφο του μέλους: μέλος, καταστήματα (όσα συνδέονται με υποκατάστημα SoftOne) και
 * συνδέσεις. Idempotent (κάθε γεγονός νέο id, η μηχανή κρατά το νεότερο `at`). Κάθε αποστολή γράφεται στο ιστορικό.
 */
export async function syncPartnerToEngine(partnerId: string, o: { accountId?: string; staffId?: string; reason: string }) {
  const p = await db.partner.findUniqueOrThrow({
    where: { id: partnerId },
    include: { stores: { select: { id: true, name: true, city: true, active: true, branch: { select: { s1BranchId: true } } } }, connections: true },
  });
  const at = new Date().toISOString();
  const ev = (e: Omit<EngineEvent, "id" | "at">) => ({ ...e, id: randomUUID(), at }) as EngineEvent;
  const events: EngineEvent[] = [
    ev({ type: "partner.upserted", data: { id: p.id, s1Trdr: p.s1Trdr, name: p.name, afm: p.afm, active: p.active } }),
    ...p.stores.map((s) => ev({ type: "store.upserted", data: { id: s.id, partnerId: p.id, s1BranchId: s.branch?.s1BranchId ?? null, name: s.name, city: s.city, active: true } })),
    ...p.connections.map((c) => ev({ type: "connection.upserted", data: { id: c.id, partnerId: p.id, type: c.type as never, config: (c.config ?? {}) as Record<string, unknown>, storeIds: c.storeIds, active: c.active } })),
  ];
  const r = await engine.events(events);
  await portalLog(partnerId, "engine.event", r.ok, r.ok ? `Συγχρονισμός με τη μηχανή (${o.reason}): ${events.length} γεγονότα` : `Αποτυχία συγχρονισμού με τη μηχανή: ${r.error}`, { accountId: o.accountId, staffId: o.staffId, ms: r.ms, detail: r.ok ? r.data : { status: r.status } });
  return r;
}
