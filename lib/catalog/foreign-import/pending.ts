import "server-only";
import { db } from "@/lib/db";
import { applyImport } from "@/lib/catalog/supplier-import";
import { applyMedia } from "@/lib/catalog/supplier-media";
import { loadGroups } from "@/lib/catalog/supplier-sheet";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { itemWriteEnabled, itemCodeTaken, writeWebPrice } from "@/lib/softone/item-write";
import { pendingMissing, pendingRow, pendingMedia, pendingFields, type PendingFields } from "@/lib/catalog/foreign-import/pending-core";

/**
 * Νέα είδη από ξένο Excel σε αναμονή έγκρισης (PendingItem). Η έγκριση περνά από την ΙΔΙΑ μηχανή με το template νέων ειδών
 * (`applyImport` → createInSoftone: αδελφό είδος για ΦΠΑ/μονάδα/ομάδα, memo με τα χαρακτηριστικά, createItem, προβολή),
 * πάντα ανενεργό· μετά τιμή web (μόνο αν λείπει) και φωτογραφίες στο νέο προϊόν. Σειρά ελέγχων πριν από οτιδήποτε στο ERP:
 * διακόπτης εγγραφής → κατάσταση → τι λείπει → κλείδωμα («creating») → κωδικός ελεύθερος (ανάγνωση) → δημιουργία.
 */
const OPEN = ["pending", "error"];
const SHEET = "Νέα είδη";
const CLOSED = "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις).";
export type ApproveResult = { id: string; ok: boolean; mtrl?: number; error?: string };

export async function approvePending(ids: string[], staffId: string): Promise<ApproveResult[]> {
  const list = [...new Set(ids)];
  if (!(await itemWriteEnabled())) return list.map((id) => ({ id, ok: false, error: CLOSED }));
  const out: ApproveResult[] = [];
  for (const id of list) out.push(await approveOne(id, staffId)); // μία-μία: το SoftOne δεν θέλει παράλληλες εγγραφές
  return out;
}

