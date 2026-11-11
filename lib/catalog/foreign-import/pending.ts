import "server-only";
import type { PendingItem } from "@prisma/client";
import { db } from "@/lib/db";
import { applyImport } from "@/lib/catalog/supplier-import";
import { applyMedia } from "@/lib/catalog/supplier-media";
import { loadGroups } from "@/lib/catalog/supplier-sheet";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { itemWriteEnabled, itemCodeTaken, writeItem, writeWebPrice, webPriceWriteEnabled, writeWebExcluded, webFlagWriteEnabled } from "@/lib/softone/item-write";
import { OPEN, pendingMissing, pendingRow, pendingMedia, pendingFields, pendingSpecs, isStaleCreating, canApprove, staleBefore, missingSpecs, renameSpec, type MissingSpec, type PendingFields } from "@/lib/catalog/foreign-import/pending-core";
import { UserError, labelKey } from "@/lib/catalog/foreign-import/core";
import { changeSpecGroup } from "@/lib/softone/spec-write";
import type { RowRefs } from "@/lib/catalog/supplier-sheet";
import type { PendingView } from "@/components/admin/catalog/PendingItems";

/** Οι γραμμές όπως τις δείχνει η λίστα «Νέα είδη» και το τελευταίο βήμα του οδηγού: ονόματα μάρκας / ομάδας / κατηγορίας / αρχείου και τι λείπει. */
export async function pendingViews(rows: PendingItem[]): Promise<PendingView[]> {
  const uniq = <T,>(l: (T | null)[]) => [...new Set(l.filter((x): x is T => x != null))];
  const [brands, groups, cats, jobs] = await Promise.all([
    db.brand.findMany({ where: { id: { in: uniq(rows.map((r) => r.brandId)) } }, select: { id: true, name: true, s1Id: true } }),
    db.s1SpecGroup.findMany({ where: { s1Id: { in: uniq(rows.map((r) => r.specGroupS1Id)) } }, select: { s1Id: true, name: true } }),
    db.category.findMany({ where: { id: { in: uniq(rows.map((r) => r.webCategoryId)) } }, select: { id: true, name: true } }),
    db.importJob.findMany({ where: { id: { in: uniq(rows.map((r) => r.jobId)) } }, select: { id: true, fileName: true, createdAt: true } }),
  ]);
  const brandOf = new Map(brands.map((b) => [b.id, b])), groupName = new Map(groups.map((g) => [g.s1Id, g.name]));
  const catName = new Map(cats.map((c) => [c.id, c.name])), jobOf = new Map(jobs.map((j) => [j.id, j]));
  return rows.map((p) => {
    const b = p.brandId ? brandOf.get(p.brandId) : undefined;
    const m = pendingMedia(p.media);
    const job = jobOf.get(p.jobId);
    return {
      id: p.id, status: p.status, code: p.code, name: pendingFields(p.fields).name ?? "", rowNo: p.rowNo,
      file: job ? `${job.fileName} · ${job.createdAt.toLocaleDateString("el-GR")}` : null,
      brandId: b?.id ?? null, brandName: b?.name ?? null, groupId: p.specGroupS1Id, groupName: p.specGroupS1Id != null ? groupName.get(p.specGroupS1Id) ?? `Ομάδα ${p.specGroupS1Id}` : null,
      category: p.webCategoryId ? catName.get(p.webCategoryId) ?? null : null,
      cost: p.cost, rrp: p.rrp, price: p.price, photos: m.image.length + m.banner.length + m.video.length, images: m.image.slice(0, 12),
      missing: pendingMissing({ ...p, brandId: b?.id ?? null, brandS1Id: b?.s1Id ?? null }),
      mtrl: p.mtrl, error: p.error, updatedAt: p.updatedAt.toISOString(),
    };
  });
}

