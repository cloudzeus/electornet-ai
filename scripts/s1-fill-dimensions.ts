/**
 * Μαζική συμπλήρωση διαστάσεων στο SoftOne (CCCWIDTH / CCCHEIGHT / CCCLENGTH) από τη γραμμή «Διαστάσεις …» της
 * αναλυτικής περιγραφής κάθε είδους — όπως τη διάβασε και τη διόρθωσε ήδη η προβολή (ProductDimension, source s1-desc:
 * εκατοστά, Π×Υ×Β, διόρθωση μονάδας/αξόνων).
 *
 *   npx tsx --conditions=react-server scripts/s1-fill-dimensions.ts            # δοκιμή: τι θα γραφτεί, χωρίς εγγραφή
 *   npx tsx --conditions=react-server scripts/s1-fill-dimensions.ts --apply --limit 20
 *   npx tsx --conditions=react-server scripts/s1-fill-dimensions.ts --apply    # όλα
 *
 * Κανόνες (το ERP είναι σε παραγωγή):
 * - μόνο είδη με ΚΕΝΑ και τα τρία πεδία στο SoftOne — ελέγχεται ξανά με ανάγνωση ακριβώς πριν από την εγγραφή·
 * - μόνο διαστάσεις χωρίς προειδοποίηση (εντός ορίων του τύπου)· οι υπόλοιπες μένουν για έλεγχο από άνθρωπο·
 * - μόνο γραμμές που λένε ΡΗΤΑ τους άξονες («(ΥxΠxΒ)», «Π445 x Υ538», «πλάτος/ύψος/βάθος»). Οι γραμμές με σκέτους αριθμούς
 *   («85 X 73 X 52,3 cm») έχουν σειρά που μαντεύτηκε από τα όρια του τύπου — μόνο με `--all-axes`, μετά από έλεγχο·
 * - εγγραφή μόνο των τριών πεδίων (setData ITEM), επαλήθευση με νέα ανάγνωση, ενημέρωση του καθρέφτη·
 * - μικρές παρτίδες με παύση· σταματά μόνο του μετά από 5 συνεχόμενα σφάλματα· ξανατρέχει χωρίς διπλοεγγραφές.
 */