async function approveOne(id: string, staffId: string): Promise<ApproveResult> {
  const p = await db.pendingItem.findUnique({ where: { id } });
  if (!p) return { id, ok: false, error: "Το είδος δεν βρέθηκε στην αναμονή." };
  if (!OPEN.includes(p.status)) return { id, ok: false, error: p.status === "created" ? `Έχει ήδη δημιουργηθεί (MTRL ${p.mtrl ?? "—"}).` : p.status === "creating" ? "Δημιουργείται ήδη." : "Έχει απορριφθεί." };
  const brand = p.brandId ? await db.brand.findUnique({ where: { id: p.brandId }, select: { s1Id: true } }) : null;
  const missing = pendingMissing({ ...p, brandId: brand ? p.brandId : null, brandS1Id: brand?.s1Id ?? null });
  if (missing.length) {
    const error = `Λείπουν: ${missing.join(", ")}.`;
    await db.pendingItem.updateMany({ where: { id, status: { in: OPEN } }, data: { status: "error", error } });
    return { id, ok: false, error };
  }
  // Κλείδωμα: μόνο ένα αίτημα περνά από pending/error σε creating — δεύτερο κλικ (ή δεύτερη καρτέλα) σταματά εδώ
  const lock = await db.pendingItem.updateMany({ where: { id, status: { in: OPEN } }, data: { status: "creating", error: null } });
  if (lock.count !== 1) return { id, ok: false, error: "Δημιουργείται ήδη ή άλλαξε κατάσταση — ανανέωσε τη λίστα." };

  const fail = async (error: string, mtrl?: number | null): Promise<ApproveResult> => {
    await db.pendingItem.update({ where: { id }, data: { status: "error", error, ...(mtrl ? { mtrl } : {}) } });
    return { id, ok: false, error, ...(mtrl ? { mtrl } : {}) };
  };
  let mtrl: number | null = null;
  try {
    const code = p.code.trim(), groupS1Id = p.specGroupS1Id!;
    const taken = await itemCodeTaken(code);
    if (taken) return await fail(`Ο κωδικός ${code} υπάρχει ήδη στο SoftOne (MTRL ${taken}).`);
    if (!(await loadGroups([groupS1Id])).has(groupS1Id)) return await fail("Η ομάδα χαρακτηριστικών δεν υπάρχει πια στο SoftOne — διάλεξε άλλη.");

    // ---- δημιουργία: η μηχανή του template (έλεγχοι διπλών κωδικού/barcode, αδελφό είδος, createItem, συγχρονισμός, προβολή) ----
    const row = pendingRow(p, SHEET, groupS1Id);
    const [r] = await applyImport({ meta: null, rows: [row], warnings: [], sheets: [] }, { brandId: p.brandId!, toSoftone: true, activate: false }, [`${SHEET}#${p.rowNo}`]);
    if (!r) return await fail("Η γραμμή δεν εκτελέστηκε.");
    // createItem μπορεί να γράψει και μετά να αποτύχει η επαλήθευση: κρατάμε το MTRL (νέα προσπάθεια θα κοπεί στον κωδικό)
    if (!r.ok || !r.mtrl) return await fail(r.message, r.mtrl);
    mtrl = r.mtrl;
    let productId = r.productId ?? null;
    // Από εδώ και πέρα το είδος ΥΠΑΡΧΕΙ στο SoftOne: created αμέσως, ώστε τίποτα παρακάτω να μην επιτρέψει δεύτερη δημιουργία
    await db.pendingItem.update({ where: { id }, data: { status: "created", mtrl, productId, approvedById: staffId, error: null } });
    const notes: string[] = [];

    // ---- τιμή web (μόνο αν λείπει) και φρέσκια τιμή στο κατάστημα ----
    if (p.price != null && p.price > 0) {
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
      // Η κατηγορία του site βγαίνει από την ομάδα χαρακτηριστικών σε κάθε προβολή — δεν την αλλάζουμε εδώ, μόνο ενημερώνουμε
      if (prod && prod.categoryId !== p.webCategoryId) {
        const want = await db.category.findUnique({ where: { id: p.webCategoryId! }, select: { name: true } });
        notes.push(`Μπήκε στην κατηγορία «${prod.category.name}» (από την ομάδα χαρακτηριστικών), όχι στην «${want?.name ?? "—"}».`);
      }
      const m = pendingMedia(p.media);
      if (m.image.length + m.banner.length + m.video.length) {
        const key = `${SHEET}#${p.rowNo}`;
        const res = await applyMedia([{ sheet: SHEET, rowNo: p.rowNo, groupS1Id, ids: { mtrl: String(mtrl) }, ...m }], [key], false, staffId);
        for (const x of res) if (!x.ok || x.message.includes("Δεν πέρασαν")) notes.push(`Φωτογραφίες: ${x.message}`);
      }
    }
    const note = notes.length ? notes.join(" · ") : null;
    await db.pendingItem.update({ where: { id }, data: { productId, error: note } });
    return { id, ok: true, mtrl, ...(note ? { error: note } : {}) };
  } catch (e) {
    const msg = (e as Error).message || "Άγνωστο σφάλμα.";
    // Μετά τη δημιουργία το είδος μένει «created» — το σφάλμα γράφεται ως σημείωση
    if (mtrl) { await db.pendingItem.update({ where: { id }, data: { status: "created", mtrl, approvedById: staffId, error: msg } }).catch(() => null); return { id, ok: true, mtrl, error: msg }; }
    return await fail(msg);
  }
}

/** Απόρριψη: μόνο όσα δεν έχουν δημιουργηθεί (pending/error). Επιστρέφει πόσα απορρίφθηκαν. */
export async function discardPending(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return (await db.pendingItem.updateMany({ where: { id: { in: ids }, status: { in: OPEN } }, data: { status: "discarded" } })).count;
}

export interface PendingPatch { code?: string; fields?: PendingFields; brandId?: string | null; specGroupS1Id?: number | null; webCategoryId?: string | null; price?: number | null }

/**
 * Διόρθωση πριν από την έγκριση (φόρμα της λίστας): μόνο σε pending/error. Τα πεδία συγχωνεύονται με τα υπάρχοντα (κενή
 * τιμή = αφαίρεση)· μάρκα / κατηγορία / ομάδα ελέγχονται ότι υπάρχουν.
 */
export async function updatePending(id: string, patch: PendingPatch): Promise<{ ok: boolean; error?: string }> {
  const p = await db.pendingItem.findUnique({ where: { id }, select: { status: true, fields: true } });
  if (!p) return { ok: false, error: "Το είδος δεν βρέθηκε στην αναμονή." };
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
  const n = await db.pendingItem.updateMany({ where: { id, status: { in: OPEN } }, data });
  return n.count === 1 ? { ok: true } : { ok: false, error: "Το είδος άλλαξε κατάσταση στο μεταξύ — ανανέωσε τη λίστα." };
}