/**
 * Νέα είδη από ξένο Excel σε αναμονή έγκρισης (PendingItem). Η έγκριση περνά από την ΙΔΙΑ μηχανή με το template νέων ειδών
 * (`applyImport` → createInSoftone: αδελφό είδος για ΦΠΑ/μονάδα/ομάδα, memo με τα χαρακτηριστικά, createItem, προβολή),
 * πάντα ανενεργό· μετά τιμή web (μόνο αν λείπει) και φωτογραφίες στο νέο προϊόν. Σειρά ελέγχων ανά είδος, πριν από
 * οτιδήποτε στο ERP: διακόπτης εγγραφής → κατάσταση → τι λείπει → κλείδωμα («creating») → ξανά τι λείπει (φρέσκια
 * ανάγνωση) → κωδικός ελεύθερος (ανάγνωση) → δημιουργία. «creating» που κόλλησε (> STALE_MIN λεπτά) ανακτάται: αν ο
 * κωδικός υπάρχει ήδη στο SoftOne, συνδέεται με αυτό — ποτέ δεύτερη δημιουργία.
 */
const SHEET = "Νέα είδη";
const CLOSED = "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις).";
export type ApproveResult = { id: string; ok: boolean; mtrl?: number; error?: string };
/** Μόνο τα δικά μας ελληνικά μηνύματα (UserError) φτάνουν στον χρήστη· τα υπόλοιπα (βάση, δίκτυο, βιβλιοθήκες) μένουν στο log. */
const errMsg = (e: unknown) => {
  if (e instanceof UserError) return e.message;
  console.error("[foreign-import/pending]", e);
  return "Απρόσμενο σφάλμα — ξαναδοκίμασε· αν επιμένει, ενημέρωσε τον διαχειριστή.";
};

/** `webExcluded`: τα είδη δημιουργούνται με τσεκαρισμένη την «Εξαίρεση Web» του SoftOne (δεν θα ανεβαίνουν στο site). */
export interface ApproveOpts { webExcluded?: boolean }

export async function approvePending(ids: string[], staffId: string, opts: ApproveOpts = {}): Promise<ApproveResult[]> {
  const out: ApproveResult[] = [];
  // Μία-μία (το SoftOne δεν θέλει παράλληλες εγγραφές)· ο διακόπτης ξαναδιαβάζεται πριν από κάθε είδος — αν κλείσει στη
  // μέση, τα υπόλοιπα δεν κλειδώνονται καν
  for (const id of [...new Set(ids)]) {
    try {
      if (!(await itemWriteEnabled())) { out.push({ id, ok: false, error: CLOSED }); continue; }
      out.push(await approveOne(id, staffId, opts));
    } catch (e) { out.push({ id, ok: false, error: errMsg(e) }); }
  }
  return out;
}

/**
 * Μονάδα μέτρησης και εμπορική σήμανση όπως τις όρισε η αντιστοίχιση: δικά μας id → αριθμοί SoftOne (`Unit.s1Id`,
 * `ItemMark.s1Id`). Εγγραφή που διαγράφηκε ή δεν έχει σύνδεση με το ERP δεν ακυρώνει την έγκριση: πέφτει στο αδελφό
 * είδος και ο χρήστης το βλέπει ως σημείωση στο είδος.
 */
