import "server-only";
import { db } from "@/lib/db";
import { listGroups, searchProducts, getProduct, getNestedLabelSvg, labelUrl, ficheUrl, fetchPublicFile, EprelError, type EprelRaw, type SearchOpts } from "./client";
import { toRow, normalizeModel } from "./normalize";
import { GROUP_NAMES_EL, RETAIL_GROUPS } from "./fields";
import { ingest } from "@/lib/media/repo";
import type { Prisma } from "@prisma/client";

/**
 * Συγχρονισμός EPREL → δικά μας μοντέλα.
 *
 * Δεν κατεβάζουμε ολόκληρο το μητρώο (εκατομμύρια μοντέλα)· φέρνουμε ό,τι
 * πουλάμε, με αναζήτηση κωδικού μοντέλου + μάρκας, και το κρατάμε με όλα του
 * τα τεχνικά. Η ετικέτα και το δελτίο πληροφοριών αντιγράφονται στο δικό μας
 * CDN ώστε η σελίδα προϊόντος να μην εξαρτάται από τη διαθεσιμότητα του EPREL.
 */
const FOLDER = "EPREL";

async function run<T>(kind: string, trigger: string, fn: () => Promise<T & { fetched?: number; created?: number; updated?: number; meta?: unknown }>) {
  const t0 = Date.now();
  try {
    const r = await fn();
    await db.eprelSyncRun.create({ data: { kind, trigger, ok: true, fetched: r.fetched ?? 0, created: r.created ?? 0, updated: r.updated ?? 0, ms: Date.now() - t0, meta: (r.meta ?? undefined) as Prisma.InputJsonValue | undefined } });
    return { ok: true as const, ...r };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.eprelSyncRun.create({ data: { kind, trigger, ok: false, ms: Date.now() - t0, error } });
    return { ok: false as const, error };
  }
}

/** Ομάδες προϊόντων. Νέες ομάδες μπαίνουν ενεργές μόνο αν είναι στη λίστα λιανικής. */
export async function syncGroups(trigger = "manual") {
  return run("groups", trigger, async () => {
    const groups = await listGroups();
    let created = 0, updated = 0;
    for (const g of groups) {
      const existing = await db.eprelProductGroup.findUnique({ where: { code: g.code }, select: { code: true } });
      await db.eprelProductGroup.upsert({
        where: { code: g.code },
        update: { urlCode: g.url_code, name: g.name, regulation: g.regulation ?? null, syncedAt: new Date() },
        create: { code: g.code, urlCode: g.url_code, name: g.name, regulation: g.regulation ?? null, active: RETAIL_GROUPS.has(g.code) },
      });
      if (existing) updated++; else created++;
    }
    return { fetched: groups.length, created, updated };
  });
}

export async function groupsWithCounts() {
  const [groups, counts] = await Promise.all([
    db.eprelProductGroup.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.eprelProduct.groupBy({ by: ["groupUrlCode"], _count: true }),
  ]);
  const byCode = new Map(counts.map((c) => [c.groupUrlCode, c._count]));
  return groups.map((g) => ({ ...g, nameEl: GROUP_NAMES_EL[g.code] ?? g.name, count: byCode.get(g.urlCode) ?? 0 }));
}

/** Αναζήτηση στο EPREL χωρίς αποθήκευση — για την οθόνη επιλογής. */
export async function search(urlCode: string, opts: SearchOpts) {
  try {
    const r = await searchProducts(urlCode, opts);
    return { ok: true as const, size: r.size, offset: r.offset, hits: r.hits.map((h) => ({ ...toRow(h), raw: h })) };
  } catch (e) {
    return { ok: false as const, error: e instanceof EprelError ? e.message : (e as Error).message, size: 0, offset: 0, hits: [] as never[] };
  }
}

