import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { listLedger, parseLedgerFilter } from "@/lib/gdpr/ledger";
import { CHANNEL_LABEL, METHOD_LABEL, SOURCE_LABEL, TOPIC_LABEL, label } from "@/lib/gdpr/topics";

/** GET ?q=…&topic=…&decision=…&period=… → CSV (UTF-8 με BOM για το Excel) του μητρώου συναινέσεων με τα τρέχοντα φίλτρα, έως 5.000. */
export async function GET(req: Request) {
  const user = await requirePermission("customers.export");
  const q = new URL(req.url).searchParams;
  const f = parseLedgerFilter({ q: q.get("q"), topic: q.get("topic"), decision: q.get("decision"), period: q.get("period") });
  const { rows } = await listLedger(f, 1, 5000);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Ημερομηνία", "Email", "Πελάτης", "Θέμα", "Κανάλι", "Απόφαση", "Τρόπος", "Πηγή", "Από προσωπικό", "Κείμενο", "Έκδοση", "Hash κειμένου", "IP", "Hash IP", "Λειτουργικό", "Browser", "Συσκευή", "Σελίδα", "Επιβεβαίωση"];
  const lines = rows.map((r) => [r.at.toLocaleString("el-GR", { hour12: false }), r.email ?? r.customer?.email, r.customer ? `${r.customer.lastName} ${r.customer.firstName}`.trim() : "", label(TOPIC_LABEL, r.topic), label(CHANNEL_LABEL, r.channel), r.granted ? "Συναίνεση" : "Ανάκληση", label(METHOD_LABEL, r.method), label(SOURCE_LABEL, r.source), r.staffId ? "ναι" : "", r.textKey, r.textVersion, r.textHash, r.ip, r.ipHash, r.os, r.browser, r.device, r.url, r.confirmedAt?.toLocaleString("el-GR", { hour12: false })].map(esc).join(";"));
  await audit(user.id, "gdpr.consent.export", "Consent", null, null, { count: rows.length, ...f });
  return new Response(`﻿${[head.join(";"), ...lines].join("\r\n")}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="synaineseis-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
