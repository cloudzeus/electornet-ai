import type { Finding } from "../rules";
import { athens } from "../execute";

/**
 * Αλλαγές ρυθμίσεων και API keys — καθαρή λογική (τα δεδομένα τα φέρνει το settings-changes.ts).
 *
 * Πηγές: AuditLog `settings.update` (entityId = ενότητα, before/after χωρίς μυστικά· `_secretsSet` = ποια μυστικά
 * γράφτηκαν) και `apikey.*`· επιπλέον το `Setting.updatedAt` και το `ApiKey.createdAt`, ώστε να φαίνεται αλλαγή που έγινε
 * απευθείας στη βάση (χωρίς εγγραφή στο ιστορικό ενεργειών).
 *   Critical: analytics/pixels ή πληρωμές από λογαριασμό που δεν είχε κάνει αλλαγή στην ίδια ενότητα στις 90 ημέρες πριν
 *             από το παράθυρο · analytics/πληρωμές χωρίς εγγραφή στο ιστορικό · νέο API key χωρίς εγγραφή.
 *   Warn: κάθε άλλη αλλαγή ρυθμίσεων (email, SoftOne, couriers, ασφάλεια, social login, Bunny…), νέο / επανενεργοποιημένο API key.
 */

export type SettingsAudit = { action: string; entityId: string | null; staffId: string | null; createdAt: Date; before: unknown; after: unknown };
export type SettingRow = { section: string; updatedAt: Date; updatedById: string | null };
export type ApiKeyRow = { id: string; name: string; prefix: string; createdAt: Date };

const LABELS: Record<string, string> = {
  analytics: "Analytics & pixels", payments: "Πληρωμές", email: "Email & SMS", softone: "SoftOne", shipping: "Couriers / αποστολές",
  security: "Ασφάλεια", "social-login": "Social login", bunny: "Bunny CDN", aade: "ΑΑΔΕ", ai: "AI & υπηρεσίες", general: "Γενικά", social: "Social προφίλ",
};
const CRITICAL = new Set(["analytics", "payments"]);
/** Ενότητες όπου δείχνουμε και τις τιμές (δημόσια IDs που μπαίνουν έτσι κι αλλιώς στο HTML). */
const SHOW_VALUES = new Set(["analytics"]);

