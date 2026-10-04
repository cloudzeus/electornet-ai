import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { parseVideoUrl } from "@/lib/catalog/video-url";
import { uploadProductImage, reorderImages, productFolderId, type ProductMediaKind } from "@/lib/catalog/product-images";
import { ingest } from "@/lib/media/repo";
import { toWebMp4, VIDEO_MIMES } from "@/lib/media/process";
import { RESERVED, cellText, colName, groupOfCategory, loadGroups, plain, safeSheetName, type SheetMeta } from "@/lib/catalog/supplier-sheet";
import type { Plan, PlanRow, ApplyResult } from "@/lib/catalog/supplier-import";

/**
 * Template πολυμέσων ανά μάρκα — χωριστό excel από τα στοιχεία: ένα φύλλο ανά κατηγορία, μία γραμμή ανά προϊόν, με
 * διευθύνσεις (URL) για φωτογραφίες, banners κατασκευαστή και βίντεο. Στην εισαγωγή οι εικόνες κατεβαίνουν από τον
 * server του προμηθευτή (μόνο δημόσιες διευθύνσεις), περνούν από τη βιβλιοθήκη (WebP, Bunny) και δένονται στο προϊόν·
 * τα βίντεο (YouTube / Vimeo / mp4) μένουν σύνδεσμοι. Ό,τι έχει ήδη έρθει από την ίδια διεύθυνση δεν ξανακατεβαίνει.
 */
export const IMAGES = 10, BANNERS = 6, VIDEOS = 3;
const ID_COLS = [
  { key: "mtrl", header: "MTRL", width: 10, note: "Αριθμός είδους στο SoftOne. Για νέα προϊόντα άφησέ τον κενό και συμπλήρωσε barcode ή κωδικό." },
  { key: "code", header: "Κωδικός είδους", width: 18, note: "Ο κωδικός του είδους — βρίσκουμε το προϊόν και από αυτόν." },
  { key: "name", header: "Όνομα", width: 40, note: "Μόνο για να ξέρεις ποιο προϊόν είναι — δεν αλλάζει από εδώ." },
  { key: "barcode", header: "Barcode (EAN)", width: 16, note: "Για νέα προϊόντα: με αυτό βρίσκουμε το προϊόν αφού εισαχθεί." },
  { key: "factoryCode", header: "Κωδικός κατασκευαστή", width: 18, note: "Εναλλακτικά του barcode." },
  { key: "now", header: "Έχει ήδη", width: 22, note: "Πόσα πολυμέσα έχει σήμερα το προϊόν στο κατάστημα — μόνο για πληροφορία." },
] as const;
type IdKey = (typeof ID_COLS)[number]["key"];
const COLS = [
  ...Array.from({ length: IMAGES }, (_, i) => ({ kind: "image" as const, n: i + 1, header: i === 0 ? "Φωτογραφία 1 (κύρια)" : `Φωτογραφία ${i + 1}` })),
  ...Array.from({ length: BANNERS }, (_, i) => ({ kind: "banner" as const, n: i + 1, header: `Banner ${i + 1}` })),
  ...Array.from({ length: VIDEOS }, (_, i) => ({ kind: "video" as const, n: i + 1, header: `Βίντεο ${i + 1}` })),
];
const NOTE: Record<"image" | "banner" | "video", string> = {
  image: "Διεύθυνση (URL) εικόνας JPG / PNG / WebP, τουλάχιστον 800 px, λευκό φόντο. Η σειρά των στηλών είναι η σειρά στο κατάστημα.",
  banner: "Διεύθυνση εικόνας banner του κατασκευαστή (φωτογραφία με κείμενο). Μπαίνουν στην περιγραφή και μπορούν να γίνουν κείμενο με την απόδελτίωση.",
  video: "Σύνδεσμος YouTube, Vimeo ή αρχείου .mp4 (https).",
};
const EMPTY_ROWS = 100;

