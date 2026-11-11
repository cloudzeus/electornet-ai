import "server-only";
import { db } from "@/lib/db";
import { docChain } from "@/lib/softone/doc-chain";
import { emailCtx } from "@/lib/email/layout";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { decide, fillMessage, type StageType } from "./erp-stages-core";
import type { ShipTo } from "./model";

/** Παραγγελίες τόσο παλιές ελέγχονται ακόμη· πέρα από αυτό η πορεία θεωρείται κλειστή. */
const WINDOW_DAYS = 30;
/** shortcut: μία αλυσίδα (~6 κλήσεις) ανά παραγγελία σε κάθε πέρασμα· αν οι ανοιχτές ξεπεράσουν τις ~200, περπάτημα σε παρτίδες. */
const MAX_ORDERS = 200;

const dmy = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Ελέγχει την πορεία στο SoftOne των πρόσφατων παραγγελιών και στέλνει email στον πελάτη για κάθε νέο παραστατικό
 * τύπου που επέλεξε ο διαχειριστής (Παραγγελίες → Ρυθμίσεις ενημέρωσης). Μόνο αναγνώσεις στο SoftOne.
 */
export async function runErpStages(): Promise<{ ok: boolean; message: string; idle?: boolean }> {
  const typesRows = await db.docType.findMany({ where: { eshop: true }, select: { s1Id: true, notifyCustomer: true, customerTitle: true, customerMessage: true } });
  const types: StageType[] = typesRows.filter((t) => t.s1Id).map((t) => ({ fprms: t.s1Id!, notify: t.notifyCustomer, title: t.customerTitle, message: t.customerMessage }));
  // καμία επιλογή → καμία κλήση στο SoftOne
  if (!types.some((t) => t.notify && t.message?.trim())) return { ok: true, idle: true, message: "Κανένα στάδιο δεν ενημερώνει τον πελάτη." };

  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since }, erpSync: { erpDocId: { not: null } } },
    orderBy: { createdAt: "desc" }, take: MAX_ORDERS,
    select: { id: true, number: true, shipping: true, guestEmail: true, customer: { select: { email: true, firstName: true } }, erpSync: { select: { erpDocId: true } }, erpStages: { select: { findoc: true, fprms: true, notifiedAt: true } } },
  });
  if (!orders.length) return { ok: true, idle: true, message: "Καμία πρόσφατη παραγγελία στο SoftOne." };

  const seriesToFprms = new Map((await db.docSeries.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, s1Fprms: true } })).map((s) => [s.s1Id!, s.s1Fprms]));
  const titleOf = new Map(types.map((t) => [t.fprms, t]));
  const { baseUrl } = await emailCtx();
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0, recorded = 0;
  const errors: string[] = [];

  for (const o of orders) {
    const root = Number(o.erpSync?.erpDocId);
    if (!root) continue;
    try {
      const chain = await docChain(root);
      const docs = chain.docs.map((d) => ({ findoc: d.findoc, fprms: seriesToFprms.get(String(d.series)) ?? null, docNo: d.fincode, date: d.date }));
      const { fresh, notify } = decide({ root, docs, today, types, seen: o.erpStages.map((s) => ({ findoc: s.findoc, fprms: s.fprms, notified: !!s.notifiedAt })) });
      if (!fresh.length) continue;
      const ship = (o.shipping ?? {}) as ShipTo;
      const to = ship.email ?? o.customer?.email ?? o.guestEmail ?? null;
      const firstName = ship.firstName ?? o.customer?.firstName ?? "";
      const results = new Map<number, { at: Date | null; error: string | null }>();
      for (const d of notify) {
        const t = titleOf.get(d.fprms!)!;
        if (!to) { results.set(d.findoc, { at: null, error: "χωρίς email πελάτη" }); continue; }
        const vars = { "όνομα": firstName, "παραγγελία": o.number, "παραστατικό": d.docNo, "ημερομηνία": dmy(d.date) };
        try {
          const m = await renderTemplate("order-erp-stage", { firstName, number: o.number, title: fillMessage(t.title?.trim() || "Νέα ενημέρωση για την παραγγελία σου", vars), message: fillMessage(t.message!, vars), url: `${baseUrl}/logariasmos/paraggelies/${encodeURIComponent(o.number)}` });
          const r = await sendMail({ to, template: "order-erp-stage", meta: { orderId: o.id, findoc: d.findoc, fprms: d.fprms }, ...m });
          if (r.ok) { results.set(d.findoc, { at: new Date(), error: null }); sent++; }
          else results.set(d.findoc, { at: null, error: r.skipped ? "το email δεν είναι ρυθμισμένο" : String(("error" in r && r.error) || "σφάλμα email").slice(0, 300) });
        } catch (e) {
          results.set(d.findoc, { at: null, error: (e instanceof Error ? e.message : "σφάλμα email").slice(0, 300) });
        }
      }
      // καταγραφή όλων των νέων (και όσων δεν στέλνουν email), ώστε να μην ξαναδοκιμαστούν
      await db.orderErpStage.createMany({ skipDuplicates: true, data: fresh.map((d) => ({ orderId: o.id, findoc: d.findoc, fprms: d.fprms, docNo: d.docNo || null, docDate: d.date || null, notifiedAt: results.get(d.findoc)?.at ?? null, mailError: results.get(d.findoc)?.error ?? null })) });
      recorded += fresh.length;
      for (const [, r] of results) if (r.error) errors.push(`${o.number}: ${r.error}`);
    } catch (e) {
      console.error("[erp-stages]", o.number, e); // λεπτομέρειες μόνο στα logs
      errors.push(`${o.number}: δεν διαβάστηκε η πορεία`);
    }
  }
  const idle = !recorded && !errors.length;
  return { ok: !errors.length, idle, message: [`${orders.length} παραγγελίες ελέγχθηκαν`, recorded ? `${recorded} νέα παραστατικά` : null, sent ? `${sent} email σε πελάτες` : null, ...errors.slice(0, 5)].filter(Boolean).join(" · ") };
}

