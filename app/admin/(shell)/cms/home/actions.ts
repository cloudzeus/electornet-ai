"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { hasPermission, requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { getHomeDoc, publishHome, revertHome, saveHomeDraft } from "@/lib/cms/home-store";
import { normalizeHomeDoc, type HomeDoc } from "@/lib/cms/home-sections";
import { homeHealth, type HomeHealth } from "@/lib/cms/home-health";
import { getPlans, newScenario, previewToken, publishHistory, updatePlans, type HomePublish } from "@/lib/cms/home-plans";

export async function saveHomeAction(doc: HomeDoc): Promise<{ ok: boolean; at?: string; message?: string }> {
  const user = await requirePermission("cms.zones.write");
  const r = await saveHomeDraft(normalizeHomeDoc(doc), user.id);
  return { ok: true, at: r.updatedAt.toISOString() };
}

export async function publishHomeAction(): Promise<{ ok: boolean; message: string; errors?: Issue[] }> {
  const user = await requirePermission("cms.zones.publish");
  const doc = await getHomeDoc();
  const { errors } = checkBlocks(doc.draft.blocks);
  if (errors.length) return { ok: false, message: "Διόρθωσε τα παρακάτω πριν τη δημοσίευση.", errors };
  await saveHomeDraft(doc.draft, user.id); // ώστε να υπάρχει πρόχειρο ακόμη κι αν δημοσιεύεται η προεπιλογή
  await publishHome(user.id);
  await updatePlans(user.id, (p) => (p.review ? { ...p, review: null } : p)).catch(() => null);
  await audit(user.id, "cms.home.publish", "CmsDocument", "home.layout/home", doc.published, doc.draft);
  revalidatePath("/");
  return { ok: true, message: "Δημοσιεύτηκε — οι επισκέπτες βλέπουν τώρα τη νέα αρχική." };
}

export async function revertHomeAction() {
  const user = await requirePermission("cms.zones.write");
  await revertHome(user.id);
  await audit(user.id, "cms.home.revert", "CmsDocument", "home.layout/home", null, null);
  return { ok: true, message: "Το πρόχειρο επέστρεψε στη δημοσιευμένη έκδοση." };
}

/* ---------------- υγεία, ιστορικό, σενάρια, έγκριση, σύνδεσμος προεπισκόπησης ---------------- */

/** Ποιες ενότητες βγαίνουν κενές τώρα + έλεγχοι πριν τη δημοσίευση (για το πρόχειρο που βλέπει ο editor). */
export async function homeHealthAction(doc: HomeDoc): Promise<HomeHealth> {
  await requirePermission("cms.zones.read");
  return homeHealth(normalizeHomeDoc(doc));
}

export async function homeHistoryAction(): Promise<HomePublish[]> {
  await requirePermission("cms.zones.read");
  return publishHistory(30);
}

export async function homePlansAction() {
  await requirePermission("cms.zones.read");
  return getPlans();
}

const future = (iso: string | null | undefined) => !!iso && !Number.isNaN(Date.parse(iso)) && Date.parse(iso) > Date.now() + 30_000;

/** Νέο σενάριο από το πρόχειρο· με `publishAt` προγραμματίζεται (χρειάζεται δικαίωμα δημοσίευσης). */
export async function saveScenarioAction(name: string, doc: HomeDoc, publishAt: string | null = null): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission(publishAt ? "cms.zones.publish" : "cms.zones.write");
  if (publishAt && !future(publishAt)) return { ok: false, message: "Διάλεξε ώρα στο μέλλον." };
  const sc = newScenario(name, doc, user.id, user.name ?? user.email ?? "", publishAt);
  await updatePlans(user.id, (p) => ({ ...p, scenarios: [sc, ...p.scenarios].slice(0, 40) }));
  await audit(user.id, publishAt ? "cms.home.schedule" : "cms.home.scenario", "CmsDocument", "home.layout/plans", null, { id: sc.id, name: sc.name, publishAt });
  return { ok: true, message: publishAt ? `Προγραμματίστηκε: «${sc.name}» δημοσιεύεται ${new Date(publishAt).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" })}.` : `Αποθηκεύτηκε το σενάριο «${sc.name}».` };
}

export async function scheduleScenarioAction(id: string, publishAt: string | null): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("cms.zones.publish");
  if (publishAt && !future(publishAt)) return { ok: false, message: "Διάλεξε ώρα στο μέλλον." };
  await updatePlans(user.id, (p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === id ? { ...s, publishAt, status: publishAt ? "scheduled" : "saved", note: undefined } : s)) }));
  await audit(user.id, "cms.home.schedule", "CmsDocument", "home.layout/plans", null, { id, publishAt });
  return { ok: true, message: publishAt ? "Προγραμματίστηκε." : "Ο προγραμματισμός ακυρώθηκε — το σενάριο έμεινε αποθηκευμένο." };
}

export async function deleteScenarioAction(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("cms.zones.write");
  const p = await getPlans();
  const sc = p.scenarios.find((s) => s.id === id);
  if (sc?.status === "scheduled" && !hasPermission(user, "cms.zones.publish")) return { ok: false, message: "Ένα προγραμματισμένο σενάριο το σβήνει όποιος έχει δικαίωμα δημοσίευσης." };
  await updatePlans(user.id, (x) => ({ ...x, scenarios: x.scenarios.filter((s) => s.id !== id) }));
  await audit(user.id, "cms.home.scenario.delete", "CmsDocument", "home.layout/plans", sc ? { id, name: sc.name } : null, null);
  return { ok: true, message: "Το σενάριο διαγράφηκε." };
}

/** Αίτημα έγκρισης: όποιος αλλάζει την αρχική χωρίς δικαίωμα δημοσίευσης ειδοποιεί όσους δημοσιεύουν (μέσα στη διαχείριση). */
export async function submitReviewAction(note: string, changes: number): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("cms.zones.write");
  await updatePlans(user.id, (p) => ({ ...p, review: { by: user.id, byName: user.name ?? user.email ?? "", at: new Date().toISOString(), note: note.trim().slice(0, 500), changes } }));
  await audit(user.id, "cms.home.review", "CmsDocument", "home.layout/plans", null, { note, changes });
  return { ok: true, message: "Στάλθηκε για έγκριση — όσοι δημοσιεύουν το βλέπουν μόλις ανοίξουν τις Ζώνες αρχικής." };
}

export async function clearReviewAction(reason: "rejected" | "withdrawn"): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission(reason === "rejected" ? "cms.zones.publish" : "cms.zones.write");
  await updatePlans(user.id, (p) => ({ ...p, review: null }));
  await audit(user.id, `cms.home.review.${reason}`, "CmsDocument", "home.layout/plans", null, null);
  return { ok: true, message: reason === "rejected" ? "Το αίτημα απορρίφθηκε — το πρόχειρο έμεινε ως έχει." : "Το αίτημα ανακλήθηκε." };
}

/** Σύνδεσμος προεπισκόπησης του πρόχειρου (7 ημέρες), για κινητό ή για συνάδελφο χωρίς λογαριασμό. */
export async function previewLinkAction(): Promise<{ url: string; expires: string }> {
  const user = await requirePermission("cms.zones.read");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const { token, expires } = previewToken(7);
  await audit(user.id, "cms.home.preview-link", "CmsDocument", "home.layout/home", null, { expires });
  return { url: `${proto}://${host}/?pt=${token}`, expires };
}
