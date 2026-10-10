import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";

/**
 * Γύρω από ένα CMS έγγραφο με πρόχειρο/δημοσίευση (αρχική, σελίδα μάρκας): σενάρια (ονομασμένα στιγμιότυπα,
 * προαιρετικά με ώρα δημοσίευσης), αίτημα έγκρισης από όσους δεν δημοσιεύουν, ιστορικό δημοσιεύσεων (από το audit)
 * και σύνδεσμος προεπισκόπησης του πρόχειρου για όποιον δεν έχει λογαριασμό.
 */
export interface PlanTarget<T> {
  /** το έγγραφο (CmsDocument) */
  collection: string; key: string;
  /** πού φυλάσσονται τα σενάρια / το αίτημα έγκρισης */
  plansCollection: string; plansKey: string;
  /** audit της δημοσίευσης (το ίδιο που γράφει η χειροκίνητη δημοσίευση — από εκεί το ιστορικό) */
  publishAction: string; entityId: string;
  normalize: (raw: unknown) => T;
  /** εμβέλεια του συνδέσμου προεπισκόπησης (π.χ. "home", "brand:lg") */
  scope: string;
}

export interface Scenario<T> {
  id: string; name: string; doc: T;
  createdAt: string; by: string; byName: string;
  /** ώρα αυτόματης δημοσίευσης· null = απλώς αποθηκευμένο */
  publishAt: string | null;
  status: "saved" | "scheduled" | "published" | "failed";
  publishedAt?: string; note?: string;
}
export interface Review { by: string; byName: string; at: string; note: string; changes: number }
export interface Plans<T> { scenarios: Scenario<T>[]; review: Review | null }
export interface PublishEntry<T> { id: string; at: string; by: string | null; doc: T }

const W = (collection: string, key: string) => ({ collection_key_locale: { collection, key, locale: "el" } });

export async function getPlans<T>(t: PlanTarget<T>): Promise<Plans<T>> {
  const d = await db.cmsDocument.findUnique({ where: W(t.plansCollection, t.plansKey), select: { data: true } }).catch(() => null);
  const o = (d?.data ?? {}) as Partial<Plans<unknown>>;
  return { scenarios: Array.isArray(o.scenarios) ? o.scenarios.map((s) => ({ ...s, doc: t.normalize(s.doc) })) : [], review: o.review ?? null };
}
async function putPlans<T>(t: PlanTarget<T>, p: Plans<T>, by: string | null) {
  const data = p as unknown as Prisma.InputJsonValue;
  await db.cmsDocument.upsert({ where: W(t.plansCollection, t.plansKey), update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: t.plansCollection, key: t.plansKey, locale: "el", data, updatedBy: by } });
}
export async function updatePlans<T>(t: PlanTarget<T>, by: string, fn: (p: Plans<T>) => Plans<T>) { const p = await getPlans(t); const n = fn(p); await putPlans(t, n, by); return n; }

export const newScenario = <T>(t: PlanTarget<T>, name: string, doc: T, by: string, byName: string, publishAt: string | null = null): Scenario<T> =>
  ({ id: randomUUID(), name: name.trim().slice(0, 80) || "Χωρίς όνομα", doc: t.normalize(doc), createdAt: new Date().toISOString(), by, byName, publishAt, status: publishAt ? "scheduled" : "saved" });

/* ---------------- αυτόματη δημοσίευση ---------------- */
const lastCheck = new Map<string, number>();
/**
 * Δημοσιεύει όσα σενάρια έφτασε η ώρα τους (το πιο πρόσφατο κερδίζει). Καλείται από το cron και — το πολύ μία φορά
 * ανά 30″ ανά έγγραφο — από την ίδια τη σελίδα, ώστε η δημοσίευση να γίνεται στην ώρα της ακόμη κι αν το cron αργήσει.
 * Επιστρέφει true αν άλλαξε η δημοσιευμένη έκδοση.
 */
export async function runDueScenarios<T>(t: PlanTarget<T>, opts: { force?: boolean } = {}): Promise<boolean> {
  const now = Date.now();
  if (!opts.force && now - (lastCheck.get(t.scope) ?? 0) < 30_000) return false;
  lastCheck.set(t.scope, now);
  const p = await getPlans(t).catch(() => null);
  const due = (p?.scenarios ?? []).filter((s) => s.status === "scheduled" && s.publishAt && Date.parse(s.publishAt) <= now).sort((a, b) => Date.parse(a.publishAt!) - Date.parse(b.publishAt!));
  if (!due.length) return false;
  const win = due[due.length - 1];
  const data = win.doc as unknown as Prisma.InputJsonValue;
  // και το πρόχειρο γίνεται το νέο σενάριο μόνο αν δεν είχε δικές του αλλαγές (ίδιο με τη δημοσιευμένη)
  const doc = await db.cmsDocument.findUnique({ where: W(t.collection, t.key), select: { data: true, published: true } });
  const draftClean = !doc?.data || JSON.stringify(doc.data) === JSON.stringify(doc.published);
  await db.cmsDocument.upsert({
    where: W(t.collection, t.key),
    update: { published: data, publishedAt: new Date(), updatedBy: win.by, ...(draftClean ? { data } : {}) },
    create: { collection: t.collection, key: t.key, locale: "el", data, published: data, publishedAt: new Date(), updatedBy: win.by },
  });
  await audit(win.by, t.publishAction, "CmsDocument", t.entityId, doc?.published ?? null, win.doc);
  const at = new Date().toISOString();
  await putPlans(t, {
    ...p!,
    scenarios: p!.scenarios.map((s) => (s.id === win.id ? { ...s, status: "published", publishedAt: at } : due.some((d) => d.id === s.id) ? { ...s, status: "failed", note: `Παραλείφθηκε: δημοσιεύτηκε στη θέση του το «${win.name}».` } : s)),
  }, win.by);
  return true;
}

/* ---------------- ιστορικό ---------------- */
export async function publishHistory<T>(t: PlanTarget<T>, limit = 30): Promise<PublishEntry<T>[]> {
  const rows = await db.auditLog.findMany({
    where: { action: t.publishAction, entityId: t.entityId }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, after: true, staff: { select: { name: true, email: true } } },
  });
  return rows.filter((r) => r.after).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), by: r.staff?.name || r.staff?.email || null, doc: t.normalize(r.after) }));
}

/* ---------------- σύνδεσμος προεπισκόπησης ---------------- */
const secret = () => process.env.SETTINGS_KEY || process.env.AUTH_SECRET || "dev-only";
const sign = (scope: string, exp: number) => createHmac("sha256", secret()).update(`preview|${scope}|${exp}`).digest("base64url").slice(0, 32);
/** Token «λήξη.υπογραφή» για μία σελίδα — όποιος έχει τον σύνδεσμο βλέπει το τρέχον πρόχειρο μέχρι τη λήξη (χωρίς λογαριασμό). */
export function previewToken(scope: string, days = 7) { const exp = Math.floor(Date.now() / 1000) + days * 86400; return { token: `${exp}.${sign(scope, exp)}`, expires: new Date(exp * 1000).toISOString() }; }
export function previewTokenOk(token: unknown, scope: string): boolean {
  if (typeof token !== "string") return false;
  const [e, s] = token.split(".");
  const exp = Number(e);
  if (!exp || !s || exp * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(scope, exp)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}
