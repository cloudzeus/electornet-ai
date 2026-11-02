import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { daysLeft, listDevices, nowMs, parseFilter, SOURCE_LABEL, type DeviceRow } from "@/app/admin/(shell)/eggyiseis/devices";

const MAX = 20_000, BATCH = 2_000;

/** GET ?q=…&status=…&source=…&brand=…&sort=… → CSV (UTF-8 με BOM, «;» για το ελληνικό Excel) των συσκευών της σελίδας «Εγγυήσεις συσκευών», έως 20.000. */
export async function GET(req: Request) {
  const user = await requirePermission("service.tickets.read");
  const f = parseFilter(new URL(req.url).searchParams);
  const now = new Date(nowMs());
  const rows: DeviceRow[] = [];
  for (let skip = 0; skip < MAX; skip += BATCH) {
    const r = await listDevices(f, { skip, take: BATCH }, now);
    rows.push(...r.rows);
    if (r.rows.length < BATCH) break;
  }
  const day = (d: Date | null) => (d ? d.toLocaleDateString("el-GR", { timeZone: "Europe/Athens" }) : "");
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Μάρκα", "Περιγραφή", "Μοντέλο", "S/N", "Αρ. πελάτη", "Πελάτης", "Email", "Κινητό/τηλέφωνο", "Αγορά", "Εγγύηση (μήνες)", "Εγγύηση έως", "Επέκταση έως", "Πρόγραμμα επέκτασης", "Ημέρες που απομένουν", "Πηγή", "Παραστατικό", "Ανοιχτά αιτήματα service"];
  const lines = rows.map((r) => {
    const left = daysLeft(r, now.getTime());
    return [r.brand, r.title, r.model, r.serial, r.customerNumber, r.company ? `${r.company} (${r.lastName} ${r.firstName})` : `${r.lastName} ${r.firstName}`, r.email, r.mobile ?? r.phone, day(r.purchasedAt), r.warrantyMonths, day(r.warrantyUntil), day(r.extendedUntil), r.extendedPlan, left ? left.days : "", SOURCE_LABEL[r.registeredBy] ?? r.registeredBy, r.invoiceNo, r.openTickets].map(esc).join(";");
  });
  await audit(user.id, "device.export", "CustomerDevice", null, null, { count: rows.length, filter: f });
  const stamp = now.toISOString().slice(0, 10);
  return new Response(`﻿${[head.join(";"), ...lines].join("\r\n")}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="eggyiseis-${stamp}.csv"`, "cache-control": "no-store" } });
}
