import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { categoriesWriteEnabled, changeGroupHead, changeL2, setItemWebCats, WRITE_OFF } from "@/lib/softone/category-write";
import { moveAllowed, parseKey } from "@/lib/softone/category-core";

/**
 * Μετακινήσεις στο δέντρο κατηγοριών = αλλαγή δομής στο SoftOne + ενημέρωση ΚΑΘΕ είδους της κατηγορίας.
 * Τρέχουν σε κομμάτια (CategoryOp): η θέση (`cursor`) σώζεται μετά από κάθε είδος, οπότε μια διακοπή
 * (deploy, πτώση server, σφάλμα δικτύου) συνεχίζει από εκεί που έμεινε — αυτόματα από τον scheduler
 * (εργασία «category-ops», κάθε λεπτό) ή με το «Συνέχεια» στη σελίδα. Ένα είδος που ήδη άλλαξε προσπερνιέται.
 */
type L2Payload = { from: { c1: number; c2: number }; to: { c1: number; c2?: number }; name: string; groups: number[]; groupsDone: number[]; oldDeactivated?: boolean };
type L3Payload = { g: number; from: { c1: number; c2: number }; to: { c1: number; c2: number }; name: string; headDone?: boolean };
type LogLine = { at: string; ok: boolean; text: string };
type Failure = { mtrl: number; code?: string; error: string };

export interface MovePreview { ok: boolean; error?: string; title?: string; items?: number; groups?: number; notes?: string[] }

async function describeNode(key: string) {
  const k = parseKey(key);
  if (!k) return null;
  if (k.level === 1) { const c = await db.s1WebCategory.findUnique({ where: { key: `1:${k.c1}` } }); return c ? { k, name: c.name } : null; }
  if (k.level === 2) { const c = await db.s1WebCategory.findUnique({ where: { key: `2:${k.c1}:${k.c2}` } }); return c ? { k, name: c.name } : null; }
  const g = await db.s1SpecGroup.findUnique({ where: { s1Id: k.g } });
  return g ? { k, name: g.name, c1: g.cat1, c2: g.cat2 } : null;
}

/** Τι θα γίνει αν το `nodeKey` μπει κάτω από το `parentKey` — χωρίς να αγγίξει τίποτα. */
export async function previewMove(nodeKey: string, parentKey: string): Promise<MovePreview> {
  const [node, parent] = await Promise.all([describeNode(nodeKey), describeNode(parentKey)]);
  if (!node || !parent) return { ok: false, error: "Η κατηγορία δεν βρέθηκε — ανανέωσε τη σελίδα." };
  const bad = moveAllowed(node.k, parent.k);
  if (bad) return { ok: false, error: bad };
  if (node.k.level === 3 && parent.k.level === 2 && "c2" in node && node.c1 === parent.k.c1 && node.c2 === parent.k.c2) return { ok: false, error: "Ο τύπος προϊόντος είναι ήδη εκεί." };
  const busy = await db.categoryOp.count({ where: { status: { in: ["queued", "running"] } } });
  const notes: string[] = [];
  if (busy) notes.push("Υπάρχει ήδη αλλαγή σε εξέλιξη· αυτή θα ξεκινήσει μόλις τελειώσει εκείνη.");
  if (node.k.level === 2) {
    const [items, groups] = await Promise.all([
      db.s1Item.count({ where: { webCat1: node.k.c1, webCat2: node.k.c2, missing: false } }),
      db.s1SpecGroup.count({ where: { cat1: node.k.c1, cat2: node.k.c2 } }),
    ]);
    notes.push("Στο SoftOne μπαίνει νέα γραμμή κάτω από τον νέο γονέα· η παλιά γίνεται ανενεργή μόνο αφού μετακινηθούν όλα τα είδη (δεν διαγράφεται).");
    return { ok: true, title: `«${node.name}» → κάτω από «${parent.name}»`, items, groups, notes };
  }
  const items = await db.s1Item.count({ where: { specGroupS1Id: (node.k as { g: number }).g, missing: false } });
  return { ok: true, title: `«${node.name}» → κάτω από «${parent.name}»`, items, groups: 1, notes };
}

