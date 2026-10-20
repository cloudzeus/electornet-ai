import { db } from "@/lib/db";
import { SECTIONS } from "@/lib/settings/schema";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { classifySettingsChanges, settingsSummary } from "./settings-core";

const DAY = 86_400_000;

export const settingsChangesCheck: Check = {
  key: "settings-changes",
  title: "Αλλαγές ρυθμίσεων και API keys",
  modes: ["full", "light"],
  timeoutMs: 30_000,
  async run({ since }) {
    const [audits, settings, apiKeys, staff] = await Promise.all([
      db.auditLog.findMany({ where: { createdAt: { gte: new Date(since.getTime() - 90 * DAY) }, OR: [{ action: "settings.update" }, { action: { startsWith: "apikey." } }] }, select: { action: true, entityId: true, staffId: true, createdAt: true, before: true, after: true } }),
      // μόνο οι ενότητες των Ρυθμίσεων — οι υπόλοιπες γραμμές του Setting είναι εσωτερική κατάσταση (session SoftOne, κλειδαριές)
      db.setting.findMany({ where: { section: { in: SECTIONS.map((s) => s.key) } }, select: { section: true, updatedAt: true, updatedById: true } }),
      db.apiKey.findMany({ select: { id: true, name: true, prefix: true, createdAt: true } }),
      db.staff.findMany({ select: { id: true, email: true } }),
    ]);
    const input = { since, audits, settings, apiKeys, emailOf: Object.fromEntries(staff.map((s) => [s.id, s.email])) };
    const findings = classifySettingsChanges(input);
    return { status: statusOf(findings), summary: settingsSummary(input), findings };
  },
};
