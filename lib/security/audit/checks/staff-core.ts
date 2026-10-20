import type { Finding } from "../rules";
import { athens } from "../execute";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";

/**
 * Λογαριασμοί διαχείρισης, ρόλοι, δικαιώματα — καθαρή λογική (τα δεδομένα τα φέρνει το staff.ts).
 *
 * Δύο πηγές, ώστε να φαίνεται και ό,τι έγινε ΑΠΕΥΘΕΙΑΣ στη βάση (χωρίς ίχνος στο ιστορικό ενεργειών):
 *  1. το ιστορικό ενεργειών (AuditLog staff.* / role.*) μέσα στο παράθυρο·
 *  2. σύγκριση με το στιγμιότυπο (snapshot) του προηγούμενου ελέγχου — το StaffRole / RolePermission δεν έχουν ημερομηνία.
 * Η ίδια αλλαγή από τις δύο πηγές → ένα εύρημα· η λεπτομέρεια λέει αν υπάρχει εγγραφή στο ιστορικό και ποιος την έκανε.
 *
 * Critical: νέος λογαριασμός, νέος super-admin, νέο δικαίωμα staff.* / settings.* (ή «*») σε ρόλο.
 * Warn: άλλος νέος ρόλος σε χρήστη, άλλο νέο δικαίωμα, νέος / διαγραμμένος ρόλος, επανενεργοποίηση, αλλαγή κωδικού από
 * άλλον χρήστη. Αφαιρέσεις (λιγότερη πρόσβαση) δεν είναι ευρήματα.
 */

export type StaffRow = { id: string; email: string; active: boolean; createdAt: Date; roles: string[] };
export type RoleRow = { id: string; key: string; permissions: string[] };
export type StaffAudit = { action: string; entityId: string | null; staffId: string | null; createdAt: Date; before: unknown; after: unknown };
export type StaffSnapshot = { at: string; staff: { id: string; email: string; active: boolean; roles: string[] }[]; roles: { key: string; permissions: string[] }[] };

export const SUPER_ADMIN = "super-admin";

/** Δικαιώματα που δίνουν έλεγχο λογαριασμών ή ρυθμίσεων (μυστικά, πληρωμές, pixels). */
export const sensitivePermission = (key: string) => key === "*" || /^(?:staff|settings)\./.test(key);
/** «*» ή «ομάδα.*» — το can() τα τιμά (lib/rbac/permissions.ts)· το seed τα αναπτύσσει, άρα στη βάση δεν υπάρχουν κανονικά. */
export const wildcardPermission = (key: string) => key === "*" || key.endsWith(".*");
const APP_KEYS = new Set(ALL_PERMISSION_KEYS);

