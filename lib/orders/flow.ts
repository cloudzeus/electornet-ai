import "server-only";
import { db } from "@/lib/db";
import { MODE_LABEL, STEP_LABEL, type RouteMode, type StepKey } from "@/lib/delivery/routing";

export const MAIL_LABEL: Record<string, string> = {
  "order-confirmation": "Επιβεβαίωση παραγγελίας", "order-erp-stage": "Ενημέρωση σταδίου", "order-cancelled": "Ακύρωση",
  "order-ready-for-pickup": "Έτοιμη για παραλαβή", "order-delivered": "Παραδόθηκε", "order-return": "Επιστροφή",
};

export interface FlowMail { id: string; template: string; label: string; status: string; at: string; error: string | null; findoc: number | null }
export interface FlowStep { key: StepKey; label: string; doneAt: string | null; ref: string | null; note: string | null }
export interface FlowParty { id: string; name: string; phone: string | null; city?: string | null }
export interface FlowBase {
  order: { id: string; number: string; status: string; total: number; createdAt: string; paymentMethod: string | null; paymentStatus: string | null; fulfilment: string };
  erp: { status: string; error: string | null; docId: string | null } | null;
  route: { mode: RouteMode; modeLabel: string; reason: string | null; status: string; partner: FlowParty | null; agency: FlowParty | null; carrier: FlowParty | null; steps: FlowStep[] } | null;
  mails: FlowMail[];
}

/** Ό,τι χρειάζεται η «Ροή» από τη δική μας βάση (γρήγορα). Η πορεία στο SoftOne φορτώνει χωριστά, όταν ανοίξει η καρτέλα. */
export async function orderFlowBase(orderId: string): Promise<FlowBase | null> {
  const party = { select: { id: true, name: true, phone: true } } as const;
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, number: true, status: true, total: true, createdAt: true, paymentMethod: true, fulfilment: true,
      payment: { select: { status: true } }, erpSync: { select: { status: true, lastError: true, erpDocId: true } },
      route: { select: { mode: true, reason: true, status: true, partner: { select: { id: true, name: true, phone: true, city: true } }, agency: party, carrier: party, steps: { orderBy: { sort: "asc" } } } },
    },
  });
  if (!o) return null;
  const mails = await db.emailLog.findMany({ where: { meta: { path: ["orderId"], equals: o.id } }, orderBy: { at: "asc" }, take: 50, select: { id: true, template: true, status: true, at: true, error: true, meta: true } });
  const r = o.route;
  return {
    order: { id: o.id, number: o.number, status: o.status, total: Number(o.total), createdAt: o.createdAt.toISOString(), paymentMethod: o.paymentMethod, paymentStatus: o.payment?.status ?? null, fulfilment: o.fulfilment },
    erp: o.erpSync ? { status: o.erpSync.status, error: o.erpSync.lastError, docId: o.erpSync.erpDocId } : null,
    route: r ? {
      mode: r.mode as RouteMode, modeLabel: MODE_LABEL[r.mode as RouteMode] ?? r.mode, reason: r.reason, status: r.status, partner: r.partner, agency: r.agency, carrier: r.carrier,
      steps: r.steps.map((s) => ({ key: s.key as StepKey, label: STEP_LABEL[s.key as StepKey] ?? s.key, doneAt: s.doneAt?.toISOString() ?? null, ref: s.ref, note: s.note })),
    } : null,
    mails: mails.map((m) => ({ id: m.id, template: m.template, label: MAIL_LABEL[m.template] ?? m.template, status: m.status, at: m.at.toISOString(), error: m.error, findoc: Number((m.meta as Record<string, unknown> | null)?.findoc) || null })),
  };
}
