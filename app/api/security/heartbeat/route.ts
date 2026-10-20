import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { CHECKS } from "@/lib/security/audit/checks";
import { latestCompleteRun, parseTs, shouldRecordPing, verifyHeartbeat, type RunView } from "@/lib/security/audit/heartbeat";
import type { AuditMode } from "@/lib/security/audit/types";

/**
 * Dead man's switch: `GET /api/security/heartbeat?ts=<unix δευτερόλεπτα>&sig=<hex HMAC-SHA256(SECURITY_WATCH_SECRET, ts)>`
 * από τον εξωτερικό φύλακα (±5′). Απαντά μόνο πότε έτρεξαν τελευταία ο full και ο light έλεγχος και την κατάστασή τους —
 * ποτέ ευρήματα. Κάθε επιτυχημένη κλήση σημειώνεται στο ιστορικό ενεργειών (`security.watch.ping`, το πολύ μία ανά 10′)
 * ώστε η σελίδα «Ασφάλεια» να δείχνει πότε μίλησε τελευταία ο φύλακας. Το /api δεν περνά από το proxy (matcher).
 */
const ACTION = "security.watch.ping";
const noStore = { "Cache-Control": "no-store" };

async function lastRun(mode: AuditMode): Promise<RunView | null> {
  const keys = CHECKS.filter((c) => c.modes.includes(mode)).map((c) => c.key);
  const rows = await db.securityReport.findMany({ where: { mode }, orderBy: { startedAt: "desc" }, take: 10, select: { id: true, startedAt: true, status: true, checks: true } });
  return latestCompleteRun(rows, keys);
}

export async function GET(req: Request) {
  const secret = process.env.SECURITY_WATCH_SECRET;
  if (!secret) return NextResponse.json({ error: "Ο φύλακας δεν έχει ρυθμιστεί (SECURITY_WATCH_SECRET)." }, { status: 503, headers: noStore });
  const q = new URL(req.url).searchParams;
  const ts = parseTs(q.get("ts"));
  if (ts === null || !verifyHeartbeat(secret, ts, q.get("sig") ?? "", Math.floor(Date.now() / 1000))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    const [lastFull, lastLight, ping] = await Promise.all([
      lastRun("full"),
      lastRun("light"),
      db.auditLog.findFirst({ where: { action: ACTION }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (shouldRecordPing(ping?.createdAt ?? null, new Date())) await audit(null, ACTION, "Security", null, undefined, { ts });
    return NextResponse.json({ lastFull, lastLight }, { headers: noStore });
  } catch (e) {
    console.error("[security-heartbeat]", e);
    return NextResponse.json({ error: "Η βάση δεν απάντησε." }, { status: 500, headers: noStore });
  }
}
