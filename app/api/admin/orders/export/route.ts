import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { isView, listOrders } from "@/lib/orders/admin";
import { FULFILMENT, statusLabel, type Fulfilment } from "@/lib/orders/model";
import { payLabel } from "@/lib/account/labels";

/** GET ?view=…&q=…&ful=…&pay=…&from=…&to=…[&ids=a,b] → CSV (UTF-8 με BOM για το Excel) της τρέχουσας λίστας, έως 5.000. */
export async function GET(req: Request) {
  const user = await requirePermission("orders.read");
  const q = new URL(req.url).searchParams;
  const ids = new Set((q.get("ids") ?? "").split(",").filter(Boolean));
  const f = { view: isView(q.get("view")) ? (q.get("view") as never) : "all", q: q.get("q") ?? "", fulfilment: q.get("ful") ?? "", pay: q.get("pay") ?? "", from: q.get("from") ?? "", to: q.get("to") ?? "" } as const;
  const rows: Awaited<ReturnType<typeof listOrders>>["rows"] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await listOrders({ ...f, page });
    rows.push(...r.rows);
    if (page >= r.pages || rows.length >= 5000) break;
  }
  const list = ids.size ? rows.filter((r) => ids.has(r.id)) : rows;
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Αριθμός", "Ημερομηνία", "Κατάσταση", "Πελάτης", "Εταιρεία", "Email", "Πόλη", "Παράδοση", "Πληρωμή", "Τεμάχια", "Σύνολο", "Έκπτωση", "Κουπόνι", "Voucher", "SoftOne"];
  const lines = list.map((r) => [r.number, new Date(r.createdAt).toLocaleString("el-GR"), statusLabel(r.status), r.name, r.company, r.email, r.city, FULFILMENT[r.fulfilment as Fulfilment] ?? r.fulfilment, payLabel(r.paymentMethod), r.items, r.total.toFixed(2).replace(".", ","), r.discount.toFixed(2).replace(".", ","), r.coupon, r.shipment?.voucher, r.erp].map(esc).join(";"));
  await audit(user.id, "order.export", "Order", null, null, { count: list.length, view: f.view });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${[head.join(";"), ...lines].join("\r\n")}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="paraggelies-${day}.csv"`, "cache-control": "no-store" } });
}
