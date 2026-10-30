"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { parseKey } from "@/lib/softone/category-core";
import { changeGroupHead, changeL2, createGroup, saveL1, type WriteOutcome } from "@/lib/softone/category-write";
import { cancelOp, listOps, previewMove, retryOp, startMove } from "@/lib/catalog/category-ops";
import { erpCodeOf } from "@/lib/catalog/category-admin";

const PATH = "/admin/catalog/categories";
// Εγγραφή στο SoftOne: όπως στα χαρακτηριστικά, χρειάζονται και τα δύο δικαιώματα
const erpUser = () => requirePermission("catalog.sync.run").then(async (u) => { await requirePermission("catalog.products.write"); return u; });

/** Το κατάστημα ακολουθεί σε λίγα δευτερόλεπτα (μετά την απάντηση), για να μη περιμένει ο χρήστης όλη την προβολή. */
const refreshShop = () => after(async () => {
  const [{ projectCatalog }, { resetCatalogCache }] = await Promise.all([import("@/lib/softone/project"), import("@/lib/data/db-catalog")]);
  await projectCatalog("manual");
  resetCatalogCache();
});

const kick = () => after(async () => { const { runJob } = await import("@/lib/scheduler"); await runJob("category-ops", "manual"); });

export async function saveNodeAction(key: string, patch: { name?: string; active?: boolean }): Promise<WriteOutcome> {
  const user = await erpUser();
  const k = parseKey(key);
  if (!k) return { ok: false, error: "Άγνωστη κατηγορία." };
  const r = k.level === 1 ? await saveL1({ c1: k.c1, ...patch })
    : k.level === 2 ? await changeL2({ kind: "set", c1: k.c1, c2: k.c2, patch })
    : await changeGroupHead(k.g, patch);
  await audit(user.id, "category.save", "Category", key, null, { patch, ok: r.ok, error: r.ok ? undefined : r.error });
  if (r.ok) { refreshShop(); revalidatePath(PATH); }
  return r.ok ? { ...r, message: `${r.message} Το κατάστημα ενημερώνεται σε λίγα δευτερόλεπτα.` } : r;
}

/** Νέα κατηγορία: χωρίς γονέα = κεντρική, κάτω από κεντρική = κατηγορία, κάτω από κατηγορία = τύπος προϊόντος. */
export async function addNodeAction(parentKey: string | null, name: string): Promise<WriteOutcome> {
  const user = await erpUser();
  const p = parentKey ? parseKey(parentKey) : null;
  if (parentKey && !p) return { ok: false, error: "Άγνωστη κατηγορία." };
  if (p?.level === 3) return { ok: false, error: "Ο τύπος προϊόντος είναι το τελευταίο επίπεδο — δεν έχει υποκατηγορίες." };
  const r = !p ? await saveL1({ name }) : p.level === 1 ? await changeL2({ kind: "add", c1: p.c1, name }) : await createGroup({ c1: p.c1, c2: p.c2, name });
  await audit(user.id, "category.add", "Category", parentKey ?? "root", null, { name, ok: r.ok, key: r.ok ? r.key : undefined, error: r.ok ? undefined : r.error });
  if (r.ok) { refreshShop(); revalidatePath(PATH); }
  return r.ok ? { ...r, message: `${r.message} Θα φανεί στο κατάστημα μόλις αποκτήσει ενεργά προϊόντα.` } : r;
}

export async function previewMoveAction(nodeKey: string, parentKey: string) {
  await requirePermission("catalog.products.read");
  return previewMove(nodeKey, parentKey);
}

export async function startMoveAction(nodeKey: string, parentKey: string) {
  const user = await erpUser();
  const r = await startMove(nodeKey, parentKey, user.id);
  await audit(user.id, "category.move", "Category", nodeKey, null, { to: parentKey, ...r });
  if (r.ok) kick();
  revalidatePath(PATH);
  return r;
}

/** Σειρά μέσα στον ίδιο γονέα: μόνο στο κατάστημα (το SoftOne δεν έχει πεδίο σειράς) — άμεσα, χωρίς διακόπτη. */
export async function reorderAction(keys: string[]) {
  const user = await requirePermission("catalog.products.write");
  const codes = keys.map(erpCodeOf);
  const found = await db.category.findMany({ where: { erpCode: { in: codes } }, select: { erpCode: true } });
  if (found.length !== codes.length) return { ok: false, error: "Κάποιες κατηγορίες δεν έχουν ακόμη αντίστοιχη στο κατάστημα — τρέξε πρώτα «Προβολή στο κατάστημα»." };
  await db.$transaction(codes.map((erpCode, i) => db.category.update({ where: { erpCode }, data: { sortManual: (i + 1) * 10, sortNo: (i + 1) * 10 } })));
  (await import("@/lib/data/db-catalog")).resetCatalogCache();
  await audit(user.id, "category.reorder", "Category", keys[0] ?? "", null, { keys });
  revalidatePath(PATH);
  return { ok: true, message: "Η νέα σειρά ισχύει ήδη στο κατάστημα (μενού και λίστες)." };
}

export async function opsAction() {
  await requirePermission("catalog.products.read");
  return (await listOps()).map((o) => ({ id: o.id, title: o.title, status: o.status, total: o.mtrls.length, cursor: o.cursor, okCount: o.okCount, failures: (o.failures as { mtrl: number; code?: string; error: string }[]).slice(0, 50), failCount: (o.failures as unknown[]).length, log: (o.log as { at: string; ok: boolean; text: string }[]).slice(-12), error: o.error, createdAt: o.createdAt.toISOString(), finishedAt: o.finishedAt?.toISOString() ?? null }));
}

export async function opControlAction(id: string, what: "retry" | "cancel" | "resume") {
  const user = await erpUser();
  // «Συνέχεια τώρα» σε αλλαγή που ήδη τρέχει/περιμένει: απλώς ξυπνά τον εκτελεστή (το lock αποκλείει διπλό τρέξιμο)
  const op = await db.categoryOp.findUnique({ where: { id }, select: { status: true } });
  const r = what === "cancel" ? await cancelOp(id) : what === "resume" && op && op.status !== "failed" ? { ok: true } : await retryOp(id);
  await audit(user.id, `category.op.${what}`, "CategoryOp", id, null, r);
  if (r.ok && what !== "cancel") kick();
  revalidatePath(PATH);
  return r;
}