export async function startMove(nodeKey: string, parentKey: string, userId: string) {
  const p = await previewMove(nodeKey, parentKey);
  if (!p.ok) return { ok: false as const, error: p.error! };
  if (!(await categoriesWriteEnabled())) return { ok: false as const, error: WRITE_OFF };
  const node = parseKey(nodeKey)!, parent = parseKey(parentKey)!;
  let data: Prisma.CategoryOpCreateInput;
  if (node.level === 2 && parent.level === 1) {
    const [items, groups, cat] = await Promise.all([
      db.s1Item.findMany({ where: { webCat1: node.c1, webCat2: node.c2, missing: false }, select: { mtrl: true }, orderBy: { mtrl: "asc" } }),
      db.s1SpecGroup.findMany({ where: { cat1: node.c1, cat2: node.c2 }, select: { s1Id: true } }),
      db.s1WebCategory.findUnique({ where: { key: `2:${node.c1}:${node.c2}` } }),
    ]);
    const payload: L2Payload = { from: { c1: node.c1, c2: node.c2 }, to: { c1: parent.c1 }, name: cat?.name ?? "", groups: groups.map((g) => g.s1Id), groupsDone: [] };
    data = { kind: "move-l2", title: p.title!, payload, mtrls: items.map((i) => i.mtrl), createdById: userId };
  } else if (node.level === 3 && parent.level === 2) {
    const g = await db.s1SpecGroup.findUnique({ where: { s1Id: node.g } });
    const items = await db.s1Item.findMany({ where: { specGroupS1Id: node.g, missing: false }, select: { mtrl: true }, orderBy: { mtrl: "asc" } });
    const payload: L3Payload = { g: node.g, from: { c1: g?.cat1 ?? 0, c2: g?.cat2 ?? 0 }, to: { c1: parent.c1, c2: parent.c2 }, name: g?.name ?? "" };
    data = { kind: "move-l3", title: p.title!, payload, mtrls: items.map((i) => i.mtrl), createdById: userId };
  } else return { ok: false as const, error: "Μη επιτρεπτή μετακίνηση." };
  const op = await db.categoryOp.create({ data: { ...data, log: [{ at: new Date().toISOString(), ok: true, text: `Ξεκίνησε: ${p.title} (${p.items} είδη).` }] } });
  return { ok: true as const, id: op.id };
}

// ---------- εκτέλεση ----------

const line = (ok: boolean, text: string): LogLine => ({ at: new Date().toISOString(), ok, text });

async function save(id: string, data: Prisma.CategoryOpUpdateInput, add?: LogLine[]) {
  if (add?.length) {
    const cur = await db.categoryOp.findUniqueOrThrow({ where: { id }, select: { log: true } });
    data.log = [...((cur.log as LogLine[]) ?? []), ...add].slice(-200);
  }
  await db.categoryOp.update({ where: { id }, data });
}

async function failOp(id: string, error: string) {
  await save(id, { status: "failed", error, finishedAt: new Date() }, [line(false, error)]);
  return { ok: false, message: error };
}