/** Η κατηγορία μιας ενέργειας του ιστορικού, ή null αν δεν αλλάζει ρύθμιση/πρόσβαση (δοκιμές, ανακλήσεις). */
export function settingsSensitive(action: string, entityId: string | null): { label: string; critical: boolean } | null {
  if (action === "settings.update") { const s = entityId ?? ""; return { label: LABELS[s] ?? `Ρυθμίσεις «${s}»`, critical: CRITICAL.has(s) }; }
  if (action === "apikey.create" || action === "apikey.enable") return { label: "API keys", critical: false };
  return null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const val = (v: unknown) => `«${v === undefined || v === null || v === "" ? "κενό" : String(v)}»`;
const NO_AUDIT = "Χωρίς εγγραφή στο ιστορικό ενεργειών — η αλλαγή έγινε εκτός της διαχείρισης (απευθείας στη βάση ή από script).";
const MATCH_MS = 60_000;

export function classifySettingsChanges(input: { since: Date; audits: SettingsAudit[]; settings: SettingRow[]; apiKeys: ApiKeyRow[]; emailOf: Record<string, string> }): Finding[] {
  const { since, emailOf } = input;
  const who = (id: string | null) => (id ? emailOf[id] ?? `άγνωστος λογαριασμός ${id}` : "άγνωστος");
  const inWin = input.audits.filter((a) => a.createdAt >= since).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: Finding[] = [];

  // 1) αλλαγές ρυθμίσεων ανά (ενότητα, λογαριασμό)
  const groups = new Map<string, SettingsAudit[]>();
  for (const a of inWin) {
    if (a.action !== "settings.update") continue;
    const k = `${a.entityId}|${a.staffId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  for (const rows of groups.values()) {
    const { entityId: section, staffId } = rows[0];
    const cat = settingsSensitive("settings.update", section)!;
    const keys = new Set<string>(), secrets = new Set<string>(), diffs: string[] = [];
    for (const a of rows) {
      const b = obj(a.before), af = obj(a.after);
      for (const k of new Set([...Object.keys(b), ...Object.keys(af)])) {
        if (k === "_secretsSet" || JSON.stringify(b[k]) === JSON.stringify(af[k])) continue;
        keys.add(k);
        if (SHOW_VALUES.has(section ?? "")) diffs.push(`${k}: ${val(b[k])} → ${val(af[k])}`);
      }
      strs(af._secretsSet).forEach((s) => secrets.add(s));
    }
    const newcomer = cat.critical && !input.audits.some((p) => p.action === "settings.update" && p.entityId === section && p.staffId === staffId && p.createdAt < since && p.createdAt.getTime() >= since.getTime() - 90 * 86_400_000);
    const what = [
      diffs.length ? `Τιμές: ${diffs.join(" · ")}` : keys.size ? `Πεδία: ${[...keys].sort().join(", ")}` : "",
      secrets.size ? `άλλαξαν μυστικά: ${[...secrets].sort().join(", ")}` : "",
    ].filter(Boolean).join("· ");
    out.push({
      severity: newcomer ? "critical" : "warn",
      title: newcomer ? `${cat.label}: αλλαγή από λογαριασμό που δεν το είχε ξανακάνει` : `Αλλαγή ρυθμίσεων: ${cat.label}`,
      detail: `${rows.length} ${rows.length === 1 ? "αλλαγή" : "αλλαγές"} από ${who(staffId)} (${rows.map((r) => athens(r.createdAt)).join(", ")}). ${what || "Χωρίς διαφορά στα πεδία."}${newcomer ? " Ο λογαριασμός δεν είχε αλλάξει αυτή την ενότητα στις 90 ημέρες πριν — επιβεβαιώστε ότι η αλλαγή είναι γνωστή (π.χ. νέο pixel / νέος λογαριασμός πληρωμών)." : ""}`,
      evidence: `${section} · ${who(staffId)} · ${keys.size ? [...keys].sort().join(", ") : "μόνο μυστικά"}`,
    });
  }

  // 2) ρυθμίσεις που άλλαξαν χωρίς εγγραφή στο ιστορικό
  for (const s of input.settings) {
    if (s.updatedAt < since) continue;
    const audited = input.audits.some((a) => a.action === "settings.update" && a.entityId === s.section && Math.abs(a.createdAt.getTime() - s.updatedAt.getTime()) <= MATCH_MS);
    if (audited) continue;
    const cat = settingsSensitive("settings.update", s.section)!;
    out.push({ severity: cat.critical ? "critical" : "warn", title: "Αλλαγή ρύθμισης χωρίς εγγραφή στο ιστορικό ενεργειών", detail: `Η ενότητα «${cat.label}» άλλαξε στις ${athens(s.updatedAt)}${s.updatedById ? ` (σημειωμένος χρήστης: ${who(s.updatedById)})` : ""}. ${NO_AUDIT}`, evidence: s.section });
  }

  // 3) API keys
  for (const a of inWin) {
    if (a.action !== "apikey.create" && a.action !== "apikey.enable") continue;
    const af = obj(a.after);
    const key = input.apiKeys.find((k) => k.id === a.entityId);
    const name = `${String(af.name ?? key?.name ?? a.entityId)}${typeof af.prefix === "string" ? ` (${af.prefix})` : key ? ` (${key.prefix})` : ""}`;
    const scopes = strs(af.scopes);
    out.push({ severity: "warn", title: a.action === "apikey.create" ? "Νέο API key" : "Επανενεργοποίηση API key", detail: `${name} από ${who(a.staffId)} στις ${athens(a.createdAt)}${scopes.length ? ` — δικαιώματα: ${scopes.join(", ")}` : ""}. Δίνει πρόσβαση στο API χωρίς σύνδεση.`, evidence: name });
  }
  for (const k of input.apiKeys) {
    if (k.createdAt < since || input.audits.some((a) => a.action === "apikey.create" && a.entityId === k.id)) continue;
    out.push({ severity: "critical", title: "Νέο API key χωρίς εγγραφή στο ιστορικό ενεργειών", detail: `${k.name} (${k.prefix}) δημιουργήθηκε στις ${athens(k.createdAt)}. ${NO_AUDIT}`, evidence: `${k.name} (${k.prefix})` });
  }
  return out;
}

export function settingsSummary(input: { since: Date; audits: SettingsAudit[]; settings: SettingRow[]; apiKeys: ApiKeyRow[] }): string {
  const win = input.audits.filter((a) => a.createdAt >= input.since);
  const upd = win.filter((a) => a.action === "settings.update");
  const sections = [...new Set(upd.map((a) => a.entityId ?? "?"))].sort();
  const keys = win.filter((a) => a.action.startsWith("apikey.")).length;
  const hist = input.audits.filter((a) => a.createdAt < input.since && a.action === "settings.update").length;
  return [
    `${upd.length} αλλαγές ρυθμίσεων${sections.length ? ` (${sections.join(", ")})` : ""} και ${keys} ενέργειες σε API keys από ${athens(input.since)}`,
    `${input.settings.length} ενότητες ρυθμίσεων και ${input.apiKeys.length} API keys ελέγχθηκαν για αλλαγές χωρίς εγγραφή στο ιστορικό`,
    `ιστορικό 90 ημερών: ${hist} προηγούμενες αλλαγές ρυθμίσεων`,
  ].join(" · ");
}