export async function buildMediaTemplate(brandId: string, groupIds: number[]): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
  if (!brand) throw new Error("Η μάρκα δεν βρέθηκε.");
  const groups = await loadGroups(groupIds);
  const ordered = groupIds.map((id) => groups.get(id)).filter((g): g is NonNullable<typeof g> => !!g);
  if (!ordered.length) throw new Error("Καμία από τις κατηγορίες δεν υπάρχει πια στο SoftOne.");
  const products = await db.product.findMany({
    where: { brandId, category: { erpCode: { in: ordered.map((g) => `s1:g:${g.s1Id}`) } } },
    orderBy: { title: "asc" },
    select: { id: true, erpCode: true, sku: true, ean: true, title: true, category: { select: { erpCode: true } } },
  });
  const [items, counts] = await Promise.all([
    db.s1Item.findMany({ where: { mtrl: { in: products.filter((p) => /^\d+$/.test(p.erpCode)).map((p) => Number(p.erpCode)) } }, select: { mtrl: true, code: true, barcode: true, factoryCode: true } }),
    db.media.groupBy({ by: ["productId", "kind"], where: { productId: { in: products.map((p) => p.id) }, hidden: false }, _count: { _all: true } }),
  ]);
  const itemOf = new Map(items.map((i) => [String(i.mtrl), i]));
  const n = (pid: string, k: string) => counts.find((c) => c.productId === pid && c.kind === k)?._count._all ?? 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Euronics admin"; wb.created = new Date();
  const navy = "FF0B1F4D", blue = "FF1E5AAB", violet = "FF5B3FA8", grey = "FFEEF1F6";
  const intro = wb.addWorksheet("Οδηγίες", { properties: { tabColor: { argb: navy } } });
  const metaWs = wb.addWorksheet("_meta", { state: "veryHidden" });
  const meta: SheetMeta = { v: 1, kind: "media", brandId: brand.id, brand: brand.name, generatedAt: new Date().toISOString(), sheets: [] };
  const taken = new Set<string>();
  let total = 0;
  for (const g of ordered) {
    const name = safeSheetName(g.name, taken);
    meta.sheets.push({ name, groupS1Id: g.s1Id, group: g.name });
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
    ws.columns = [...ID_COLS.map((c) => ({ header: c.header, width: c.width })), ...COLS.map((c) => ({ header: c.header, width: c.kind === "video" ? 34 : 30 }))];
    const head = ws.getRow(1); head.height = 34;
    head.eachCell((cell, i) => {
      const id = ID_COLS[i - 1], m = COLS[i - 1 - ID_COLS.length];
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: id ? navy : m.kind === "video" ? violet : blue } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.note = id ? id.note : NOTE[m.kind];
    });
    const mine = products.filter((p) => groupOfCategory(p.category.erpCode) === g.s1Id);
    for (const p of mine) {
      const it = itemOf.get(p.erpCode);
      const now = [`${n(p.id, "image")} φωτ.`, `${n(p.id, "banner")} banners`, `${n(p.id, "video")} βίντεο`].join(" · ");
      const vals: Record<IdKey, string | number> = { mtrl: it ? Number(p.erpCode) : "", code: it?.code ?? p.sku, name: p.title, barcode: it?.barcode ?? p.ean ?? "", factoryCode: it?.factoryCode ?? "", now };
      ws.addRow(ID_COLS.map((c) => vals[c.key]));
    }
    total += mine.length;
    const last = mine.length + 1 + EMPTY_ROWS;
    for (let r = 2; r <= mine.length + 1; r++) for (const c of [1, 3, 6]) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: grey } };
    // Τα URL: μόνο κείμενο που αρχίζει από http
    for (let c = ID_COLS.length + 1; c <= ID_COLS.length + COLS.length; c++) {
      const col = colName(c);
      for (let r = 2; r <= last; r++) ws.getCell(r, c).dataValidation = { type: "custom", allowBlank: true, formulae: [`LEFT(${col}${r},4)="http"`], showErrorMessage: true, errorTitle: "Διεύθυνση", error: "Γράψε πλήρη διεύθυνση που αρχίζει από http:// ή https://" };
    }
  }
  intro.columns = [{ width: 4 }, { width: 110 }];
  const lines: [string, boolean?][] = [
    [`${brand.name} — φωτογραφίες, banners και βίντεο`, true],
    [`Δημιουργήθηκε ${new Date().toLocaleString("el-GR")} · ${ordered.length} ${ordered.length === 1 ? "κατηγορία" : "κατηγορίες"} · ${total} προϊόντα`],
    [""],
    ["Πώς συμπληρώνεται", true],
    ["• Μία γραμμή = ένα προϊόν. Τα υπάρχοντα προϊόντα είναι ήδη στη λίστα· για νέα, γράψε barcode ή κωδικό σε μια κενή γραμμή."],
    ["• Σε κάθε κελί μία διεύθυνση (URL) που ανοίγει απευθείας το αρχείο — όχι σελίδα, όχι Google Drive / Dropbox με σύνδεση."],
    ["• Φωτογραφίες: JPG / PNG / WebP, τουλάχιστον 800 px, λευκό φόντο. Η «Φωτογραφία 1» γίνεται κύρια όταν το προϊόν δεν έχει φωτογραφίες — σε προϊόν που ήδη έχει, οι νέες μπαίνουν μετά τις υπάρχουσες (εκτός αν η εισαγωγή γίνει με «Αντικατάσταση»)."],
    ["• Banners: οι εικόνες του κατασκευαστή με φωτογραφία και κείμενο. Βίντεο: YouTube, Vimeo ή αρχείο .mp4 (https)."],
    ["• Ό,τι έχει ήδη έρθει από την ίδια διεύθυνση δεν ξαναμπαίνει. Τίποτα δεν σβήνεται από εδώ."],
    ["• Μην αλλάξεις τα ονόματα των φύλλων και των στηλών."],
  ];
  lines.forEach(([t, bold], i) => { const c = intro.getCell(`B${i + 2}`); c.value = t; c.font = bold ? { bold: true, size: i === 0 ? 16 : 12, color: { argb: navy } } : { size: 11 }; c.alignment = { wrapText: true }; });
  metaWs.getCell("A1").value = JSON.stringify(meta);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const slug = brand.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "brand";
  return { buffer, filename: `${slug}-fotografies-video-${new Date().toISOString().slice(0, 10)}.xlsx`, rows: total };
}

