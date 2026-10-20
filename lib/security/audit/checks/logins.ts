import { db } from "@/lib/db";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { classifyLogins, loginsSummary } from "./logins-core";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const loginsCheck: Check = {
  key: "logins",
  title: "Συνδέσεις στη διαχείριση",
  modes: ["full", "light"],
  timeoutMs: 30_000,
  async run({ since }) {
    const select = { staffId: true, email: true, success: true, reason: true, ip: true, country: true, userAgent: true, os: true, browser: true, at: true } as const;
    const [okHist, recent, staff] = await Promise.all([
      // επιτυχείς 90 ημερών = το «γνωστό» ιστορικό (IP, συσκευές, χώρες) κάθε λογαριασμού
      db.loginEvent.findMany({ where: { method: "admin", success: true, at: { gte: new Date(since.getTime() - 90 * DAY), lt: since } }, select }),
      // παράθυρο + μία ώρα πριν: οι αποτυχίες χρειάζονται μόνο για εκρήξεις/μάντεμα που τελειώνουν μέσα στο παράθυρο
      db.loginEvent.findMany({ where: { method: "admin", at: { gte: new Date(since.getTime() - HOUR) } }, select }),
      db.staff.findMany({ select: { email: true } }),
    ]);
    // οι επιτυχείς της ώρας πριν από το since είναι και στα δύο ερωτήματα
    const events = [...okHist.filter((e) => e.at.getTime() < since.getTime() - HOUR), ...recent].sort((a, b) => a.at.getTime() - b.at.getTime());
    const findings = classifyLogins({ since, events, staffEmails: staff.map((s) => s.email) });
    return { status: statusOf(findings), summary: loginsSummary({ since, events }), findings };
  },
};