async function rowRefs(p: Pick<PendingItem, "unitId" | "markId">, notes: string[]): Promise<RowRefs> {
  const [u, m] = await Promise.all([
    p.unitId ? db.unit.findUnique({ where: { id: p.unitId }, select: { name: true, s1Id: true } }) : null,
    p.markId ? db.itemMark.findUnique({ where: { id: p.markId }, select: { name: true, s1Id: true } }) : null,
  ]);
  if (p.unitId && !u?.s1Id) notes.push("Η μονάδα μέτρησης της αντιστοίχισης δεν βρέθηκε στο SoftOne — μπήκε αυτή του αδελφού είδους.");
  if (p.markId && !m?.s1Id) notes.push("Η εμπορική σήμανση της αντιστοίχισης δεν βρέθηκε στο SoftOne — έμεινε αυτή του αδελφού είδους.");
  const num = (v: string | null | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
  return { unit: num(u?.s1Id), mark: num(m?.s1Id) };
}

const brandS1 = async (brandId: string | null) => (brandId ? await db.brand.findUnique({ where: { id: brandId }, select: { id: true, s1Id: true } }) : null);
const missingOf = async (p: PendingItem) => { const b = await brandS1(p.brandId); return pendingMissing({ ...p, brandId: b?.id ?? null, brandS1Id: b?.s1Id ?? null }); };

async function approveOne(id: string, staffId: string, opts: ApproveOpts): Promise<ApproveResult> {
  const now = new Date();
  const p = await db.pendingItem.findUnique({ where: { id } });
  if (!p) return { id, ok: false, error: "Το είδος δεν βρέθηκε στην αναμονή." };
  if (!canApprove(p, now)) return { id, ok: false, error: p.mtrl != null ? `Έχει ήδη είδος στο SoftOne (MTRL ${p.mtrl}).` : p.status === "creating" ? "Δημιουργείται ήδη." : "Έχει απορριφθεί." };
  const stale = isStaleCreating(p, now);
  const missing = await missingOf(p);
  if (missing.length) {
    const error = `Λείπουν: ${missing.join(", ")}.`;
    await db.pendingItem.updateMany({ where: { id, status: { in: [...OPEN, "creating"] }, updatedAt: p.updatedAt, mtrl: null }, data: { status: "error", error } });
    return { id, ok: false, error };
  }
  // Κλείδωμα: μόνο ένα αίτημα περνά σε creating (pending/error χωρίς MTRL, ή creating που κόλλησε) — δεύτερο κλικ σταματά εδώ.
  // Το updatedAt μπαίνει ρητά: ένα δεύτερο αίτημα για «κολλημένο» είδος δεν ξαναπερνά τον όρο ηλικίας.
  const lock = await db.pendingItem.updateMany({
    where: { id, OR: [{ status: { in: OPEN }, mtrl: null }, { status: "creating", updatedAt: { lt: staleBefore(now) } }] },
    data: { status: "creating", error: null, updatedAt: new Date() },
  });
  if (lock.count !== 1) return { id, ok: false, error: "Δημιουργείται ήδη ή άλλαξε κατάσταση — ανανέωσε τη λίστα." };

  const fail = async (error: string): Promise<ApproveResult> => {
    await db.pendingItem.update({ where: { id }, data: { status: "error", error } }).catch(() => null);
    return { id, ok: false, error };
  };
  let mtrl: number | null = null;
  try {
    // Φρέσκια ανάγνωση μετά το κλείδωμα: αν στο μεταξύ άλλαξε κάτι και λείπει πια στοιχείο, το κλείδωμα επιστρέφεται
    const q = await db.pendingItem.findUnique({ where: { id } });
    if (!q) return { id, ok: false, error: "Το είδος δεν βρέθηκε στην αναμονή." };
    const again = await missingOf(q);
    if (again.length) {
      const error = `Λείπουν: ${again.join(", ")}.`;
      await db.pendingItem.update({ where: { id }, data: OPEN.includes(p.status) ? { status: p.status, error: p.error } : { status: "error", error } }).catch(() => null);
      return { id, ok: false, error };
    }
    const code = q.code.trim(), groupS1Id = q.specGroupS1Id!;
    const taken = await itemCodeTaken(code);
    if (taken) {
      // Έγκριση που διακόπηκε: το είδος φτιάχτηκε πριν πεθάνει η διεργασία — σύνδεση, όχι δεύτερη δημιουργία
      if (stale) { mtrl = taken; return await finish(q, staffId, taken, null, [`Βρέθηκε ήδη στο SoftOne (MTRL ${taken}) από έγκριση που είχε διακοπεί — συνδέθηκε, δεν δημιουργήθηκε δεύτερο.`], false, opts); }
      return await fail(`Ο κωδικός ${code} υπάρχει ήδη στο SoftOne (MTRL ${taken}).`);
    }
    const group = (await loadGroups([groupS1Id])).get(groupS1Id);
    if (!group) return await fail("Η ομάδα χαρακτηριστικών δεν υπάρχει πια στο SoftOne — διάλεξε άλλη.");
    // Χαρακτηριστικά: ετικέτες του αρχείου → ονόματα της ΤΕΛΙΚΗΣ ομάδας (μπορεί να ορίστηκε/άλλαξε μετά την προεπισκόπηση)
    const sp = pendingSpecs(q.specs, group.specs.map((d) => d.name));
    // Μονάδα / εμπορική σήμανση: δικά μας id → αριθμοί SoftOne. Εγγραφή που έχασε τη σύνδεσή της δεν μπλοκάρει την
    // έγκριση — το createInSoftone πέφτει πίσω στο αδελφό είδος, με σημείωση ώστε να φαίνεται τι έγινε.
    const refs = await rowRefs(q, sp.warnings);

    // ---- δημιουργία: η μηχανή του template (έλεγχοι διπλών κωδικού/barcode, αδελφό είδος, createItem, συγχρονισμός, προβολή) ----
    const [r] = await applyImport({ meta: null, rows: [pendingRow({ ...q, specs: sp.specs }, SHEET, groupS1Id, refs)], warnings: [], sheets: [] }, { brandId: q.brandId!, toSoftone: true, activate: false }, [`${SHEET}#${q.rowNo}`]);
    if (r?.ok && r.mtrl) { mtrl = r.mtrl; return await finish(q, staffId, r.mtrl, r.productId ?? null, [...sp.warnings], true, opts); }
    // Αποτυχία — αλλά το createItem μπορεί να έγραψε και να απέτυχε μετά (επαλήθευση/συγχρονισμός): ο κωδικός το ξέρει
    const msg = r?.message || "Η γραμμή δεν εκτελέστηκε.";
    const made = await itemCodeTaken(code).catch(() => null);
    if (made) { mtrl = made; return await finish(q, staffId, made, null, [`Δημιουργήθηκε στο SoftOne αλλά: ${msg}`], false, opts); }
    return await fail(r?.mtrl ? `${msg} (το SoftOne ανέφερε MTRL ${r.mtrl}, αλλά ο κωδικός δεν βρέθηκε εκεί)` : msg);
  } catch (e) {
    // Μετά τη δημιουργία το είδος μένει «created» — το σφάλμα γράφεται ως σημείωση
    if (mtrl) { await db.pendingItem.update({ where: { id }, data: { status: "created", mtrl, approvedById: staffId, error: errMsg(e) } }).catch(() => null); return { id, ok: true, mtrl, error: errMsg(e) }; }
    return await fail(errMsg(e));
  }
}

/**
 * Το είδος ΥΠΑΡΧΕΙ πια στο SoftOne: created αμέσως (τίποτα παρακάτω δεν επιτρέπει δεύτερη δημιουργία), μετά τιμή web,
 * ανενεργό προϊόν, σημείωση κατηγορίας, φωτογραφίες. Χωρίς productId (σύνδεση / ανάκτηση) γίνεται πρώτα συγχρονισμός και
 * προβολή· `priceWithoutProduct`: μόνο η κανονική δημιουργία γράφει τιμή χωρίς προϊόν στο κατάστημα.
 */
async function finish(p: PendingItem, staffId: string, mtrl: number, productId: string | null, notes: string[], priceWithoutProduct: boolean, opts: ApproveOpts = {}): Promise<ApproveResult> {
  await db.pendingItem.update({ where: { id: p.id }, data: { status: "created", mtrl, productId, approvedById: staffId, error: notes.join(" · ") || null } });
  // ---- «Εξαίρεση Web»: πριν από τιμή και συγχρονισμό, ώστε ο καθρέφτης να τη διαβάσει στο ίδιο πέρασμα ----
  // Με επιβεβαιωμένη εξαίρεση το είδος ΕΝΕΡΓΟΠΟΙΕΙΤΑΙ στο ERP (χρησιμοποιείται κανονικά, απλώς δεν ανεβαίνει στο site).
  // Αν η εξαίρεση δεν γράφτηκε, μένει ανενεργό: ενεργό χωρίς εξαίρεση θα έβγαινε στο web χωρίς έλεγχο.
  if (opts.webExcluded) {
    if (!webFlagWriteEnabled()) notes.push("Ζήτησες «Εξαίρεση Web» αλλά η εγγραφή της δεν έχει ενεργοποιηθεί — το είδος έμεινε ανενεργό· τσέκαρέ τη στο SoftOne και ενεργοποίησέ το.");
    else {
      const w = await writeWebExcluded(mtrl, true);
      if (!w.ok) notes.push(`«Εξαίρεση Web»: ${w.error ?? "δεν γράφτηκε."} Το είδος έμεινε ανενεργό· τσέκαρέ τη στο SoftOne πριν το ενεργοποιήσεις.`);
      else { const a = await writeItem(mtrl, { active: { from: false, to: true } }); if (!a.ok) notes.push(`Ενεργοποίηση: ${a.error ?? "δεν έγινε."} Το είδος έμεινε ανενεργό στο SoftOne.`); }
    }
  }
  if (!productId) { await syncItem(mtrl, "manual"); productId = (await projectItem(mtrl)).productId ?? null; }

  // ---- τιμή web (μόνο αν λείπει) και φρέσκια τιμή στο κατάστημα ----
  // Με κλειστή εγγραφή τιμής web (S1_WEB_PRICE_WRITE) δεν επιχειρείται καθόλου — σημείωση, όχι σφάλμα
  if (p.price != null && p.price > 0 && !webPriceWriteEnabled()) notes.push(`Η τιμή web (${p.price} €) δεν γράφτηκε — η εγγραφή τιμής δεν έχει ενεργοποιηθεί· βάλ' τη στο SoftOne.`);
  else if (p.price != null && p.price > 0 && (productId || priceWithoutProduct)) {
    const w = await writeWebPrice(mtrl, p.price, { onlyIfBlank: true });
    if (!w.ok) notes.push(`Τιμή web: ${w.error ?? "δεν γράφτηκε."}`);
    else { await syncItem(mtrl, "manual"); productId = (await projectItem(mtrl)).productId ?? productId; }
  }

  // ---- προϊόν του καταστήματος: ανενεργό, κατηγορία, φωτογραφίες ----
  if (!productId) notes.push("Το κατάστημα θα το πάρει στον επόμενο συγχρονισμό — οι φωτογραφίες δεν προστέθηκαν.");
  else {
    const prod = await db.product.findUnique({ where: { id: productId }, select: { active: true, categoryId: true, category: { select: { name: true } } } });
    // Ανενεργό ή με «Εξαίρεση Web» στο SoftOne, άρα και η προβολή το βγάζει ανενεργό — εδώ μόνο για σιγουριά
    if (prod?.active) await db.product.update({ where: { id: productId }, data: { active: false } });
    // Η κατηγορία του site βγαίνει από την ομάδα χαρακτηριστικών σε κάθε προβολή — το webCategoryId είναι μόνο ένδειξη
    if (prod && p.webCategoryId && prod.categoryId !== p.webCategoryId) {
      const want = await db.category.findUnique({ where: { id: p.webCategoryId }, select: { name: true } });
      notes.push(`Μπήκε στην κατηγορία «${prod.category.name}» (από την ομάδα χαρακτηριστικών), όχι στην «${want?.name ?? "—"}».`);
    }
    const m = pendingMedia(p.media);
    if (m.image.length + m.banner.length + m.video.length) {
      const key = `${SHEET}#${p.rowNo}`;
      const res = await applyMedia([{ sheet: SHEET, rowNo: p.rowNo, groupS1Id: p.specGroupS1Id, ids: { mtrl: String(mtrl) }, ...m }], [key], false, staffId);
      for (const x of res) if (!x.ok || x.message.includes("Δεν πέρασαν")) notes.push(`Φωτογραφίες: ${x.message}`);
    }
  }
  const note = notes.length ? notes.join(" · ") : null;
  await db.pendingItem.update({ where: { id: p.id }, data: { productId, error: note } });
  return { id: p.id, ok: true, mtrl, ...(note ? { error: note } : {}) };
}

/** Απόρριψη: μόνο όσα δεν έχουν δημιουργηθεί (pending/error χωρίς MTRL). Επιστρέφει πόσα απορρίφθηκαν. */
export async function discardPending(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // Ό,τι έχει ήδη είδος στο SoftOne (MTRL) δεν απορρίπτεται ποτέ
  return (await db.pendingItem.updateMany({ where: { id: { in: ids }, status: { in: OPEN }, mtrl: null }, data: { status: "discarded" } })).count;
}

export interface PendingPatch { code?: string; fields?: PendingFields; brandId?: string | null; specGroupS1Id?: number | null; webCategoryId?: string | null; price?: number | null }

/**
 * Διόρθωση πριν από την έγκριση (φόρμα της λίστας): μόνο σε pending/error χωρίς MTRL. Τα πεδία συγχωνεύονται με τα υπάρχοντα (κενή
 * τιμή = αφαίρεση)· μάρκα / κατηγορία / ομάδα ελέγχονται ότι υπάρχουν.
 */
export async function updatePending(id: string, patch: PendingPatch): Promise<{ ok: boolean; error?: string }> {
  const p = await db.pendingItem.findUnique({ where: { id }, select: { status: true, fields: true, mtrl: true } });
  if (!p) return { ok: false, error: "Το είδος δεν βρέθηκε στην αναμονή." };
  if (p.mtrl != null) return { ok: false, error: `Το είδος έχει ήδη MTRL ${p.mtrl} στο SoftOne — δεν αλλάζει από εδώ.` };
  if (!OPEN.includes(p.status)) return { ok: false, error: "Το είδος δεν αλλάζει πια (έχει δημιουργηθεί ή απορριφθεί)." };
  const data: { code?: string; fields?: PendingFields; brandId?: string | null; specGroupS1Id?: number | null; webCategoryId?: string | null; price?: number | null } = {};
  if (patch.code !== undefined) {
    const code = patch.code.trim();
    if (code.length > 25) return { ok: false, error: "Ο κωδικός έχει έως 25 χαρακτήρες." };
    data.code = code;
  }
  if (patch.fields) {
    const merged: PendingFields = { ...pendingFields(p.fields) };
    for (const [k, v] of Object.entries(patch.fields) as [keyof PendingFields, string | undefined][]) {
      if (k === "mtrl") continue; // νέο είδος: ποτέ MTRL
      const t = (v ?? "").trim();
      if (t) merged[k] = t; else delete merged[k];
    }
    data.fields = merged;
  }
  if (patch.brandId !== undefined) {
    if (patch.brandId && !(await db.brand.findUnique({ where: { id: patch.brandId }, select: { id: true } }))) return { ok: false, error: "Η μάρκα δεν βρέθηκε." };
    data.brandId = patch.brandId || null;
  }
  if (patch.webCategoryId !== undefined) {
    if (patch.webCategoryId && !(await db.category.findUnique({ where: { id: patch.webCategoryId }, select: { id: true } }))) return { ok: false, error: "Η κατηγορία δεν βρέθηκε." };
    data.webCategoryId = patch.webCategoryId || null;
  }
  if (patch.specGroupS1Id !== undefined) {
    if (patch.specGroupS1Id != null && !(await loadGroups([patch.specGroupS1Id])).has(patch.specGroupS1Id)) return { ok: false, error: "Η ομάδα χαρακτηριστικών δεν βρέθηκε." };
    data.specGroupS1Id = patch.specGroupS1Id;
  }
  if (patch.price !== undefined) {
    if (patch.price != null && !(Number.isFinite(patch.price) && patch.price > 0)) return { ok: false, error: "Η τιμή πρέπει να είναι αριθμός μεγαλύτερος από 0." };
    data.price = patch.price == null ? null : Math.round(patch.price * 100) / 100;
  }
  // Ξανά ο έλεγχος κατάστασης στην ίδια την εγγραφή: αν στο μεταξύ ξεκίνησε έγκριση, δεν αλλάζει τίποτα
  const n = await db.pendingItem.updateMany({ where: { id, status: { in: OPEN }, mtrl: null }, data });
  return n.count === 1 ? { ok: true } : { ok: false, error: "Το είδος άλλαξε κατάσταση στο μεταξύ — ανανέωσε τη λίστα." };
}

// ---------- Χαρακτηριστικά που λείπουν από την ομάδα του SoftOne (πριν από την έγκριση) ----------

export type SpecGap = MissingSpec & { groupName: string; existing: string[] };
export type SpecDecision = { groupS1Id: number; label: string; action: "create" | "use" | "skip"; use?: string };
const openRows = (ids: string[]) => db.pendingItem.findMany({ where: { id: { in: ids }, status: { in: OPEN }, mtrl: null }, select: { id: true, specGroupS1Id: true, specs: true } });

/** Ετικέτες χαρακτηριστικών των επιλεγμένων ειδών που δεν υπάρχουν στην ομάδα τους, με το πιο κοντινό υπάρχον ως πρόταση. */
export async function pendingSpecGaps(ids: string[]): Promise<SpecGap[]> {
  const rows = await openRows(ids);
  const groups = await loadGroups([...new Set(rows.map((r) => r.specGroupS1Id).filter((x): x is number => x != null))]);
  const names = new Map([...groups].map(([id, g]) => [id, g.specs.map((d) => d.name)]));
  return missingSpecs(rows, names, labelKey).map((m) => ({ ...m, groupName: groups.get(m.groupS1Id)?.name ?? `Ομάδα ${m.groupS1Id}`, existing: names.get(m.groupS1Id) ?? [] }));
}

/**
 * Οι αποφάσεις του χρήστη για κάθε ετικέτα που λείπει: «create» = νέο χαρακτηριστικό στην ομάδα του SoftOne (χωρίς φίλτρο,
 * ορατό — πάντα με ρητή επιβεβαίωση από την οθόνη), «use» = η ετικέτα γίνεται υπάρχον χαρακτηριστικό (μόνο στα είδη σε
 * αναμονή, τίποτα στο ERP), «skip» = μένει όπως είναι και αγνοείται στην έγκριση.
 */
export async function resolvePendingSpecs(ids: string[], decisions: SpecDecision[]): Promise<{ created: number; mapped: number; errors: string[] }> {
  let created = 0, mapped = 0; const errors: string[] = [];
  const rows = await openRows(ids);
  for (const d of decisions) {
    if (d.action === "create") {
      const r = await changeSpecGroup(d.groupS1Id, { kind: "add-spec", name: d.label, isFilter: false, isView: true });
      if (r.ok) created++; else if (!/Υπάρχει ήδη/.test(r.error)) errors.push(`«${d.label}»: ${r.error}${r.details?.length ? ` (${r.details.join(" ")})` : ""}`);
    } else if (d.action === "use" && d.use) {
      for (const p of rows.filter((x) => x.specGroupS1Id === d.groupS1Id)) {
        const next = renameSpec(p.specs, d.label, d.use, labelKey);
        if (next) { await db.pendingItem.updateMany({ where: { id: p.id, status: { in: OPEN }, mtrl: null }, data: { specs: next } }); p.specs = next; mapped++; }
      }
    }
  }
  return { created, mapped, errors };
}