// ---------- Ανάγνωση ----------

export interface MediaRow { sheet: string; rowNo: number; groupS1Id: number | null; ids: Partial<Record<IdKey, string>>; image: string[]; banner: string[]; video: string[] }

export async function parseMediaWorkbook(wb: ExcelJS.Workbook, meta: SheetMeta | null): Promise<{ rows: MediaRow[]; warnings: string[] }> {
  const rows: MediaRow[] = [], warnings: string[] = [];
  for (const ws of wb.worksheets.filter((w) => !RESERVED.has(w.name) && w.state === "visible")) {
    const map = new Map<number, { id?: IdKey; media?: (typeof COLS)[number] }>();
    ws.getRow(1).eachCell((cell, col) => {
      const h = plain(cellText(cell.value)); if (!h) return;
      const id = ID_COLS.find((c) => plain(c.header) === h); if (id) { map.set(col, { id: id.key }); return; }
      const m = COLS.find((c) => plain(c.header) === h); if (m) map.set(col, { media: m });
    });
    if (![...map.values()].some((m) => m.media)) { warnings.push(`Φύλλο «${ws.name}»: δεν έχει στήλες φωτογραφιών / βίντεο — αγνοείται.`); continue; }
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      const r: MediaRow = { sheet: ws.name, rowNo, groupS1Id: meta?.sheets.find((s) => s.name === ws.name)?.groupS1Id ?? null, ids: {}, image: [], banner: [], video: [] };
      const slots: { kind: "image" | "banner" | "video"; n: number; v: string }[] = [];
      for (const [col, m] of map) {
        const cv = row.getCell(col).value;
        const t = typeof cv === "object" && cv && "hyperlink" in cv ? String(cv.hyperlink) : cellText(cv);
        if (!t) continue;
        if (m.id) r.ids[m.id] = t; else if (m.media) slots.push({ kind: m.media.kind, n: m.media.n, v: t });
      }
      if (!slots.length) return; // γραμμή χωρίς πολυμέσα (π.χ. υπάρχον προϊόν που δεν συμπληρώθηκε)
      for (const s of slots.sort((a, b) => a.n - b.n)) r[s.kind].push(s.v);
      rows.push(r);
    });
  }
  return { rows, warnings };
}

// ---------- Έλεγχος & εκτέλεση ----------

