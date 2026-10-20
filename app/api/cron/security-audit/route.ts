import { NextResponse } from "next/server";
import { runAudit } from "@/lib/security/audit/run";
import { retryPendingSummaries, sendPendingAlerts, sendSummary } from "@/lib/security/audit/notify";
import { bearerOk } from "@/lib/security/audit/heartbeat";

export const maxDuration = 300;

/**
 * Cron: `GET /api/cron/security-audit?mode=full|light` με `Authorization: Bearer $CRON_SECRET` (σύγκριση σταθερού χρόνου).
 * Τρέχει τον έλεγχο ασφαλείας (μόνο αναγνώσεις) και αποθηκεύει report· μετά στέλνει τις άμεσες ειδοποιήσεις «ΚΡΙΣΙΜΟ»
 * (νέα κρίσιμα + όσα δεν στάλθηκαν στις προηγούμενες εκτελέσεις) και, στο full, το email σύνοψης (η επιτυχία του
 * καταγράφεται στο SecurityReport.summarySent· σύνοψη που δεν την πήρε κανείς την ξαναστέλνει ο επόμενος light, εντός 24 ωρών).
 * Coolify scheduled tasks: full 07:00 Europe/Athens, light κάθε ώρα στο :05 (όχι :00 — να μη συμπίπτει με τον full· οι
 * ειδοποιήσεις έχουν ατομικό κλείδωμα ανά εύρημα, αλλά δύο ταυτόχρονοι έλεγχοι διπλασιάζουν τον φόρτο). Η απάντηση δεν
 * περιέχει ευρήματα.
 */
export async function GET(req: Request) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const m = new URL(req.url).searchParams.get("mode");
  if (m !== "full" && m !== "light") return NextResponse.json({ error: "mode=full|light" }, { status: 400 });
  let report: Awaited<ReturnType<typeof runAudit>>;
  try {
    report = await runAudit(m);
  } catch (e) {
    console.error("[security-audit] run", e);
    return NextResponse.json({ error: "Ο έλεγχος δεν ολοκληρώθηκε." }, { status: 500 });
  }
  // πρώτα οι ειδοποιήσεις (επείγουν), μετά η σύνοψη· αποτυχία της μίας δεν σταματά την άλλη
  const alerted = await sendPendingAlerts().then((r) => r.alerted, (e) => { console.error("[security-audit] alerts", e); return false; });
  const summarySent = m === "full" ? await sendSummary(report.reportId).then((r) => r.ok, (e) => { console.error("[security-audit] summary", e); return false; }) : undefined;
  const summariesRetried = m === "light" ? await retryPendingSummaries().catch((e) => { console.error("[security-audit] summary retry", e); return 0; }) : undefined;
  return NextResponse.json({ reportId: report.reportId, status: report.status, alerted, ...(summarySent !== undefined ? { summarySent } : {}), ...(summariesRetried ? { summariesRetried } : {}) });
}
