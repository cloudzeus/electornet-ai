/**
 * Σκετς Ερμή — τι είπαν οι παρουσιαστές στις πρόβες, ανά βήμα: από το AuditLog «skets.turn» (γράφεται από /api/skets/turn).
 * Δείχνει πού πήγε κάθε ατάκα· με ⚠ όσες πήγαν στο μοντέλο (αργές) ή δεν αναγνωρίστηκαν — υποψήφιες για νέες λέξεις-κλειδιά
 * ή έτοιμες απαντήσεις (scripts/skets/qa.ts).
 *   npx tsx --conditions=react-server scripts/skets/turns.ts [ημέρες=7]
 */
import "dotenv/config";
import { db } from "../../lib/db";

(async () => {
  const days = Number(process.argv[2] ?? 7);
  const rows = await db.auditLog.findMany({ where: { action: "skets.turn", createdAt: { gte: new Date(Date.now() - days * 864e5) } }, orderBy: { createdAt: "asc" }, select: { entityId: true, after: true, createdAt: true } });
  const by = new Map<string, string[]>();
  for (const r of rows) {
    const o = (r.after ?? {}) as { route?: string; said?: string; heard?: string; ready?: boolean; to?: string; alt?: string; cat?: string; ms?: unknown };
    const slow = o.route === "free" && !o.ready, miss = o.route === "none";
    const where = o.route === "jump" ? `→ ${o.to}${o.alt ? ` (${o.alt})` : ""}` : o.route === "alt" ? `→ ${o.cat} ${o.alt || "βασικό"}` : o.route === "free" ? (o.ready ? "→ έτοιμη απάντηση" : "→ ΜΟΝΤΕΛΟ") : `→ ${o.route}`;
    const ms = typeof o.ms === "number" ? o.ms : (o.ms as { stt?: number; llm?: number } | undefined)?.stt;
    const line = `${slow || miss ? "⚠" : " "} «${o.said ?? o.heard ?? ""}» ${where}${ms ? ` · ${ms} ms` : ""}`;
    by.set(r.entityId ?? "?", [...(by.get(r.entityId ?? "?") ?? []), line]);
  }
  for (const [beat, lines] of by) console.log(`\n${beat} (${lines.length})\n${lines.join("\n")}`);
  console.log(`\n${rows.length} ατάκες, ${days} ημέρες`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