async function decideMedia(rows: MediaRow[], replace: boolean) {
  const mtrls = rows.map((r) => r.ids.mtrl).filter((x): x is string => !!x && /^\d+$/.test(x));
  const barcodes = rows.map((r) => r.ids.barcode).filter((x): x is string => !!x);
  const codes = rows.flatMap((r) => [r.ids.code, r.ids.factoryCode]).filter((x): x is string => !!x);
  const [byErp, byEan, bySku, items] = await Promise.all([
    db.product.findMany({ where: { erpCode: { in: mtrls } }, select: { id: true, erpCode: true, title: true } }),
    db.product.findMany({ where: { ean: { in: barcodes } }, select: { id: true, ean: true, title: true, erpCode: true } }),
    db.product.findMany({ where: { sku: { in: codes } }, select: { id: true, sku: true, title: true, erpCode: true } }),
    db.s1Item.findMany({ where: { OR: [{ barcode: { in: barcodes } }, { code: { in: codes } }, { factoryCode: { in: codes } }] }, select: { mtrl: true, barcode: true, code: true, factoryCode: true } }),
  ]);
  const viaItem = await db.product.findMany({ where: { erpCode: { in: items.map((i) => String(i.mtrl)) } }, select: { id: true, erpCode: true, title: true } });
  const find = (r: MediaRow) => {
    if (r.ids.mtrl) return byErp.find((p) => p.erpCode === r.ids.mtrl);
    const b = r.ids.barcode, c = [r.ids.code, r.ids.factoryCode].filter(Boolean) as string[];
    const it = items.find((i) => (b && i.barcode === b) || c.some((x) => x === i.code || x === i.factoryCode));
    return (b && byEan.find((p) => p.ean === b)) || bySku.find((p) => c.includes(p.sku)) || (it && viaItem.find((p) => p.erpCode === String(it.mtrl)));
  };
  const found = rows.map(find);
  const media = await db.media.findMany({ where: { productId: { in: found.filter(Boolean).map((p) => p!.id) } }, select: { id: true, productId: true, kind: true, url: true, importFile: true, hidden: true, sortNo: true } });

  return rows.map((r, i) => {
    const p = found[i];
    const out: PlanRow & { productId?: string; todo: { kind: "image" | "banner" | "video"; list: { raw: string; url: string; existingId?: string; thumb?: string | null }[] }[] } =
      { key: `${r.sheet}#${r.rowNo}`, sheet: r.sheet, rowNo: r.rowNo, groupS1Id: r.groupS1Id ?? 0, group: r.sheet, action: "unchanged", title: p?.title ?? r.ids.name ?? "", mtrl: r.ids.mtrl ? Number(r.ids.mtrl) : undefined, code: r.ids.code ?? r.ids.barcode, productId: p?.id, changes: [], errors: [], warnings: [], todo: [] };
    if (!p) { out.action = "error"; out.errors.push(r.ids.mtrl ? `Δεν βρέθηκε προϊόν με MTRL ${r.ids.mtrl}.` : "Δεν βρέθηκε προϊόν με αυτό το barcode / κωδικό — αν είναι νέο, κάνε πρώτα την εισαγωγή των νέων προϊόντων."); return out; }
    const mine = media.filter((m) => m.productId === p.id);
    for (const kind of ["image", "banner", "video"] as const) {
      const label = kind === "image" ? "Φωτογραφία" : kind === "banner" ? "Banner" : "Βίντεο";
      const list: { raw: string; url: string; existingId?: string; thumb?: string | null }[] = [];
      r[kind].forEach((raw, k) => {
        let url = raw.trim(), thumb: string | null | undefined;
        if (kind === "video") { const v = parseVideoUrl(url); if (!v) { out.warnings.push(`${label} ${k + 1}: «${short(raw)}» δεν είναι σύνδεσμος YouTube, Vimeo ή .mp4 (https) — παραλείπεται.`); return; } url = v.url; thumb = v.thumb; }
        else { try { const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") throw 0; } catch { out.warnings.push(`${label} ${k + 1}: «${short(raw)}» δεν είναι διεύθυνση — παραλείπεται.`); return; } }
        if (list.some((x) => x.url === url)) return;
        const ex = mine.find((m) => m.kind === kind && (kind === "video" && !/\.(mp4|webm)$/i.test(new URL(url).pathname) ? m.url === url : m.importFile === url));
        list.push({ raw, url, existingId: ex?.id, thumb });
        if (!ex) out.changes.push({ label: `${label} ${list.length}`, from: "—", to: short(url) });
        else if (ex.hidden && replace) out.changes.push({ label: `${label} ${list.length}`, from: "κρυμμένη", to: "ξανά ορατή" });
      });
      if (!list.length) continue;
      if (replace) {
        const visible = mine.filter((m) => m.kind === kind && !m.hidden).sort((a, b) => a.sortNo - b.sortNo);
        const extraHidden = visible.filter((m) => !list.some((x) => x.existingId === m.id)).length;
        if (extraHidden) out.changes.push({ label: `${label}`, from: `${extraHidden} που δεν είναι στο αρχείο`, to: "κρύβονται (δεν σβήνονται)" });
        else if (list.every((x) => x.existingId) && visible.map((m) => m.id).join() !== list.map((x) => x.existingId).join()) out.changes.push({ label, from: "σειρά", to: "όπως στο αρχείο" });
      }
      out.todo.push({ kind, list });
    }
    out.action = out.changes.length ? "update" : "unchanged";
    return out;
  });
}
const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

export async function planMedia(rows: MediaRow[], warnings: string[], meta: SheetMeta | null, replace: boolean): Promise<Plan> {
  const d = await decideMedia(rows, replace);
  const brand = meta?.brandId ? await db.brand.findUnique({ where: { id: meta.brandId }, select: { id: true, name: true, s1Id: true } }) : null;
  const out: PlanRow[] = d.map(({ todo, ...r }) => (void todo, r));
  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of out) counts[r.action]++;
  return { brand, kind: "media", rows: out, warnings, counts };
}

const MAX_IMAGE = 25 * 1024 * 1024;
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" };

export async function applyMedia(rows: MediaRow[], keys: string[], replace: boolean, staffId: string | null): Promise<ApplyResult[]> {
  const want = new Set(keys);
  const d = (await decideMedia(rows, replace)).filter((r) => want.has(r.key));
  const out: ApplyResult[] = [];
  for (const r of d) {
    if (r.action === "error" || !r.productId) { out.push({ key: r.key, ok: false, message: r.errors.join(" ") }); continue; }
    if (r.action === "unchanged") { out.push({ key: r.key, ok: true, message: "Καμία αλλαγή." }); continue; }
    const done: string[] = [], failed: string[] = [];
    for (const t of r.todo) {
      const ids: string[] = [];
      if (t.kind === "video") {
        const last = await db.media.aggregate({ where: { productId: r.productId, kind: "video" }, _max: { sortNo: true } });
        let next = last._max.sortNo ?? 0;
        for (const [k, v] of t.list.entries()) {
          if (v.existingId) { ids.push(v.existingId); continue; }
          try { const id = await importVideo(r.productId, r.title, v, ++next, staffId); ids.push(id); done.push("βίντεο"); }
          catch (e) { failed.push(`Βίντεο ${k + 1}: ${(e as Error).message}`); }
        }
      } else {
        for (const [k, v] of t.list.entries()) {
          if (v.existingId) { ids.push(v.existingId); continue; }
          try {
            const f = await fetchPublicBytes(v.url, { max: MAX_IMAGE, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
            const ext = /\.(\w{3,4})(?:$|\?)/.exec(new URL(f.url).pathname)?.[1]?.toLowerCase() ?? "";
            const mime = f.mime.startsWith("image/") && f.mime !== "image/svg+xml" ? f.mime : EXT_MIME[ext];
            if (!mime) throw new Error(`δεν είναι εικόνα (${f.mime || "άγνωστος τύπος"})`);
            const name = decodeURIComponent(new URL(f.url).pathname.split("/").pop() || `${t.kind}-${k + 1}`).slice(0, 120);
            const img = await uploadProductImage(r.productId, { bytes: f.bytes, filename: name, mime }, staffId, t.kind as ProductMediaKind);
            await db.media.update({ where: { id: img.id }, data: { importFile: v.url, source: "excel" } });
            ids.push(img.id); done.push(t.kind === "image" ? "φωτογραφία" : "banner");
          } catch (e) { failed.push(`${t.kind === "image" ? "Φωτογραφία" : "Banner"} ${k + 1}: ${(e as Error).message}`); }
        }
      }
      if (replace && ids.length) {
        await db.media.updateMany({ where: { id: { in: ids } }, data: { hidden: false } });
        await db.media.updateMany({ where: { productId: r.productId, kind: t.kind, hidden: false, id: { notIn: ids } }, data: { hidden: true } });
        await reorderImages(r.productId, ids);
      }
    }
    const tally = (w: string) => done.filter((x) => x === w).length;
    const summary = [["φωτογραφία", "φωτογραφίες"], ["banner", "banners"], ["βίντεο", "βίντεο"]].map(([one, many]) => { const n = tally(one); return n ? `${n} ${n === 1 ? one : many}` : ""; }).filter(Boolean).join(", ");
    out.push({ key: r.key, ok: !failed.length || done.length > 0, productId: r.productId, message: `${summary ? `Προστέθηκαν: ${summary}.` : replace ? "Η σειρά ενημερώθηκε." : "Τίποτα νέο."}${failed.length ? ` Δεν πέρασαν: ${failed.join(" · ")}` : ""}` });
  }
  return out;
}

const MAX_VIDEO = 300 * 1024 * 1024;

/**
 * Ένα βίντεο στο Bunny. Αρχείο (.mp4 / .webm): κατεβαίνει, γίνεται MP4 για web, παίρνει αφίσα και ανεβαίνει στη
 * βιβλιοθήκη. YouTube / Vimeo: το ίδιο το βίντεο μένει ενσωμάτωση (οι όροι τους δεν επιτρέπουν λήψη), αλλά η μικρογραφία
 * ανεβαίνει στο Bunny — έτσι η σελίδα δεν φορτώνει τίποτα από αυτούς πριν πατήσει ο πελάτης «play».
 */
export async function importVideo(productId: string, title: string, v: { raw: string; url: string; thumb?: string | null }, sortNo: number, staffId: string | null): Promise<string> {
  const ref = parseVideoUrl(v.url)!;
  const folderId = await productFolderId();
  if (ref.provider === "file") {
    const f = await fetchPublicBytes(v.url, { max: MAX_VIDEO, accept: "video/mp4,video/webm,video/*;q=0.8", timeoutMs: 120_000 });
    const mime = VIDEO_MIMES.includes(f.mime) ? f.mime : /\.webm$/i.test(v.url) ? "video/webm" : "video/mp4";
    const web = await toWebMp4(f.bytes);
    const base = decodeURIComponent(new URL(f.url).pathname.split("/").pop() || "video").replace(/\.\w+$/, "").slice(0, 100);
    const asset = await ingest({ bytes: web ?? f.bytes, filename: `${base}.${web ? "mp4" : mime === "video/webm" ? "webm" : "mp4"}`, mime: web ? "video/mp4" : mime, folderId, createdBy: staffId, title: `${title} — βίντεο` });
    if (asset.kind !== "video") throw new Error("Το αρχείο δεν είναι βίντεο.");
    const m = await db.media.create({ data: { productId, kind: "video", url: asset.url, thumbUrl: asset.thumbUrl, width: asset.width, height: asset.height, blur: asset.blur, assetId: asset.id, sortNo, source: "excel", importFile: v.url, alt: `${title} — βίντεο` }, select: { id: true } });
    return m.id;
  }
  let poster: string | null = null;
  const thumbSrc = ref.provider === "youtube" ? `https://i.ytimg.com/vi/${ref.id}/maxresdefault.jpg` : null;
  const candidates = ref.provider === "youtube" ? [thumbSrc!, ref.thumb!] : [await vimeoThumb(ref.url)].filter((x): x is string => !!x);
  for (const src of candidates) {
    try {
      const f = await fetchPublicBytes(src, { max: 10 * 1024 * 1024, accept: "image/*" });
      if (!f.mime.startsWith("image/") || f.bytes.length < 5000) continue; // το YouTube δίνει γκρι 120 px όταν δεν υπάρχει maxres
      const asset = await ingest({ bytes: f.bytes, filename: `${ref.provider}-${ref.id}.jpg`, mime: f.mime, folderId, createdBy: staffId, title: `${title} — αφίσα βίντεο` });
      poster = asset.url; break;
    } catch { /* δοκιμάζουμε την επόμενη */ }
  }
  const m = await db.media.create({ data: { productId, kind: "video", url: ref.url, thumbUrl: poster, sortNo, source: "excel", importFile: v.raw, alt: `${title} — βίντεο` }, select: { id: true } });
  return m.id;
}

async function vimeoThumb(url: string): Promise<string | null> {
  try {
    const f = await fetchPublicBytes(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=1280`, { max: 200_000, accept: "application/json" });
    return (JSON.parse(f.bytes.toString("utf8")) as { thumbnail_url?: string }).thumbnail_url ?? null;
  } catch { return null; }
}
