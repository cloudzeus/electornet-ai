import { db } from "@/lib/db";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { classifyLogins, loginsSummary } from "./logins-core";

const DAY = 86_400_000;

export const loginsCheck: Check = {
  key: "logins",
  title: "Συνδέσεις στη διαχείριση",
  modes: ["full", "light"],
  timeoutMs: 30_000,
  async run({ since }) {
    const [events, staff] = await Promise.all([
      // 90 ημέρες πριν από το παράθυρο = το «γνωστό» ιστορικό (IP, συσκευές, χώρες) κάθε λογαριασμού
      db.loginEvent.findMany({ where: { method: "admin", at: { gte: new Date(since.getTime() - 90 * DAY) } }, select: { staffId: true, email: true, success: true, reason: true, ip: true, country: true, userAgent: true, os: true, browser: true, at: true }, orderBy: { at: "asc" } }),
      db.staff.findMany({ select: { email: true } }),
    ]);
    const findings = classifyLogins({ since, events, staffEmails: staff.map((s) => s.email) });
    return { status: statusOf(findings), summary: loginsSummary({ since, events }), findings };
  },
};
