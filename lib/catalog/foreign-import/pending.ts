import "server-only";
import type { PendingItem } from "@prisma/client";
import { db } from "@/lib/db";
import { applyImport } from "@/lib/catalog/supplier-import";
import { applyMedia } from "@/lib/catalog/supplier-media";
import { loadGroups } from "@/lib/catalog/supplier-sheet";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { itemWriteEnabled, itemCodeTaken, writeWebPrice, webPriceWriteEnabled } from "@/lib/softone/item-write";
import { OPEN, pendingMissing, pendingRow, pendingMedia, pendingFields, pendingSpecs, isStaleCreating, canApprove, staleBefore, type PendingFields } from "@/lib/catalog/foreign-import/pending-core";
import { UserError } from "@/lib/catalog/foreign-import/core";

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

export async function approvePending(ids: string[], staffId: string): Promise<ApproveResult[]> {
  const out: ApproveResult[] = [];
  // Μία-μία (το SoftOne δεν θέλει παράλληλες εγγραφές)· ο διακόπτης ξαναδιαβάζεται πριν από κάθε είδος — αν κλείσει στη
  // μέση, τα υπόλοιπα δεν κλειδώνονται καν
  for (const id of [...new Set(ids)]) {
    try {
      if (!(await itemWriteEnabled())) { out.push({ id, ok: false, error: CLOSED }); continue; }
      out.push(await approveOne(id, staffId));
    } catch (e) { out.push({ id, ok: false, error: errMsg(e) }); }
  }
  return out;
}

const brandS1 = async (brandId: string | null) => (brandId ? await db.brand.findUnique({ where: { id: brandId }, select: { id: true, s1Id: true } }) : null);
const missingOf = async (p: PendingItem) => { const b = await brandS1(p.brandId); return pendingMissing({ ...p, brandId: b?.id ?? null, brandS1Id: b?.s1Id ?? null }); };

async function approveOne(id: string, staffId: string): Promise<ApproveResult> {
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
      if (stale) { mtrl = taken; return await finish(q, staffId, taken, null, [`Βρέθηκε ήδη στο SoftOne (MTRL ${taken}) από έγκριση που είχε διακοπεί — συνδέθηκε, δεν δημιουργήθηκε δεύτερο.`], false); }
      return await fail(`Ο κωδικός ${code} υπάρχει ήδη στο SoftOne (MTRL ${taken}).`);
    }
    const group = (await loadGroups([groupS1Id])).get(groupS1Id);
    if (!group) return await fail("Η ομάδα χαρακτηριστικών δεν υπάρχει πια στο SoftOne — διάλεξε άλλη.");
    // Χαρακτηριστικά: ετικέτες του αρχείου → ονόματα της ΤΕΛΙΚΗΣ ομάδας (μπορεί να ορίστηκε/άλλαξε μετά την προεπισκόπηση)
    const sp = pendingSpecs(q.specs, group.specs.map((d) => d.name));

    // ---- δημιουργία: η μηχανή του template (έλεγχοι διπλών κωδικού/barcode, αδελφό είδος, createItem, συγχρονισμός, προβολή) ----
    const [r] = await applyImport({ meta: null, rows: [pendingRow({ ...q, specs: sp.specs }, SHEET, groupS1Id)], warnings: [], sheets: [] }, { brandId: q.brandId!, toSoftone: true, activate: false }, [`${SHEET}#${q.rowNo}`]);
    if (r?.ok && r.mtrl) { mtrl = r.mtrl; return await finish(q, staffId, r.mtrl, r.productId ?? null, [...sp.warnings], true); }
    // Αποτυχία — αλλά το createItem μπορεί να έγραψε και να απέτυχε μετά (επαλήθευση/συγχρονισμός): ο κωδικός το ξέρει
    const msg = r?.message || "Η γραμμή δεν εκτελέστηκε.";
    const made = await itemCodeTaken(code).catch(() => null);
    if (made) { mtrl = made; return await finish(q, staffId, made, null, [`Δημιουργήθηκε στο SoftOne αλλά: ${msg}`], false); }
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
async function finish(p: PendingItem, staffId: string, mtrl: number, productId: string | null, notes: string[], priceWithoutProduct: boolean): Promise<ApproveResult> {
  await db.pendingItem.update({ where: { id: p.id }, data: { status: "created", mtrl, productId, approvedById: staffId, error: notes.join(" · ") || null } });
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
    // Το είδος δημιουργείται ανενεργό στο SoftOne, άρα και η προβολή το βγάζει ανενεργό — εδώ μόνο για σιγουριά
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
