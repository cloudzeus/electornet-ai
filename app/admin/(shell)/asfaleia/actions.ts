"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { runManualFull, withSendLock } from "@/lib/security/audit/manual";
import { sendSummary } from "@/lib/security/audit/notify";
import { FULL_RUN_WHERE } from "@/lib/security/audit/run";
import { asSeverity, athensDateTime } from "@/lib/security/audit/notify-core";
import type { Severity } from "@/lib/security/audit/rules";

/** Ενέργειες της σελίδας «Ασφάλεια» — μόνο super-admin (ruling G). Καταγράφονται στο ιστορικό ενεργειών. */

export type RunResult = { ok: boolean; message: string; reportId?: string; status?: Severity };

/** «Τρέξε τώρα»: πλήρης έλεγχος (όλοι οι έλεγχοι, έως ~5′) + άμεσες ειδοποιήσεις «ΚΡΙΣΙΜΟ». */
export async function runSecurityAuditNow(): Promise<RunResult> {
  const user = await requireSuperAdmin();
  try {
    const r = await runManualFull(user.email ?? user.id);
    if (r.kind === "busy") return { ok: false, message: `Τρέχει ήδη πλήρης έλεγχος (ξεκίνησε ${athensDateTime(r.startedAt)}). Η σελίδα θα δείξει το αποτέλεσμα όταν τελειώσει.` };
    const status = asSeverity(r.status);
    await audit(user.id, "security.run", "SecurityReport", r.reportId, null, { mode: "full", status });
    revalidatePath("/admin/asfaleia");
    return { ok: true, reportId: r.reportId, status, message: r.alerted ? "Ο έλεγχος ολοκληρώθηκε." : "Ο έλεγχος ολοκληρώθηκε, αλλά η ειδοποίηση «ΚΡΙΣΙΜΟ» δεν παραδόθηκε — θα ξαναδοκιμαστεί στον επόμενο αυτόματο έλεγχο." };
  } catch (e) {
    console.error("[security-audit] manual run", e);
    await audit(user.id, "security.run", "SecurityReport", null, null, { mode: "full", error: true });
    return { ok: false, message: "Ο έλεγχος δεν ολοκληρώθηκε (σφάλμα στον server — δείτε τα logs)." };
  }
}

/**
 * «Αποστολή report τώρα»: το email σύνοψης του τελευταίου πλήρους ελέγχου (με το σημάδι run — όχι δοκιμή ενός ελέγχου)
 * στους παραλήπτες των Ρυθμίσεων → Ασφάλεια.
 */
export async function sendSecurityReportNow(): Promise<RunResult> {
  const user = await requireSuperAdmin();
  const last = await db.securityReport.findFirst({ where: FULL_RUN_WHERE, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true } });
  if (!last) return { ok: false, message: "Δεν υπάρχει ακόμη πλήρης έλεγχος για αποστολή — πατήστε πρώτα «Τρέξε τώρα»." };
  try {
    const r = await withSendLock(() => sendSummary(last.id));
    if (r === "busy") return { ok: false, message: "Η αποστολή βρίσκεται ήδη σε εξέλιξη." };
    await audit(user.id, "security.report.send", "SecurityReport", last.id, null, { sent: r.sent, failed: r.failed });
    if (!r.sent && !r.failed) return { ok: false, message: "Δεν υπάρχουν παραλήπτες." };
    const when = athensDateTime(last.startedAt);
    return r.ok
      ? { ok: true, reportId: last.id, message: `Η αναφορά της ${when} στάλθηκε σε ${r.sent} ${r.sent === 1 ? "παραλήπτη" : "παραλήπτες"}.` }
      : { ok: false, reportId: last.id, message: `Η αναφορά της ${when} στάλθηκε σε ${r.sent}· απέτυχε σε ${r.failed}. Ελέγξτε τις Ρυθμίσεις → Email.` };
  } catch (e) {
    console.error("[security-audit] manual summary", e);
    return { ok: false, message: "Η αποστολή απέτυχε (σφάλμα στον server — δείτε τα logs)." };
  }
}