export function staffSnapshot(staff: StaffRow[], roles: RoleRow[], at: Date): StaffSnapshot {
  return {
    at: at.toISOString(),
    staff: staff.map((s) => ({ id: s.id, email: s.email, active: s.active, roles: [...s.roles].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
    roles: roles.map((r) => ({ key: r.key, permissions: [...r.permissions].sort() })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
/** Το στιγμιότυπο του ελέγχου staff μέσα στα checks ενός SecurityReport (ή null αν λείπει / έχει άλλο σχήμα). */
export function baselineFrom(checks: unknown): StaffSnapshot | null {
  if (!Array.isArray(checks)) return null;
  const s = (checks.find((c) => c && typeof c === "object" && (c as { key?: unknown }).key === "staff") as { snapshot?: unknown } | undefined)?.snapshot as StaffSnapshot | undefined;
  if (!s || typeof s.at !== "string" || !Array.isArray(s.staff) || !Array.isArray(s.roles)) return null;
  const okStaff = s.staff.every((x) => x && typeof x.id === "string" && typeof x.email === "string" && typeof x.active === "boolean" && isStrArr(x.roles));
  const okRoles = s.roles.every((x) => x && typeof x.key === "string" && isStrArr(x.permissions));
  return okStaff && okRoles ? s : null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strs = (v: unknown): string[] => (isStrArr(v) ? v : []);
const minus = (a: string[], b: string[]) => { const s = new Set(b); return [...new Set(a)].filter((x) => !s.has(x)); };

type Change = { audited: string[]; snapshot: boolean };
const NO_AUDIT = "Χωρίς εγγραφή στο ιστορικό ενεργειών — η αλλαγή έγινε εκτός της διαχείρισης (απευθείας στη βάση ή από script).";

export type StaffInput = {
  since: Date;
  /** από πότε μετρούν οι ενέργειες του ιστορικού: το νωρίτερο από since και την ώρα του στιγμιοτύπου (προεπιλογή since) */
  auditsFrom?: Date;
  staff: StaffRow[]; roles: RoleRow[]; audits: StaffAudit[]; baseline: StaffSnapshot | null;
};

/** Το κάτω όριο του ιστορικού που πρέπει να διαβαστεί: min(since, ώρα στιγμιοτύπου). */
export const auditsFromFor = (since: Date, baseline: StaffSnapshot | null) => (baseline && new Date(baseline.at) < since ? new Date(baseline.at) : since);

export function classifyStaffChanges(input: StaffInput): Finding[] {
  const { since, staff, roles, baseline } = input;
  const from = input.auditsFrom ?? since;
  const audits = input.audits.filter((a) => a.createdAt >= from).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const emailOf = new Map(staff.map((s) => [s.id, s.email]));
  const roleKey = new Map(roles.map((r) => [r.id, r.key]));
  const who = (a: StaffAudit) => (a.staffId ? emailOf.get(a.staffId) ?? `άγνωστος λογαριασμός ${a.staffId}` : "άγνωστος");
  const by = (a: StaffAudit) => `${who(a)} στις ${athens(a.createdAt)}`;
  const byId = new Map(staff.map((s) => [s.id, s]));
  const baseStaff = new Map((baseline?.staff ?? []).map((s) => [s.id, s]));
  const baseRoles = new Map((baseline?.roles ?? []).map((r) => [r.key, r]));

  const newAccounts = new Map<string, Change>();
  const roleGrants = new Map<string, Change & { staffId: string; role: string }>();
  const permGrants = new Map<string, Change & { perms: Set<string>; auditedPerms: Set<string> }>();
  const grant = (k: string) => touch(permGrants, k, () => ({ ...ch(), perms: new Set<string>(), auditedPerms: new Set<string>() }));
  const newRoles = new Map<string, Change>();
  const reactivated = new Map<string, Change>();
  const other: Finding[] = [];
  const touch = <T extends Change>(m: Map<string, T>, k: string, init: () => T) => { if (!m.has(k)) m.set(k, init()); return m.get(k)!; };
  const ch = (): Change => ({ audited: [], snapshot: false });

  // 1) ιστορικό ενεργειών
  for (const a of audits) {
    const before = obj(a.before), after = obj(a.after);
    if (a.action === "staff.create" && a.entityId) {
      touch(newAccounts, a.entityId, ch).audited.push(by(a));
      for (const rid of strs(after.roleIds)) { const k = roleKey.get(rid) ?? rid; touch(roleGrants, `${a.entityId}|${k}`, () => ({ ...ch(), staffId: a.entityId!, role: k })).audited.push(by(a)); }
    } else if (a.action === "staff.update" && a.entityId) {
      for (const rid of minus(strs(after.roleIds), strs(before.roleIds))) { const k = roleKey.get(rid) ?? rid; touch(roleGrants, `${a.entityId}|${k}`, () => ({ ...ch(), staffId: a.entityId!, role: k })).audited.push(by(a)); }
      if (before.active === false && after.active === true) touch(reactivated, a.entityId, ch).audited.push(by(a));
      if (after.passwordChanged === true && a.staffId !== a.entityId) {
        const target = emailOf.get(a.entityId) ?? a.entityId;
        other.push({ severity: "warn", title: "Αλλαγή κωδικού λογαριασμού από άλλον χρήστη", detail: `Ο κωδικός του ${target} άλλαξε από ${by(a)}. Επιβεβαιώστε ότι το ζήτησε ο κάτοχος.`, evidence: `${target} (από ${who(a)})` });
      }
    } else if (a.action === "role.permissions.update") {
      const k = typeof after.key === "string" ? after.key : roleKey.get(a.entityId ?? "") ?? String(a.entityId);
      const added = minus(strs(after.permissions), strs(before.permissions));
      if (added.length) { const g = grant(k); added.forEach((p) => { g.perms.add(p); g.auditedPerms.add(p); }); g.audited.push(by(a)); }
    } else if (a.action === "role.create") {
      const k = typeof after.key === "string" ? after.key : String(a.entityId);
      touch(newRoles, k, ch).audited.push(by(a));
    } else if (a.action === "role.delete") {
      const k = typeof before.key === "string" ? before.key : String(a.entityId);
      other.push({ severity: "warn", title: "Διαγραφή ρόλου", detail: `Ο ρόλος «${k}» διαγράφηκε από ${by(a)}.`, evidence: k });
    }
  }

  // 2) νέοι λογαριασμοί από την ημερομηνία δημιουργίας + σύγκριση με το στιγμιότυπο
  for (const s of staff) {
    const b = baseStaff.get(s.id);
    if (s.createdAt >= since || (baseline && !b)) touch(newAccounts, s.id, ch).snapshot = true;
    if (!baseline) continue;
    for (const r of minus(s.roles, b?.roles ?? [])) touch(roleGrants, `${s.id}|${r}`, () => ({ ...ch(), staffId: s.id, role: r })).snapshot = true;
    if (b && !b.active && s.active) touch(reactivated, s.id, ch).snapshot = true;
  }
  if (baseline) {
    for (const r of roles) {
      const b = baseRoles.get(r.key);
      if (!b) touch(newRoles, r.key, ch).snapshot = true;
      const added = minus(r.permissions, b?.permissions ?? []);
      if (added.length) { const g = grant(r.key); added.forEach((p) => g.perms.add(p)); g.snapshot = true; }
    }
  }

  const how = (c: Change) => (c.audited.length ? `Από ${[...new Set(c.audited)].join(", ")}.` : NO_AUDIT);
  const out: Finding[] = [];
  for (const [id, c] of newAccounts) {
    const s = byId.get(id);
    const email = s?.email ?? id;
    out.push({ severity: "critical", title: "Νέος λογαριασμός διαχείρισης", detail: `${email}${s ? ` (ρόλοι: ${s.roles.join(", ") || "κανένας"}${s.active ? "" : ", ανενεργός"})` : " (δεν υπάρχει πια)"}. ${how(c)}`, evidence: email });
  }
  for (const g of roleGrants.values()) {
    if (newAccounts.has(g.staffId) && g.role !== SUPER_ADMIN) continue; // οι ρόλοι νέου λογαριασμού είναι ήδη στο εύρημά του
    const email = emailOf.get(g.staffId) ?? g.staffId;
    const sa = g.role === SUPER_ADMIN;
    out.push({ severity: sa ? "critical" : "warn", title: sa ? "Νέος super-admin" : "Νέος ρόλος σε λογαριασμό", detail: `${email} απέκτησε τον ρόλο «${g.role}»${sa ? " (πλήρης πρόσβαση, και στα μυστικά των ρυθμίσεων)" : ""}. ${how(g)}`, evidence: `${email} → ${g.role}` });
  }
  // Σοβαρότητα ανά δικαίωμα (εκτός super-admin, που έχει ήδη «*» → warn):
  //   μπαλαντέρ (* / x.*) → critical · κλειδί εκτός καταλόγου της εφαρμογής → critical «άγνωστο δικαίωμα» ·
  //   κλειδί του καταλόγου που δεν είχε ΚΑΝΕΝΑΣ ρόλος, χωρίς εγγραφή στο ιστορικό = νέο δικαίωμα από ενημέρωση → warn ·
  //   αλλιώς ευαίσθητο → critical, τα υπόλοιπα warn.
  const baseKeys = new Set((baseline?.roles ?? []).flatMap((r) => r.permissions));
  for (const [k, g] of permGrants) {
    const fresh = newRoles.get(k);
    const perms = [...g.perms].sort();
    const sa = k === SUPER_ADMIN;
    const wild = sa ? [] : perms.filter(wildcardPermission);
    const unknown = sa ? [] : perms.filter((p) => !wildcardPermission(p) && !APP_KEYS.has(p));
    const introduced = sa ? [] : perms.filter((p) => !g.auditedPerms.has(p) && !!baseline && !baseKeys.has(p) && APP_KEYS.has(p) && !wildcardPermission(p));
    const crit = sa ? [] : perms.filter((p) => wild.includes(p) || unknown.includes(p) || (sensitivePermission(p) && !introduced.includes(p)));
    const merged: Change = { audited: [...(fresh?.audited ?? []), ...g.audited], snapshot: g.snapshot || !!fresh?.snapshot };
    const title = crit.length ? (fresh ? "Νέος ρόλος με ευαίσθητα δικαιώματα" : "Ευαίσθητο δικαίωμα σε ρόλο")
      : sa ? "Νέα δικαιώματα στον super-admin"
      : introduced.length === perms.length && !fresh ? "Νέο δικαίωμα από ενημέρωση εφαρμογής"
      : fresh ? "Νέος ρόλος" : "Νέα δικαιώματα σε ρόλο";
    const what = fresh ? `Δημιουργήθηκε ο ρόλος «${k}» με: ${perms.join(", ")}` : `Ο ρόλος «${k}» πήρε: ${perms.join(", ")}`;
    const sens = crit.filter((p) => !wild.includes(p) && !unknown.includes(p));
    const notes = [
      wild.length ? `${wild.join(", ")}: μπαλαντέρ — δίνει ΟΛΑ τα δικαιώματα της ομάδας (ή όλα)` : "",
      unknown.length ? `${unknown.join(", ")}: άγνωστο δικαίωμα — δεν υπάρχει στον κατάλογο της εφαρμογής` : "",
      sens.length ? `τα ${sens.join(", ")} δίνουν έλεγχο λογαριασμών ή ρυθμίσεων` : "",
      sa ? "ο super-admin έχει ήδη πλήρη πρόσβαση («*»)" : "",
      introduced.length ? `${introduced.join(", ")}: νέο κλειδί που δεν είχε κανένας ρόλος — συνήθως νέο δικαίωμα από ενημέρωση της εφαρμογής (seed/script)` : "",
    ].filter(Boolean);
    out.push({ severity: crit.length ? "critical" : "warn", title, detail: `${what}${notes.length ? ` — ${notes.join("· ")}` : ""}. ${how(merged)}`, evidence: `${k}: ${perms.map((p) => `+${p}`).join(", ")}` });
  }
  for (const [k, c] of newRoles) {
    if (permGrants.has(k)) continue; // στο εύρημα παραπάνω, μαζί με τα δικαιώματά του
    out.push({ severity: "warn", title: "Νέος ρόλος", detail: `Δημιουργήθηκε ο ρόλος «${k}» (χωρίς δικαιώματα). ${how(c)}`, evidence: k });
  }
  for (const [id, c] of reactivated) {
    const email = emailOf.get(id) ?? id;
    out.push({ severity: "warn", title: "Επανενεργοποίηση λογαριασμού", detail: `Ο ${email} ήταν ανενεργός και ενεργοποιήθηκε ξανά. ${how(c)}`, evidence: email });
  }
  return [...out, ...other];
}

/**
 * Κατώφλι λογικής: χωρίς κανέναν ενεργό super-admin (ή χωρίς κανέναν λογαριασμό) η διαχείριση είναι κλειδωμένη ή η
 * εφαρμογή διαβάζει λάθος βάση — critical, όχι «καμία αλλαγή».
 */
export function staffFloor(staff: StaffRow[]): Finding[] {
  const sa = staff.filter((s) => s.active && s.roles.includes(SUPER_ADMIN));
  if (sa.length) return [];
  return [{ severity: "critical", title: "κανένας ενεργός super-admin — λάθος βάση ή κλείδωμα", detail: `Η βάση έχει ${staff.length} λογαριασμοί διαχείρισης (${staff.filter((s) => s.active).length} ενεργοί) και κανέναν ενεργό super-admin. Είτε η εφαρμογή διαβάζει λάθος βάση, είτε κάποιος απενεργοποίησε / αφαίρεσε όλους τους super-admin (κλείδωμα της διαχείρισης).`, evidence: "staff: κανένας ενεργός super-admin" }];
}

export function staffSummary(input: StaffInput): string {
  const { since, staff, roles, baseline } = input;
  const active = staff.filter((s) => s.active);
  const sa = active.filter((s) => s.roles.includes(SUPER_ADMIN)).map((s) => s.email).sort();
  const from = input.auditsFrom ?? since;
  const acts = input.audits.filter((a) => a.createdAt >= from).length;
  return [
    `${staff.length} λογαριασμοί (${active.length} ενεργοί)`,
    `ενεργοί super-admin: ${sa.join(", ") || "κανένας"}`,
    `${roles.length} ρόλοι`,
    `${acts} ενέργειες staff/ρόλων στο ιστορικό από ${athens(from)}`,
    baseline
      ? `σύγκριση λογαριασμών/ρόλων/δικαιωμάτων με το στιγμιότυπο της ${athens(new Date(baseline.at))}`
      : "χωρίς προηγούμενο στιγμιότυπο — έλεγχος μόνο από το ιστορικό ενεργειών και την ημερομηνία δημιουργίας (η σύγκριση ξεκινά από αυτόν τον έλεγχο)",
  ].join(" · ");
}
