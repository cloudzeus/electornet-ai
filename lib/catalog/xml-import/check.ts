import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { configForHeaders, UserError } from "@/lib/catalog/foreign-import/core";
import { previewForeign, type ForeignPlanRow } from "@/lib/catalog/foreign-import/server";
import { mediaOff } from "@/lib/catalog/xml-import/link-core";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { loadFeed } from "@/lib/catalog/xml-import/feed";
import { normPolicy, type UpdatePolicy } from "@/lib/catalog/xml-import/policy-core";
import { itemWriteEnabled } from "@/lib/softone/item-write";

/**
 * **Έλεγχος με SoftOne** για όλο το feed, πριν από την εισαγωγή — χωρίς καμία εγγραφή στο ERP.
 * Για κάθε προϊόν: υπάρχει ήδη ως είδος (και με ποιο κλειδί βρέθηκε); τι θα συμπληρωνόταν ή θα άλλαζε με την
 * πολιτική του χρήστη; τι τιμή θα έπαιρνε; Τα αποτελέσματα μένουν στη γραμμή (`s1Status`, `s1Check`).
 *
 * Τρέχει server side σε κομμάτια: ο scheduler (εργασία «xml-feeds») το συνεχίζει κάθε λεπτό. Η θέση είναι η ίδια η
 * βάση — γραμμή με `checkedAt` πριν από το `checkAt` του feed περιμένει ακόμη — άρα μια διακοπή συνεχίζει από εκεί που έμεινε.
 */
const CHUNK = 250;

export type CheckData = Pick<ForeignPlanRow, "title" | "code" | "mtrl" | "matchedBy" | "fileName" | "changes" | "price" | "warnings" | "problem">;

export async function startCheck(feedId: string, input: { policy: UpdatePolicy; priceMode: "cost" | "retail" }) {
  const feed = await loadFeed(feedId);
  if (!(feed.cfg.headers ?? []).length) throw new UserError("Το feed δεν έχει αποθηκευμένη αντιστοίχιση — ξανακάνε το βήμα της αντιστοίχισης.");
  const total = await db.supplierFeedItem.count({ where: { feedId, status: { not: "skipped" } } });
  if (!total) throw new UserError("Δεν υπάρχουν προϊόντα για έλεγχο — τρέξε πρώτα το feed.");
  await db.supplierFeed.update({ where: { id: feedId }, data: { updatePolicy: normPolicy(input.policy) as object, priceMode: input.priceMode, checkAt: new Date(), checkStatus: "running", checkMessage: `Ο έλεγχος ξεκίνησε για ${total.toLocaleString("el-GR")} προϊόντα.` } });
  return { total };
}

/** Ένα κομμάτι ενός feed. true = τελείωσε ο έλεγχος του feed. */
async function checkChunk(feedId: string): Promise<boolean> {
  const feed = await loadFeed(feedId);
  const { checkAt } = await db.supplierFeed.findUniqueOrThrow({ where: { id: feedId }, select: { checkAt: true } });
  const pendingWhere = { feedId, status: { not: "skipped" }, OR: [{ checkedAt: null }, { checkedAt: { lt: checkAt ?? new Date() } }] };
  const batch = await db.supplierFeedItem.findMany({ where: pendingWhere, orderBy: { sku: "asc" }, take: CHUNK, select: { id: true, sku: true, payload: true, edits: true, problem: true } });
  if (!batch.length) return true;
  const now = new Date();
  // Γραμμές με πρόβλημα του feed (χωρίς SKU, διπλό SKU) δεν χρειάζονται τη μηχανή
  const bad = batch.filter((b) => b.problem);
  if (bad.length) await db.$transaction(bad.map((b) => db.supplierFeedItem.update({ where: { id: b.id }, data: { s1Status: "problem", s1Check: { problem: b.problem, changes: [], warnings: [] } as object, checkedAt: now } })));
  const good = batch.filter((b) => !b.problem);
  if (good.length) {
    const headers = feed.cfg.headers ?? [];
    const matrix: string[][] = [headers];
    const rowOf = new Map<number, (typeof good)[number]>();
    for (const it of good) {
      const { merged } = mergeEdits((it.payload ?? {}) as Record<string, string>, (it.edits ?? null) as Record<string, string> | null);
      const at = matrix.push(headers.map((h) => merged[h] ?? "")) - 1;
      rowOf.set(at + 1, it); // ίδια αρίθμηση με το Excel (βλ. queue.ts)
    }
    const config = mediaOff(configForHeaders(feed.cfg.saved, headers));
    const { rows } = await previewForeign({ sheet: matrix, headerRow: 0, config, opts: { policy: feed.policy, priceMode: feed.priceMode === "retail" ? "retail" : "cost" } });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const r of rows) {
      const it = rowOf.get(r.rowNo);
      if (!it) continue;
      const data: CheckData = { title: r.title, code: r.code, mtrl: r.mtrl, matchedBy: r.matchedBy, fileName: r.fileName, changes: [...r.changes, ...(r.shop ?? [])].slice(0, 40), price: r.price, warnings: r.warnings.slice(0, 8), problem: r.problem };
      ops.push(db.supplierFeedItem.update({ where: { id: it.id }, data: { s1Status: r.status, s1Check: JSON.parse(JSON.stringify(data)), checkedAt: now } }));
    }
    // γραμμή που η μηχανή δεν επέστρεψε (δεν θα έπρεπε): σημαδεύεται, για να μη μείνει για πάντα «σε αναμονή»
    for (const [rowNo, it] of rowOf) if (!rows.some((r) => r.rowNo === rowNo)) ops.push(db.supplierFeedItem.update({ where: { id: it.id }, data: { s1Status: "problem", s1Check: { problem: "Η γραμμή δεν ελέγχθηκε.", changes: [], warnings: [] }, checkedAt: now } }));
    await db.$transaction(ops);
  }
  return (await db.supplierFeedItem.count({ where: pendingWhere })) === 0;
}

