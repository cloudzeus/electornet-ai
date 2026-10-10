import "server-only";
import { db } from "@/lib/db";
import { getTable } from "@/lib/softone/lookups";
import { CENTRAL_WAREHOUSES, logged, type Trigger } from "@/lib/softone/catalog";

/**
 * «Set ειδών» του SoftOne → καθρέφτης `S1Set` / `S1SetLine`. Μόνο αναγνώσεις (GetTable):
 * - SPCS (SODTYPE=70): κεφαλίδα — κωδικός, όνομα, ενεργό, κύριο είδος (MTRL), ημερομηνίες ισχύος
 * - SPCLINES: μέλη — είδος, ποσότητα
 * - MTRL: κωδικός και όνομα των μελών (τα περισσότερα — π.χ. εξωτερικές μονάδες — δεν είναι στον κατάλογο του site)
 * - MTRBALSHEET: υπόλοιπο κεντρικών αποθηκών (1, 10) κάθε μέλους, για το απόθεμα του set (= το μικρότερο των μελών)
 * Η ετικέτα «Περιλαμβάνει» (`label`) είναι της διαχείρισης και δεν αλλάζει από εδώ.
 */
const int = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) && v !== "" ? Math.trunc(n) : null; };
const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const date = (v: string | undefined) => (v ? new Date(v.replace(" ", "T")) : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function syncSets(trigger: Trigger = "manual") {
  return logged("cat-sets", trigger, async () => {
    const heads = await getTable("SPCS", ["SPCS", "CODE", "NAME", "ISACTIVE", "MTRL", "FROMDATE", "FINALDATE"], "SODTYPE=70");
    const lines = await getTable("SPCLINES", ["SPCS", "LINENUM", "MTRL", "QTY1"], "");
    const ids = new Set(heads.map((h) => int(h[0])).filter((x): x is number => x != null));
    const mine = lines.filter((l) => ids.has(int(l[0]) ?? -1));
    const mtrls = [...new Set(mine.map((l) => int(l[2])).filter((x): x is number => x != null))].sort((a, b) => a - b);

    // ονόματα και απόθεμα μελών, σε κομμάτια (μικρές αναγνώσεις)
    const info = new Map<number, { code: string; name: string }>();
    const stock = new Map<number, number>();
    const year = new Date().getFullYear();
    for (let i = 0; i < mtrls.length; i += 300) {
      const part = mtrls.slice(i, i + 300), list = part.join(",");
      const [names, bal] = await Promise.all([
        getTable("MTRL", ["MTRL", "CODE", "NAME"], `MTRL IN (${list})`),
        getTable("MTRBALSHEET", ["MTRL", "WHOUSE", "IMPQTY1", "EXPQTY1"], `FISCPRD=${year} AND MTRL IN (${list}) AND WHOUSE IN (${CENTRAL_WAREHOUSES.join(",")})`),
      ]);
      for (const r of names) { const m = int(r[0]); if (m != null) info.set(m, { code: r[1] ?? "", name: r[2] ?? "" }); }
      for (const r of bal) { const m = int(r[0]); if (m != null) stock.set(m, (stock.get(m) ?? 0) + num(r[2]) - num(r[3])); }
      await sleep(250);
    }

    // μαζικές εγγραφές σε μία συναλλαγή (η βάση είναι απομακρυσμένη: μία-μία θα ήθελαν λεπτά). Οι ετικέτες «Περιλαμβάνει»
    // της διαχείρισης κρατιούνται ανά (set, γραμμή).
    const now = new Date();
    const setRows = heads.flatMap((h) => { const spcs = int(h[0]), mtrl = int(h[4]); return spcs == null || mtrl == null ? [] : [{ spcs, code: h[1] ?? "", name: h[2] ?? "", active: h[3] === "1", mtrl, fromDate: date(h[5]), finalDate: date(h[6]), syncedAt: now }]; });
    const lineRows = mine.flatMap((l) => { const spcs = int(l[0]), lineNum = int(l[1]), m = int(l[2]); return spcs == null || lineNum == null || m == null ? [] : [{ spcs, lineNum, mtrl: m, qty: num(l[3]) || 1, code: info.get(m)?.code ?? null, name: info.get(m)?.name ?? String(m), stockCentral: Math.max(0, Math.round((stock.get(m) ?? 0) * 100) / 100) }]; });
    const before = new Set((await db.s1Set.findMany({ select: { spcs: true } })).map((x) => x.spcs));
    const labels = new Map((await db.s1SetLine.findMany({ where: { label: { not: null } }, select: { spcs: true, lineNum: true, label: true } })).map((x) => [`${x.spcs}:${x.lineNum}`, x.label]));
    const keep = setRows.map((x) => x.spcs);
    const [gone] = await db.$transaction([
      db.s1Set.deleteMany({ where: { spcs: { notIn: keep } } }),
      db.s1SetLine.deleteMany({ where: { spcs: { in: keep } } }),
      db.s1Set.deleteMany({ where: { spcs: { in: keep } } }),
      db.s1Set.createMany({ data: setRows }),
      db.s1SetLine.createMany({ data: lineRows.map((x) => ({ ...x, label: labels.get(`${x.spcs}:${x.lineNum}`) ?? null })) }),
    ]);
    const created = keep.filter((x) => !before.has(x)).length, updated = keep.length - created;
    return { fetched: heads.length + mine.length, created, updated, missing: gone.count, skipped: 0 };
  });
}

/**
 * Sets «εξαρτημάτων»: κανένα άλλο μέλος δεν πωλείται χωριστά στο site (π.χ. εξωτερική μονάδα κλιματιστικού). Μόνο σε αυτά
 * το απόθεμα του προϊόντος = όσα πλήρη sets βγαίνουν από τα μέλη. Sets «με δώρο» (το μέλος είναι κανονικό προϊόν, π.χ.
 * ψυγείο + σκούπα, ή «+ ΔΩΡΟ» στο όνομα) δεν αγγίζουν το απόθεμα — το κύριο προϊόν πουλιέται και μόνο του.
 */
const PARTS_SETS = `
  SELECT s.spcs, s.mtrl FROM "S1Set" s
  WHERE s.active AND (s."finalDate" IS NULL OR s."finalDate" >= now())
    AND s.name !~* 'δ[ωώ]ρ'
    AND NOT EXISTS (SELECT 1 FROM "S1SetLine" l JOIN "Product" p ON p."erpCode" = l.mtrl::text AND p.active WHERE l.spcs = s.spcs AND l.mtrl <> s.mtrl)`;

/** Απόθεμα προϊόντων-set (μόνο «εξαρτήματα»): το καλύτερο από τα sets του προϊόντος, καθένα = το μικρότερο floor(απόθεμα / ποσότητα) των μελών. */
export async function projectSetStock(): Promise<number> {
  return db.$executeRawUnsafe(`
    UPDATE "Product" p SET stock = a.s
    FROM (
      SELECT x.mtrl, MAX(x.s)::int AS s FROM (
        SELECT ps.spcs, ps.mtrl, MIN(GREATEST(0, floor(l."stockCentral" / NULLIF(l.qty, 0)))) AS s
        FROM (${PARTS_SETS}) ps JOIN "S1SetLine" l ON l.spcs = ps.spcs
        GROUP BY ps.spcs, ps.mtrl) x
      GROUP BY x.mtrl
    ) a
    WHERE p."erpCode" = a.mtrl::text AND p.stock IS DISTINCT FROM a.s`);
}