/** Αποθήκευση ή ανανέωση μιας καταχώρισης με όλα της τα δεδομένα. */
export async function upsertFromRaw(raw: EprelRaw) {
  const row = toRow(raw);
  if (!row.registrationNumber || !row.groupUrlCode) throw new Error("Η εγγραφή δεν έχει αριθμό καταχώρισης ή ομάδα.");
  // Η ομάδα πρέπει να υπάρχει (FK) — αν λείπει, φέρε τις ομάδες.
  const g = await db.eprelProductGroup.findUnique({ where: { urlCode: row.groupUrlCode }, select: { urlCode: true } });
  if (!g) { await syncGroups("auto"); }
  const data = {
    ...row,
    labelSvgUrl: labelUrl(row.groupUrlCode, row.registrationNumber, "svg"),
    labelPngUrl: labelUrl(row.groupUrlCode, row.registrationNumber, "png"),
    labelPdfUrl: labelUrl(row.groupUrlCode, row.registrationNumber, "pdf"),
    ficheUrl: ficheUrl(row.groupUrlCode, row.registrationNumber, "EL"),
    data: raw as unknown as Prisma.InputJsonValue,
    fetchedAt: new Date(),
  };
  const existing = await db.eprelProduct.findUnique({ where: { registrationNumber: row.registrationNumber }, select: { registrationNumber: true, nestedLabelSvg: true } });
  const nested = existing?.nestedLabelSvg ?? (await getNestedLabelSvg(row.registrationNumber).catch(() => null));
  const saved = await db.eprelProduct.upsert({
    where: { registrationNumber: row.registrationNumber },
    update: { ...data, ...(nested ? { nestedLabelSvg: nested } : {}) },
    create: { ...data, nestedLabelSvg: nested },
  });
  return { saved, created: !existing };
}

/** Εισαγωγή με αριθμό καταχώρισης: φέρνει την πλήρη εγγραφή και την αποθηκεύει. */
export async function importProduct(registrationNumber: string, trigger = "manual") {
  return run("import", trigger, async () => {
    const raw = await getProduct(registrationNumber);
    const r = await upsertFromRaw(raw);
    return { fetched: 1, created: r.created ? 1 : 0, updated: r.created ? 0 : 1, product: r.saved, meta: { registrationNumber } };
  });
}

/** Ανανέωση όσων έχουμε (π.χ. νέα έκδοση ετικέτας, απόσυρση από την αγορά). */
export async function refreshAll(opts: { limit?: number; olderThanDays?: number } = {}, trigger = "manual") {
  return run("refresh", trigger, async () => {
    const before = new Date(Date.now() - (opts.olderThanDays ?? 30) * 86400000);
    const rows = await db.eprelProduct.findMany({ where: { fetchedAt: { lt: before } }, orderBy: { fetchedAt: "asc" }, take: opts.limit ?? 100, select: { registrationNumber: true } });
    let updated = 0; const failed: string[] = [];
    for (const r of rows) {
      try { await upsertFromRaw(await getProduct(r.registrationNumber)); updated++; } catch { failed.push(r.registrationNumber); }
    }
    return { fetched: rows.length, updated, meta: { failed } };
  });
}

async function folderId() {
  const f = await db.mediaFolder.findFirst({ where: { name: FOLDER, parentId: null }, select: { id: true } });
  return f?.id ?? (await db.mediaFolder.create({ data: { name: FOLDER } })).id;
}

/**
 * Αντίγραφα ετικέτας (SVG) και δελτίου (PDF, ελληνικά) στο δικό μας CDN μέσω
 * της βιβλιοθήκης πολυμέσων. Τα αρχεία είναι δημόσια έγγραφα της ΕΕ.
 */
