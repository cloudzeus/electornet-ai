import { db } from "@/lib/db";
import type { Check } from "../types";
import { watcherOutcome } from "./watcher-core";

const DAY = 86_400_000;

/** Πότε μίλησε τελευταία ο εξωτερικός φύλακας (security.watch.ping στο ιστορικό ενεργειών, 30 ημέρες πίσω — φθηνό, ευρετήριο createdAt). */
export const watcherCheck: Check = {
  key: "watcher",
  title: "Εξωτερικός φύλακας (GitHub Actions)",
  modes: ["full", "light"],
  timeoutMs: 15_000,
  async run({ now }) {
    const last = await db.auditLog.findFirst({ where: { action: "security.watch.ping", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    return watcherOutcome(last?.createdAt ?? null, now);
  },
};