import { db } from "../lib/db";
import { s1 } from "../lib/softone";
import { getTable } from "../lib/softone/lookups";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const PAUSE_MS = 150, BATCH = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (n: number) => Math.round(n * 10) / 10;
const empty = (v: string | undefined) => !v || !Number(String(v).replace(",", "."));
const allAxes = process.argv.includes("--all-axes");
/** Η γραμμή λέει ποιος αριθμός είναι ποιος άξονας; */
const explicitAxes = (s: string) => /[ΥYΠΒBMΜ]\s*[xχ×X*·\/]\s*[ΥYΠΒBMΜ]|(^|[\s(:])[ΠΥΒ]\s*\d|ΥΠΒ|ΠΥΒ|ΠΒΥ/i.test(s) || /πλάτος|ύψος|βάθος|μήκος|width|height|depth/i.test(s);

(async () => {
  const [items, dims] = await Promise.all([
    db.s1Item.findMany({ where: { missing: false }, select: { mtrl: true, widthCm: true, heightCm: true, lengthCm: true } }),
    db.productDimension.findMany({ where: { source: "s1-desc", warning: null }, select: { w: true, h: true, d: true, rawKey: true, rawValue: true, product: { select: { erpCode: true } } } }),
  ]);
  const dimOf = new Map(dims.map((d) => [d.product.erpCode, d]));
  const todo = items.filter((i) => !i.widthCm && !i.heightCm && !i.lengthCm && dimOf.has(String(i.mtrl))).map((i) => ({ mtrl: i.mtrl, ...dimOf.get(String(i.mtrl))! }))
    .filter((t) => allAxes || explicitAxes(`${t.rawKey ?? ""} ${t.rawValue ?? ""}`)).slice(0, limit);
  console.log(`${apply ? "ΕΓΓΡΑΦΗ" : "ΔΟΚΙΜΗ (χωρίς εγγραφή)"} — ${todo.length} είδη με κενές διαστάσεις στο SoftOne και καθαρή γραμμή διαστάσεων στην περιγραφή${allAxes ? "" : " με ρητούς άξονες"}`);
  if (!apply) {
    for (const t of todo.slice(0, 12)) console.log(`  MTRL ${t.mtrl}: «${t.rawKey}: ${t.rawValue}» → Π ${r1(t.w)} · Υ ${r1(t.h)} · Β ${r1(t.d)} εκ.`);
    await db.$disconnect(); return;
  }

  const run = await db.s1SyncRun.create({ data: { kind: "cat-dims-write", trigger: "script" } });
  let written = 0, skipped = 0, failed = 0, streak = 0;
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    // ανάγνωση ακριβώς πριν: γράφουμε μόνο όπου είναι ακόμη κενά
    const now = await getTable("MTRL", ["MTRL", "CCCWIDTH", "CCCHEIGHT", "CCCLENGTH"], `MTRL IN (${part.map((p) => p.mtrl).join(",")})`);
    const cur = new Map(now.map((r) => [Number(r[0]), r]));
    const done: { mtrl: number; w: number; h: number; d: number }[] = [];
    for (const t of part) {
      const c = cur.get(t.mtrl);
      if (!c || !empty(c[1]) || !empty(c[2]) || !empty(c[3])) { skipped++; continue; }
      const row = { CCCWIDTH: r1(t.w), CCCHEIGHT: r1(t.h), CCCLENGTH: r1(t.d) };
      const res = await s1("setData", { OBJECT: "ITEM", KEY: String(t.mtrl), data: { ITEM: [row] } }).catch((e: Error) => ({ success: false, error: e.message }));
      if (!res?.success) { failed++; streak++; console.log(`  ✗ MTRL ${t.mtrl}: ${res?.error ?? "άγνωστο σφάλμα"}`); if (streak >= 5) { console.log("5 συνεχόμενα σφάλματα — σταματώ."); i = todo.length; break; } continue; }
      streak = 0; done.push({ mtrl: t.mtrl, w: row.CCCWIDTH, h: row.CCCHEIGHT, d: row.CCCLENGTH });
      await sleep(PAUSE_MS);
    }
    // επαλήθευση της παρτίδας με μία ανάγνωση
    if (done.length) {
      const back = new Map((await getTable("MTRL", ["MTRL", "CCCWIDTH", "CCCHEIGHT", "CCCLENGTH"], `MTRL IN (${done.map((d) => d.mtrl).join(",")})`)).map((r) => [Number(r[0]), r]));
      for (const d of done) {
        const b = back.get(d.mtrl);
        const ok = b && r1(Number(b[1])) === d.w && r1(Number(b[2])) === d.h && r1(Number(b[3])) === d.d;
        if (!ok) { failed++; console.log(`  ✗ MTRL ${d.mtrl}: γράφτηκε αλλά η ανάγνωση έδωσε ${b?.slice(1).join(" × ") ?? "—"}`); continue; }
        await db.s1Item.update({ where: { mtrl: d.mtrl }, data: { widthCm: d.w, heightCm: d.h, lengthCm: d.d } });
        written++;
      }
    }
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length} · γράφτηκαν ${written} · παραλείφθηκαν ${skipped} · σφάλματα ${failed} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await db.s1SyncRun.update({ where: { id: run.id }, data: { ok: failed === 0, fetched: todo.length, updated: written, skipped, ms: Date.now() - t0, error: failed ? `${failed} αποτυχίες` : null } });
  console.log(`Τέλος: γράφτηκαν ${written}, παραλείφθηκαν ${skipped} (είχαν ήδη διαστάσεις), σφάλματα ${failed}.`);
  await db.$disconnect();
})();