/**
 * Χειροκίνητο email για ένα στάδιο (κουμπί στη ροή της παραγγελίας): ίδιο πρότυπο και κείμενο με την αυτόματη ενημέρωση.
 * Το παραστατικό πρέπει να ανήκει στην πορεία της παραγγελίας· το κείμενο από τις Ρυθμίσεις ενημέρωσης του τύπου του.
 */
export async function sendStageMail(orderId: string, findoc: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { orderChain } = await import("@/lib/softone/order-chain");
  const chain = await orderChain(orderId);
  const node = chain.ok ? chain.nodes.find((n) => n.findoc === findoc) : null;
  if (!node) return { ok: false, error: "Το παραστατικό δεν βρέθηκε στην πορεία της παραγγελίας." };
  const series = await db.docSeries.findFirst({ where: { s1Id: String(node.series) }, select: { s1Fprms: true } });
  const type = series?.s1Fprms ? await db.docType.findFirst({ where: { s1Id: series.s1Fprms }, select: { customerTitle: true, customerMessage: true } }) : null;
  if (!type?.customerMessage?.trim()) return { ok: false, error: "Αυτό το στάδιο δεν έχει κείμενο email. Γράψ' το στις Ρυθμίσεις ενημέρωσης." };
  const o = await db.order.findUnique({ where: { id: orderId }, select: { number: true, shipping: true, guestEmail: true, customer: { select: { email: true, firstName: true } } } });
  if (!o) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
  const ship = (o.shipping ?? {}) as ShipTo;
  const to = ship.email ?? o.customer?.email ?? o.guestEmail ?? null;
  if (!to) return { ok: false, error: "Η παραγγελία δεν έχει email πελάτη." };
  const firstName = ship.firstName ?? o.customer?.firstName ?? "";
  const vars = { "όνομα": firstName, "παραγγελία": o.number, "παραστατικό": node.fincode, "ημερομηνία": dmy(node.date) };
  const { baseUrl } = await emailCtx();
  const m = await renderTemplate("order-erp-stage", { firstName, number: o.number, title: fillMessage(type.customerTitle?.trim() || "Νέα ενημέρωση για την παραγγελία σου", vars), message: fillMessage(type.customerMessage, vars), url: `${baseUrl}/logariasmos/paraggelies/${encodeURIComponent(o.number)}` });
  const r = await sendMail({ to, template: "order-erp-stage", meta: { orderId, findoc, fprms: series?.s1Fprms ?? null, manual: true }, ...m });
  const error = r.ok ? null : r.skipped ? "το email δεν είναι ρυθμισμένο" : String(("error" in r && r.error) || "σφάλμα email").slice(0, 300);
  const at = r.ok ? new Date() : null;
  await db.orderErpStage.upsert({ where: { orderId_findoc: { orderId, findoc } }, create: { orderId, findoc, fprms: series?.s1Fprms ?? null, docNo: node.fincode || null, docDate: node.date || null, notifiedAt: at, mailError: error }, update: { notifiedAt: at, mailError: error } });
  return error ? { ok: false, error: `Το email δεν στάλθηκε: ${error}` } : { ok: true, message: "Το email στάλθηκε στον πελάτη." };
}
