"use server";

import { headers } from "next/headers";
import { hasPermission, requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import * as P from "@/lib/cms/doc-plans";
import { HOME_TARGET } from "@/lib/cms/home-plans";
import { brandTarget } from "@/lib/cms/brand-plans";
import { getStoreDoc } from "@/lib/cms/brand-stores";

/**
 * Σενάρια, προγραμματισμός, ιστορικό, έγκριση και σύνδεσμος προεπισκόπησης — κοινά για την αρχική και τις σελίδες
 * μαρκών. Κάθε σελίδα έχει τα δικά της δικαιώματα (ανάγνωση / επεξεργασία / δημοσίευση).
 */
export type PlanRef = { kind: "home" } | { kind: "brand"; slug: string };
type Res = { ok: boolean; message: string };

async function resolve(ref: PlanRef) {
  if (ref.kind === "home") return { target: HOME_TARGET as P.PlanTarget<unknown>, read: "cms.zones.read", write: "cms.zones.write", publish: "cms.zones.publish", act: "cms.home", path: "/", where: "τις Ζώνες αρχικής" };
  if (!/^[a-z0-9-]{1,80}$/.test(ref.slug) || !(await getStoreDoc(ref.slug))) throw new Error("Άγνωστη σελίδα μάρκας.");
  return { target: brandTarget(ref.slug) as P.PlanTarget<unknown>, read: "cms.brandstores.write", write: "cms.brandstores.write", publish: "cms.publish", act: "cms.brandstore", path: `/brands/${ref.slug}`, where: "τη σελίδα της μάρκας στη διαχείριση" };
}
const future = (iso: string | null | undefined) => !!iso && !Number.isNaN(Date.parse(iso)) && Date.parse(iso) > Date.now() + 30_000;
const plansId = (t: P.PlanTarget<unknown>) => `${t.plansCollection}/${t.plansKey}`;

export async function plansAction(ref: PlanRef) {
  const r = await resolve(ref); await requirePermission(r.read);
  return P.getPlans(r.target);
}

export async function historyAction(ref: PlanRef) {
  const r = await resolve(ref); await requirePermission(r.read);
  return P.publishHistory(r.target, 30);
}

/** Νέο σενάριο από το πρόχειρο· με `publishAt` προγραμματίζεται (χρειάζεται δικαίωμα δημοσίευσης). */
export async function saveScenarioAction(ref: PlanRef, name: string, doc: unknown, publishAt: string | null = null): Promise<Res> {
  const r = await resolve(ref);
  const user = await requirePermission(publishAt ? r.publish : r.write);
  if (publishAt && !future(publishAt)) return { ok: false, message: "Διάλεξε ώρα στο μέλλον." };
  const sc = P.newScenario(r.target, name, doc, user.id, user.name ?? user.email ?? "", publishAt);
  await P.updatePlans(r.target, user.id, (p) => ({ ...p, scenarios: [sc, ...p.scenarios].slice(0, 40) }));
  await audit(user.id, publishAt ? `${r.act}.schedule` : `${r.act}.scenario`, "CmsDocument", plansId(r.target), null, { id: sc.id, name: sc.name, publishAt });
  return { ok: true, message: publishAt ? `Προγραμματίστηκε: «${sc.name}» δημοσιεύεται ${new Date(publishAt).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" })}.` : `Αποθηκεύτηκε το σενάριο «${sc.name}».` };
}

export async function scheduleScenarioAction(ref: PlanRef, id: string, publishAt: string | null): Promise<Res> {
  const r = await resolve(ref);
  const user = await requirePermission(r.publish);
  if (publishAt && !future(publishAt)) return { ok: false, message: "Διάλεξε ώρα στο μέλλον." };
  await P.updatePlans(r.target, user.id, (p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === id ? { ...s, publishAt, status: publishAt ? "scheduled" : "saved", note: undefined } : s)) }));
  await audit(user.id, `${r.act}.schedule`, "CmsDocument", plansId(r.target), null, { id, publishAt });
  return { ok: true, message: publishAt ? "Προγραμματίστηκε." : "Ο προγραμματισμός ακυρώθηκε — το σενάριο έμεινε αποθηκευμένο." };
}

export async function deleteScenarioAction(ref: PlanRef, id: string): Promise<Res> {
  const r = await resolve(ref);
  const user = await requirePermission(r.write);
  const sc = (await P.getPlans(r.target)).scenarios.find((s) => s.id === id);
  if (sc?.status === "scheduled" && !hasPermission(user, r.publish)) return { ok: false, message: "Ένα προγραμματισμένο σενάριο το σβήνει όποιος έχει δικαίωμα δημοσίευσης." };
  await P.updatePlans(r.target, user.id, (x) => ({ ...x, scenarios: x.scenarios.filter((s) => s.id !== id) }));
  await audit(user.id, `${r.act}.scenario.delete`, "CmsDocument", plansId(r.target), sc ? { id, name: sc.name } : null, null);
  return { ok: true, message: "Το σενάριο διαγράφηκε." };
}

/** Αίτημα έγκρισης: όποιος αλλάζει χωρίς δικαίωμα δημοσίευσης ειδοποιεί όσους δημοσιεύουν (μέσα στη διαχείριση). */
export async function submitReviewAction(ref: PlanRef, note: string, changes: number): Promise<Res> {
  const r = await resolve(ref);
  const user = await requirePermission(r.write);
  await P.updatePlans(r.target, user.id, (p) => ({ ...p, review: { by: user.id, byName: user.name ?? user.email ?? "", at: new Date().toISOString(), note: note.trim().slice(0, 500), changes } }));
  await audit(user.id, `${r.act}.review`, "CmsDocument", plansId(r.target), null, { note, changes });
  return { ok: true, message: `Στάλθηκε για έγκριση — όσοι δημοσιεύουν το βλέπουν μόλις ανοίξουν ${r.where}.` };
}

export async function clearReviewAction(ref: PlanRef, reason: "rejected" | "withdrawn"): Promise<Res> {
  const r = await resolve(ref);
  const user = await requirePermission(reason === "rejected" ? r.publish : r.write);
  await P.updatePlans(r.target, user.id, (p) => ({ ...p, review: null }));
  await audit(user.id, `${r.act}.review.${reason}`, "CmsDocument", plansId(r.target), null, null);
  return { ok: true, message: reason === "rejected" ? "Το αίτημα απορρίφθηκε — το πρόχειρο έμεινε ως έχει." : "Το αίτημα ανακλήθηκε." };
}

/** Σύνδεσμος προεπισκόπησης του πρόχειρου (7 ημέρες), για κινητό ή για συνάδελφο χωρίς λογαριασμό. */
export async function previewLinkAction(ref: PlanRef): Promise<{ url: string; expires: string }> {
  const r = await resolve(ref);
  const user = await requirePermission(r.read);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const { token, expires } = P.previewToken(r.target.scope, 7);
  await audit(user.id, `${r.act}.preview-link`, "CmsDocument", r.target.entityId, null, { expires });
  return { url: `${proto}://${host}${r.path}?pt=${token}`, expires };
}