/** Τρέχει όσους ελέγχους είναι σε εξέλιξη, για έως `budgetMs`. */
export async function runChecks(budgetMs = 120_000): Promise<{ ok: boolean; message: string; idle?: boolean }> {
  const feeds = await db.supplierFeed.findMany({ where: { checkStatus: "running" }, select: { id: true, supplier: { select: { name: true } } } });
  if (!feeds.length) return { ok: true, message: "Κανένας έλεγχος σε εξέλιξη.", idle: true };
  const t0 = Date.now(), done: string[] = [], failed: string[] = [];
  for (const f of feeds) {
    try {
      let finished = false;
      while (!finished && Date.now() - t0 < budgetMs) finished = await checkChunk(f.id);
      if (finished) {
        const s = await checkSummary(f.id);
        const msg = `Ο έλεγχος ολοκληρώθηκε: ${s.existing.toLocaleString("el-GR")} υπάρχουν ήδη στο SoftOne (${s.toUpdate.toLocaleString("el-GR")} με στοιχεία προς ενημέρωση), ${s.counts.new.toLocaleString("el-GR")} νέα, ${s.counts.problem.toLocaleString("el-GR")} με πρόβλημα.`;
        await db.supplierFeed.update({ where: { id: f.id }, data: { checkStatus: "done", checkMessage: msg } });
        done.push(`${f.supplier.name}: ${msg}`);
      }
    } catch (e) {
      const msg = `Ο έλεγχος σταμάτησε: ${e instanceof Error ? e.message : String(e)}. Πάτα «Συνέχεια» για να συνεχίσει από εκεί που έμεινε.`;
      await db.supplierFeed.update({ where: { id: f.id }, data: { checkStatus: "failed", checkMessage: msg } });
      failed.push(`${f.supplier.name}: ${msg}`);
    }
  }
  return { ok: !failed.length, message: [...done, ...failed].join(" · ") || "Έλεγχος σε εξέλιξη — συνεχίζει στο επόμενο λεπτό." };
}

export async function resumeCheck(feedId: string) {
  await db.supplierFeed.update({ where: { id: feedId }, data: { checkStatus: "running", checkMessage: "Ο έλεγχος συνεχίζει από εκεί που σταμάτησε." } });
}

export interface CheckSummary {
  status: string | null; message: string | null; startedAt: string | null;
  total: number; checked: number;
  counts: { update: number; unchanged: number; new: number; waiting: number; problem: number };
  existing: number; toUpdate: number;
  matchedBy: Record<string, number>;
  /** ανά πεδίο: πόσα θα συμπληρωθούν (κενό στο SoftOne) και πόσα θα αντικατασταθούν */
  fields: { label: string; fill: number; overwrite: number }[];
  priced: number;
  newChosen: number;
  policy: UpdatePolicy; priceMode: "cost" | "retail"; toSoftone: boolean; writeOn: boolean;
  importMessage: string | null;
}