export async function mirrorDocs(registrationNumber: string, staffId?: string, trigger = "manual") {
  return run("mirror", trigger, async () => {
    const p = await db.eprelProduct.findUnique({ where: { registrationNumber } });
    if (!p) throw new Error("Η καταχώριση δεν υπάρχει στη βάση.");
    const fid = await folderId();
    const patch: { labelAssetUrl?: string; ficheAssetUrl?: string } = {};
    const label = p.labelSvgUrl ? await fetchPublicFile(p.labelSvgUrl, "svg") : null;
    if (label) {
      const a = await ingest({ bytes: label.bytes, filename: `eprel-label-${registrationNumber}.svg`, mime: label.mime, folderId: fid, createdBy: staffId ?? null, keepFormat: true, title: `Ενεργειακή ετικέτα ${p.supplierOrTrademark} ${p.modelIdentifier}` });
      patch.labelAssetUrl = a.url;
    }
    const fiche = p.ficheUrl ? await fetchPublicFile(p.ficheUrl, "pdf") : null;
    if (fiche) {
      const a = await ingest({ bytes: fiche.bytes, filename: `eprel-fiche-${registrationNumber}-el.pdf`, mime: fiche.mime, folderId: fid, createdBy: staffId ?? null, title: `Δελτίο πληροφοριών ${p.supplierOrTrademark} ${p.modelIdentifier}` });
      patch.ficheAssetUrl = a.url;
    }
    if (Object.keys(patch).length) await db.eprelProduct.update({ where: { registrationNumber }, data: patch });
    return { fetched: 2, updated: Object.keys(patch).length, meta: { registrationNumber, label: !!label, fiche: !!fiche } };
  });
}

/**
 * Αντιστοίχιση προϊόντος του καταλόγου με καταχώριση EPREL. Ψάχνει με τον
 * κωδικό μοντέλου στις ενεργές ομάδες· δέχεται αυτόματα μόνο μοναδικό
 * αποτέλεσμα με ίδιο κωδικό (χωρίς κενά/παύλες) — αλλιώς επιστρέφει τους
 * υποψηφίους για επιλογή.
 */
export async function findByModel(model: string, brand?: string, groups?: string[]) {
  const wanted = normalizeModel(model);
  const active = groups?.length ? groups : (await db.eprelProductGroup.findMany({ where: { active: true }, select: { urlCode: true } })).map((g) => g.urlCode);
  const candidates: ReturnType<typeof toRow>[] = [];
  for (const urlCode of active) {
    try {
      const r = await searchProducts(urlCode, { limit: 20, filters: { modelIdentifier: `${model.trim()}*`, ...(brand ? { supplierOrTrademark: brand } : {}) } });
      for (const h of r.hits) candidates.push(toRow(h));
      if (candidates.length >= 40) break;
    } catch { /* ομάδα χωρίς αποτελέσματα ή σφάλμα — συνέχισε */ }
  }
  const exact = candidates.filter((c) => normalizeModel(c.modelIdentifier) === wanted);
  return { exact: exact.length === 1 ? exact[0] : null, candidates: [...exact, ...candidates.filter((c) => !exact.includes(c))].slice(0, 20) };
}

/** Δένει προϊόν του καταλόγου με καταχώριση EPREL μέσω του EnergyLabel. */
export async function linkProduct(productId: string, registrationNumber: string) {
  const p = await db.eprelProduct.findUnique({ where: { registrationNumber } });
  if (!p) throw new Error("Η καταχώριση δεν υπάρχει — κάνε πρώτα εισαγωγή.");
  const cls = p.energyClass ?? "";
  const scale = (p.energyClassRange ?? "A_G").replace(/PPP/g, "+++").replace(/PP/g, "++").replace(/P/g, "+").replace("_", "-");
  return db.energyLabel.upsert({
    where: { productId },
    update: { class: cls, scale, eprelId: registrationNumber, eprelRegistrationNumber: registrationNumber, labelUrl: p.labelAssetUrl ?? p.labelSvgUrl, ficheUrl: p.ficheAssetUrl ?? p.ficheUrl },
    create: { productId, class: cls, scale, eprelId: registrationNumber, eprelRegistrationNumber: registrationNumber, labelUrl: p.labelAssetUrl ?? p.labelSvgUrl, ficheUrl: p.ficheAssetUrl ?? p.ficheUrl },
  });
}

export async function eprelStats() {
  const [groups, active, products, mirrored, linked, lastRun] = await Promise.all([
    db.eprelProductGroup.count(),
    db.eprelProductGroup.count({ where: { active: true } }),
    db.eprelProduct.count(),
    db.eprelProduct.count({ where: { labelAssetUrl: { not: null } } }),
    db.energyLabel.count({ where: { eprelRegistrationNumber: { not: null } } }),
    db.eprelSyncRun.findFirst({ orderBy: { at: "desc" } }),
  ]);
  return { groups, active, products, mirrored, linked, lastRun };
}
