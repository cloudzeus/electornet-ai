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

    const now = new Date();
    let created = 0, updated = 0;
    for (const h of heads) {
      const spcs = int(h[0]), mtrl = int(h[4]);
      if (spcs == null || mtrl == null) continue;
      const data = { code: h[1] ?? "", name: h[2] ?? "", active: h[3] === "1", mtrl, fromDate: date(h[5]), finalDate: date(h[6]), syncedAt: now };
      const had = await db.s1Set.findUnique({ where: { spcs }, select: { spcs: true } });
      await db.s1Set.upsert({ where: { spcs }, create: { spcs, ...data }, update: data });
      if (had) updated++; else created++;
      const ls = mine.filter((l) => int(l[0]) === spcs);
      for (const l of ls) {
        const lineNum = int(l[1]), m = int(l[2]);
        if (lineNum == null || m == null) continue;
        const d = { mtrl: m, qty: num(l[3]) || 1, code: info.get(m)?.code ?? null, name: info.get(m)?.name ?? String(m), stockCentral: Math.max(0, Math.round((stock.get(m) ?? 0) * 100) / 100) };
        await db.s1SetLine.upsert({ where: { spcs_lineNum: { spcs, lineNum } }, create: { spcs, lineNum, ...d }, update: d });
      }
      await db.s1SetLine.deleteMany({ where: { spcs, lineNum: { notIn: ls.map((l) => int(l[1])).filter((x): x is number => x != null) } } });
    }
    // sets που δεν υπάρχουν πια στο SoftOne
    const gone = await db.s1Set.deleteMany({ where: { spcs: { notIn: [...ids] } } });
    return { fetched: heads.length + mine.length, created, updated, missing: gone.count, skipped: 0 };
  });
}

/** Απόθεμα του set = πόσα πλήρη sets βγαίνουν (το μικρότερο floor(απόθεμα / ποσότητα) των μελών). Μόνο ενεργά sets. */
export async function projectSetStock(): Promise<number> {
  return db.$executeRawUnsafe(`
    UPDATE "Product" p SET stock = x.s
    FROM (
      SELECT s.mtrl, MIN(GREATEST(0, floor(l."stockCentral" / NULLIF(l.qty, 0))))::int AS s
      FROM "S1Set" s JOIN "S1SetLine" l ON l.spcs = s.spcs
      WHERE s.active AND (s."finalDate" IS NULL OR s."finalDate" >= now())
      GROUP BY s.spcs, s.mtrl
    ) x
    WHERE p."erpCode" = x.mtrl::text AND p.stock IS DISTINCT FROM x.s`);
}
