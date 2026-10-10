import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { normalizeHomeDoc, type HomeDoc } from "./home-sections";

/**
 * Γύρω από την αρχική (CmsDocument «home.layout»/«plans»): σενάρια (ονομασμένα στιγμιότυπα, προαιρετικά με ώρα
 * δημοσίευσης), αίτημα έγκρισης από όσους δεν δημοσιεύουν, ιστορικό δημοσιεύσεων (από το audit) και
 * σύνδεσμος προεπισκόπησης του πρόχειρου για όποιον δεν έχει λογαριασμό.
 */
const COLLECTION = "home.layout";
const W = (key: string) => ({ collection_key_locale: { collection: COLLECTION, key, locale: "el" } });

export interface HomeScenario {
  id: string; name: string; doc: HomeDoc;
  createdAt: string; by: string; byName: string;
  /** ώρα αυτόματης δημοσίευσης· null = απλώς αποθηκευμένο */
  publishAt: string | null;
  status: "saved" | "scheduled" | "published" | "failed";
  publishedAt?: string; note?: string;
}
export interface HomeReview { by: string; byName: string; at: string; note: string; changes: number }
interface Plans { scenarios: HomeScenario[]; review: HomeReview | null }

export async function getPlans(): Promise<Plans> {
  const d = await db.cmsDocument.findUnique({ where: W("plans"), select: { data: true } }).catch(() => null);
  const o = (d?.data ?? {}) as Partial<Plans>;
  return { scenarios: Array.isArray(o.scenarios) ? o.scenarios.map((s) => ({ ...s, doc: normalizeHomeDoc(s.doc) })) : [], review: o.review ?? null };
}
async function putPlans(p: Plans, by: string | null) {
  const data = p as unknown as Prisma.InputJsonValue;
  await db.cmsDocument.upsert({ where: W("plans"), update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: COLLECTION, key: "plans", locale: "el", data, updatedBy: by } });
}
export async function updatePlans(by: string, fn: (p: Plans) => Plans) { const p = await getPlans(); const n = fn(p); await putPlans(n, by); return n; }

export const newScenario = (name: string, doc: HomeDoc, by: string, byName: string, publishAt: string | null = null): HomeScenario =>
  ({ id: randomUUID(), name: name.trim().slice(0, 80) || "Χωρίς όνομα", doc: normalizeHomeDoc(doc), createdAt: new Date().toISOString(), by, byName, publishAt, status: publishAt ? "scheduled" : "saved" });

/* ---------------- αυτόματη δημοσίευση ---------------- */
let lastCheck = 0;
/**
 * Δημοσιεύει όσα σενάρια έφτασε η ώρα τους (το πιο πρόσφατο κερδίζει). Καλείται από το cron και — το πολύ μία φορά
 * ανά 30″ — από την ίδια την αρχική, ώστε η δημοσίευση να γίνεται στην ώρα της ακόμη κι αν το cron αργήσει.
 * Επιστρέφει true αν άλλαξε η δημοσιευμένη αρχική.
 */
export async function runDueScenarios(opts: { force?: boolean } = {}): Promise<boolean> {
  const now = Date.now();
  if (!opts.force && now - lastCheck < 30_000) return false;
  lastCheck = now;
  const p = await getPlans().catch(() => null);
  const due = (p?.scenarios ?? []).filter((s) => s.status === "scheduled" && s.publishAt && Date.parse(s.publishAt) <= now).sort((a, b) => Date.parse(a.publishAt!) - Date.parse(b.publishAt!));
  if (!due.length) return false;
  const win = due[due.length - 1];
  const data = win.doc as unknown as Prisma.InputJsonValue;
  // και το πρόχειρο γίνεται το νέο σενάριο μόνο αν δεν είχε δικές του αλλαγές (ίδιο με τη δημοσιευμένη)
  const doc = await db.cmsDocument.findUnique({ where: W("home"), select: { data: true, published: true } });
  const draftClean = !doc?.data || JSON.stringify(doc.data) === JSON.stringify(doc.published);
  await db.cmsDocument.upsert({
    where: W("home"),
    update: { published: data, publishedAt: new Date(), updatedBy: win.by, ...(draftClean ? { data } : {}) },
    create: { collection: COLLECTION, key: "home", locale: "el", data, published: data, publishedAt: new Date(), updatedBy: win.by },
  });
  await audit(win.by, "cms.home.publish", "CmsDocument", "home.layout/home", doc?.published ?? null, win.doc);
  const at = new Date().toISOString();
  await putPlans({
    ...p!,
    scenarios: p!.scenarios.map((s) => (s.id === win.id ? { ...s, status: "published", publishedAt: at } : due.some((d) => d.id === s.id) ? { ...s, status: "failed", note: `Παραλείφθηκε: δημοσιεύτηκε στη θέση του το «${win.name}».` } : s)),
  }, win.by);
  return true;
}

/* ---------------- ιστορικό ---------------- */
export interface HomePublish { id: string; at: string; by: string | null; doc: HomeDoc }
export async function publishHistory(limit = 30): Promise<HomePublish[]> {
  const rows = await db.auditLog.findMany({
    where: { action: "cms.home.publish", entityId: "home.layout/home" }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, after: true, staff: { select: { name: true, email: true } } },
  });
  return rows.filter((r) => r.after).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), by: r.staff?.name || r.staff?.email || null, doc: normalizeHomeDoc(r.after) }));
}

/* ---------------- σύνδεσμος προεπισκόπησης ---------------- */
const secret = () => process.env.SETTINGS_KEY || process.env.AUTH_SECRET || "dev-only";
const sign = (exp: number) => createHmac("sha256", secret()).update(`home-preview|${exp}`).digest("base64url").slice(0, 32);
/** Token «λήξη.υπογραφή» — όποιος έχει τον σύνδεσμο βλέπει το τρέχον πρόχειρο μέχρι τη λήξη (χωρίς λογαριασμό). */
export function previewToken(days = 7) { const exp = Math.floor(Date.now() / 1000) + days * 86400; return { token: `${exp}.${sign(exp)}`, expires: new Date(exp * 1000).toISOString() }; }
export function previewTokenOk(t: unknown): boolean {
  if (typeof t !== "string") return false;
  const [e, s] = t.split(".");
  const exp = Number(e);
  if (!exp || !s || exp * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(exp)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}