/** Τρέχει την επόμενη εκκρεμή αλλαγή για έως `budgetMs`. `idle` = δεν υπήρχε τίποτα να γίνει. */
export async function runPendingOps(budgetMs = 270_000): Promise<{ ok: boolean; message: string; idle?: boolean }> {
  const op = await db.categoryOp.findFirst({ where: { status: { in: ["queued", "running"] } }, orderBy: { createdAt: "asc" } });
  if (!op) return { ok: true, message: "Καμία εκκρεμής αλλαγή κατηγοριών.", idle: true };
  const t0 = Date.now();
  if (!(await categoriesWriteEnabled())) return failOp(op.id, WRITE_OFF);
  if (op.status !== "running") await save(op.id, { status: "running", error: null });

  if (op.kind === "move-l2") {
    const p = op.payload as unknown as L2Payload;
    // 1. η νέα γραμμή στον νέο γονέα
    if (!p.to.c2) {
      const r = await changeL2({ kind: "copy", from: p.from, toC1: p.to.c1 });
      if (!r.ok) return failOp(op.id, `Δεν δημιουργήθηκε η κατηγορία στον νέο γονέα: ${r.error}${r.details ? ` (${r.details.join(" ")})` : ""}`);
      p.to.c2 = +r.target!.CCCWEBCATEGORY2;
      await save(op.id, { payload: p }, [line(true, r.message)]);
    }
    // 2. οι τύποι προϊόντος της
    for (const g of p.groups.filter((x) => !p.groupsDone.includes(x))) {
      const r = await changeGroupHead(g, { c1: p.to.c1, c2: p.to.c2 });
      if (!r.ok) return failOp(op.id, `Ο τύπος προϊόντος ${g} δεν μετακινήθηκε: ${r.error}${r.details ? ` (${r.details.join(" ")})` : ""}`);
      p.groupsDone.push(g);
      await save(op.id, { payload: p }, [line(true, r.message)]);
    }
    const done = await runItems(op.id, p.to.c1, p.to.c2!, t0, budgetMs);
    if (!done) return { ok: true, message: await progressText(op.id) };
    const fresh = await db.categoryOp.findUniqueOrThrow({ where: { id: op.id } });
    const failures = fresh.failures as Failure[];
    if (failures.length) return failOp(op.id, `${failures.length} είδη δεν άλλαξαν κατηγορία στο SoftOne· η παλιά κατηγορία μένει ενεργή. Πάτα «Επανάληψη αποτυχημένων».`);
    // 3. η παλιά γραμμή ανενεργή
    if (!p.oldDeactivated) {
      const r = await changeL2({ kind: "set", c1: p.from.c1, c2: p.from.c2, patch: { active: false } });
      if (!r.ok) return failOp(op.id, `Τα είδη μετακινήθηκαν, αλλά η παλιά κατηγορία δεν έγινε ανενεργή: ${r.error}`);
      p.oldDeactivated = true;
      await save(op.id, { payload: p }, [line(true, "Η παλιά θέση της κατηγορίας έγινε ανενεργή στο SoftOne.")]);
    }
    // η κατηγορία του καταστήματος κρατά id, slug και προϊόντα: αλλάζει μόνο ο κωδικός ERP
    const oldCode = `s1:2:${p.from.c1}:${p.from.c2}`, newCode = `s1:2:${p.to.c1}:${p.to.c2}`;
    if (!(await db.category.findUnique({ where: { erpCode: newCode } }))) await db.category.updateMany({ where: { erpCode: oldCode }, data: { erpCode: newCode } });
    return finish(op.id, op.mtrls.length);
  }

  if (op.kind === "move-l3") {
    const p = op.payload as unknown as L3Payload;
    if (!p.headDone) {
      const r = await changeGroupHead(p.g, { c1: p.to.c1, c2: p.to.c2 });
      if (!r.ok) return failOp(op.id, `Ο τύπος προϊόντος δεν μετακινήθηκε στο SoftOne: ${r.error}${r.details ? ` (${r.details.join(" ")})` : ""}`);
      p.headDone = true;
      await save(op.id, { payload: p }, [line(true, r.message)]);
    }
    const done = await runItems(op.id, p.to.c1, p.to.c2, t0, budgetMs);
    if (!done) return { ok: true, message: await progressText(op.id) };
    const fresh = await db.categoryOp.findUniqueOrThrow({ where: { id: op.id } });
    if ((fresh.failures as Failure[]).length) return failOp(op.id, `${(fresh.failures as Failure[]).length} είδη δεν άλλαξαν κατηγορία στο SoftOne. Πάτα «Επανάληψη αποτυχημένων».`);
    return finish(op.id, op.mtrls.length);
  }
  return failOp(op.id, `Άγνωστο είδος αλλαγής «${op.kind}».`);
}

