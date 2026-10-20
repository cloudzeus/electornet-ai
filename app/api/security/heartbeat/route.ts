import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { CHECKS } from "@/lib/security/audit/checks";
import { parseTs, shouldRecordPing, verifyHeartbeat, type RunView } from "@/lib/security/audit/heartbeat";
import { alertsUndelivered, PENDING_MS } from "@/lib/security/audit/notify-core";
import type { AuditMode } from "@/lib/security/audit/types";

/**
 * Dead man's switch: `GET /api/security/heartbeat?ts=<unix δευτερόλεπτα>&sig=<hex HMAC-SHA256(SECURITY_WATCH_SECRET, ts)>`
 * από τον εξωτερικό φύλακα (±5′). Απαντά μόνο πότε έτρεξαν τελευταία ο full και ο light έλεγχος, την κατάστασή τους και αν
 * υπάρχει ειδοποίηση «ΚΡΙΣΙΜΟ» που δεν παραδόθηκε — ποτέ ευρήματα. Κάθε επιτυχημένη κλήση σημειώνεται στο ιστορικό
 * ενεργειών (`security.watch.ping`, το πολύ μία ανά 10′) ώστε η σελίδα «Ασφάλεια» να δείχνει πότε μίλησε τελευταία ο
 * φύλακας. Το /api δεν περνά από το proxy (matcher).
 */
const ACTION = "security.watch.ping";
const noStore = { "Cache-Control": "no-store" };

/**
 * Το νεότερο report του mode που περιέχει ΟΛΟΥΣ τους ελέγχους του (με οποιαδήποτε κατάσταση — και error, φαίνεται στο
 * status)· τα χειροκίνητα reports ενός ελέγχου δεν μετρούν. Ο έλεγχος κάλυψης γίνεται στη βάση (χωρίς φόρτωση των checks),
 * μόνο στις τελευταίες 7 ημέρες (παλαιότερο = null, «δεν έτρεξε»).
 */
async function lastRun(mode: AuditMode): Promise<RunView | null> {
  const keys = CHECKS.filter((c) => c.modes.includes(mode)).map((c) => c.key);
  const rows = await db.$queryRaw<{ id: string; startedAt: Date; status: string }[]>`
    SELECT "id", "startedAt", "status" FROM "SecurityReport"
    WHERE "mode" = ${mode} AND "startedAt" > now() - interval '7 days'
      AND (SELECT count(DISTINCT e->>'key') FROM jsonb_array_elements(CASE WHEN jsonb_typeof("checks") = 'array' THEN "checks" ELSE '[]'::jsonb END) e
           WHERE e->>'key' = ANY(${keys}::text[])) = ${keys.length}
    ORDER BY "startedAt" DESC LIMIT 1`;
  const r = rows[0];
  return r ? { id: r.id, startedAt: r.startedAt.toISOString(), status: r.status } : null;
}

export async function GET(req: Request) {
  const secret = process.env.SECURITY_WATCH_SECRET;
  if (!secret) return NextResponse.json({ error: "Ο φύλακας δεν έχει ρυθμιστεί (SECURITY_WATCH_SECRET)." }, { status: 503, headers: noStore });
  const q = new URL(req.url).searchParams;
  const ts = parseTs(q.get("ts"));
  if (ts === null || !verifyHeartbeat(secret, ts, q.get("sig") ?? "", Math.floor(Date.now() / 1000))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const now = new Date();
  try {
    const [lastFull, lastLight, recent, ping] = await Promise.all([
      lastRun("full"),
      lastRun("light"),
      db.securityReport.findMany({ where: { startedAt: { gte: new Date(now.getTime() - PENDING_MS) } }, orderBy: { startedAt: "desc" }, take: 200, select: { startedAt: true, alerted: true, alertRetry: true } }),
      db.auditLog.findFirst({ where: { action: ACTION }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (shouldRecordPing(ping?.createdAt ?? null, now)) await audit(null, ACTION, "Security", null, undefined, { ts });
    return NextResponse.json({ lastFull, lastLight, alertsUndelivered: alertsUndelivered(recent, now) }, { headers: noStore });
  } catch (e) {
    console.error("[security-heartbeat]", e);
    return NextResponse.json({ error: "Η βάση δεν απάντησε." }, { status: 500, headers: noStore });
  }
}