export async function checkSummary(feedId: string): Promise<CheckSummary> {
  const [feed, rows, writeOn] = await Promise.all([
    db.supplierFeed.findUniqueOrThrow({ where: { id: feedId }, select: { checkStatus: true, checkMessage: true, checkAt: true, updatePolicy: true, priceMode: true, toSoftone: true, importMessage: true } }),
    db.supplierFeedItem.findMany({ where: { feedId, status: { not: "skipped" } }, select: { s1Status: true, s1Check: true, checkedAt: true, softone: true } }),
    itemWriteEnabled(),
  ]);
  const counts = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
  const matchedBy: Record<string, number> = {};
  const fields = new Map<string, { fill: number; overwrite: number }>();
  let checked = 0, priced = 0, newChosen = 0, toUpdate = 0;
  const since = feed.checkAt?.getTime() ?? 0;
  for (const r of rows) {
    if (!r.checkedAt || r.checkedAt.getTime() < since || !r.s1Status) continue;
    checked++;
    const st = r.s1Status as keyof typeof counts;
    if (st in counts) counts[st]++;
    const c = (r.s1Check ?? {}) as CheckData;
    if (st === "new") { if (r.softone ?? feed.toSoftone) newChosen++; continue; }
    if (c.matchedBy) matchedBy[c.matchedBy] = (matchedBy[c.matchedBy] ?? 0) + 1;
    if (c.changes?.length || c.price) toUpdate++;
    if (c.price) priced++;
    for (const ch of c.changes ?? []) {
      const over = ch.label.endsWith(" (αντικατάσταση)");
      const label = over ? ch.label.slice(0, -" (αντικατάσταση)".length) : ch.label;
      const f = fields.get(label) ?? { fill: 0, overwrite: 0 };
      if (over) f.overwrite++; else f.fill++;
      fields.set(label, f);
    }
  }
  return {
    status: feed.checkStatus, message: feed.checkMessage, startedAt: feed.checkAt?.toISOString() ?? null,
    total: rows.length, checked, counts, existing: counts.update + counts.unchanged + counts.waiting, toUpdate, matchedBy,
    fields: [...fields].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.fill + b.overwrite - (a.fill + a.overwrite)),
    priced, newChosen, policy: normPolicy(feed.updatePolicy), priceMode: feed.priceMode === "retail" ? "retail" : "cost", toSoftone: feed.toSoftone, writeOn,
    importMessage: feed.importMessage,
  };
}

/** Τα αποτελέσματα ανά προϊόν, με φίλτρο κατάστασης, σε σελίδες. */
export async function checkRows(feedId: string, s1Status: string | null, page = 1, q = "") {
  const feed = await db.supplierFeed.findUniqueOrThrow({ where: { id: feedId }, select: { toSoftone: true } });
  const where = { feedId, status: { not: "skipped" }, s1Status: s1Status ?? { not: null }, ...(q.trim() ? { sku: { contains: q.trim(), mode: "insensitive" as const } } : {}) };
  const per = 50;
  const [total, rows] = await Promise.all([
    db.supplierFeedItem.count({ where }),
    db.supplierFeedItem.findMany({ where, orderBy: { sku: "asc" }, skip: (Math.max(1, page) - 1) * per, take: per, select: { id: true, sku: true, s1Status: true, s1Check: true, softone: true, status: true } }),
  ]);
  return { total, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / per)), rows: rows.map((r) => ({ id: r.id, sku: r.sku, s1Status: r.s1Status, status: r.status, check: (r.s1Check ?? {}) as CheckData, softone: r.softone ?? feed.toSoftone })) };
}

/** Ποια νέα είδη θα εισαχθούν στο SoftOne: ανά προϊόν ή όλα τα νέα μαζί. */
export async function chooseNew(feedId: string, which: string[] | "all" | "none", value: boolean) {
  if (which === "all" || which === "none") {
    const v = which === "all";
    await db.supplierFeed.update({ where: { id: feedId }, data: { toSoftone: v } });
    const r = await db.supplierFeedItem.updateMany({ where: { feedId, s1Status: "new" }, data: { softone: null } });
    return { changed: r.count };
  }
  const r = await db.supplierFeedItem.updateMany({ where: { feedId, id: { in: which } }, data: { softone: value } });
  return { changed: r.count };
}