/** Τα είδη, ένα-ένα από το `cursor`. true = τελείωσαν, false = τελείωσε ο χρόνος (συνεχίζει στο επόμενο πέρασμα). */
async function runItems(id: string, c1: number, c2: number, t0: number, budgetMs: number) {
  const op = await db.categoryOp.findUniqueOrThrow({ where: { id } });
  let cursor = op.cursor, okCount = op.okCount;
  const failures = [...(op.failures as Failure[])];
  while (cursor < op.mtrls.length) {
    if (Date.now() - t0 > budgetMs) break;
    const mtrl = op.mtrls[cursor];
    const r = await setItemWebCats(mtrl, c1, c2).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (r.ok) okCount++;
    else failures.push({ mtrl, code: (await db.s1Item.findUnique({ where: { mtrl }, select: { code: true } }))?.code, error: r.error });
    cursor++;
    // θέση σώζεται μετά από κάθε είδος — η διακοπή χάνει το πολύ ένα (που ξαναγίνεται χωρίς ζημιά: «ήδη εκεί»)
    await save(id, { cursor, okCount, failures });
  }
  const finished = cursor >= op.mtrls.length;
  if (finished && op.mtrls.length) await save(id, {}, [line(!failures.length, `Είδη: ${okCount} από ${op.mtrls.length} ενημερώθηκαν${failures.length ? `, ${failures.length} απέτυχαν` : ""}.`)]);
  return finished;
}

async function progressText(id: string) {
  const op = await db.categoryOp.findUniqueOrThrow({ where: { id } });
  return `${op.title}: ${op.cursor} από ${op.mtrls.length} είδη — συνεχίζει αυτόματα.`;
}

async function finish(id: string, total: number) {
  const [{ syncWebCategories, syncSpecGroups }, { projectCatalog }, { resetCatalogCache }] = await Promise.all([import("@/lib/softone/catalog"), import("@/lib/softone/project"), import("@/lib/data/db-catalog")]);
  await syncWebCategories("manual");
  await syncSpecGroups("manual");
  const pr = await projectCatalog("manual");
  resetCatalogCache();
  const op = await db.categoryOp.findUniqueOrThrow({ where: { id } });
  const text = `Ολοκληρώθηκε: ${op.title}. ${total} είδη στη νέα θέση${pr.ok ? ", το κατάστημα ενημερώθηκε" : `· η ενημέρωση του καταστήματος απέτυχε (${pr.error}) — θα γίνει στον επόμενο αυτόματο συγχρονισμό`}.`;
  await save(id, { status: "done", finishedAt: new Date(), error: null }, [line(true, text)]);
  return { ok: true, message: text };
}

/** Μετά από αποτυχία: ξανά μόνο τα είδη που απέτυχαν (τα υπόλοιπα είναι ήδη στη θέση τους). */
export async function retryOp(id: string) {
  const op = await db.categoryOp.findUnique({ where: { id } });
  if (!op || op.status !== "failed") return { ok: false, error: "Η αλλαγή δεν είναι σε αποτυχία." };
  const failed = (op.failures as Failure[]).map((f) => f.mtrl);
  // αν σταμάτησε πριν τα είδη (π.χ. κλειστός διακόπτης), συνεχίζει απλώς από τη θέση της
  const data: Prisma.CategoryOpUpdateInput = failed.length ? { mtrls: failed, cursor: 0, failures: [] } : {};
  await save(id, { ...data, status: "queued", error: null, finishedAt: null }, [line(true, failed.length ? `Επανάληψη για ${failed.length} είδη.` : "Συνέχεια από εκεί που σταμάτησε.")]);
  return { ok: true };
}

export async function cancelOp(id: string) {
  const op = await db.categoryOp.findUnique({ where: { id } });
  if (!op || op.status === "done") return { ok: false, error: "Δεν υπάρχει κάτι να ακυρωθεί." };
  await save(id, { status: "failed", error: "Ακυρώθηκε από τον χρήστη.", finishedAt: new Date() }, [line(false, `Ακυρώθηκε μετά από ${op.cursor} από ${op.mtrls.length} είδη. Ό,τι έγινε μένει· τα υπόλοιπα είδη είναι ακόμη στην παλιά θέση.`)]);
  return { ok: true };
}

export async function listOps() {
  return db.categoryOp.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
}
