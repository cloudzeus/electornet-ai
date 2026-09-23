/**
 * Σετ ελέγχου του Ερμή: πραγματικές ερωτήσεις πελατών με ό,τι ΠΡΕΠΕΙ να ισχύει στην απάντηση. Κάθε αλλαγή στον μηχανισμό
 * (lib/advisor/engine.ts) μετριέται εδώ — όχι «μου φαίνεται καλύτερο». Ελέγχει και τη γείωση: κάθε προτεινόμενο προϊόν
 * υπάρχει στη βάση, με την τιμή που γράφει η βάση.
 *
 *   npx tsx --conditions=react-server scripts/eval-advisor.ts            # όλα
 *   npx tsx --conditions=react-server scripts/eval-advisor.ts --only 3   # μόνο η 3η, με πλήρη απάντηση
 */
import "dotenv/config";
import { db } from "../lib/db";
import { smartAdvisor, type Turn, type AdvisorState } from "../lib/advisor/engine";
import { defaultSettings } from "../lib/cms/settings";

interface Case { q: string; prev?: string; /** συζήτηση πολλών γύρων: οι προηγούμενες ερωτήσεις τρέχουν πρώτα και το νήμα περνά στην τελευταία */ turns?: string[]; sameAsShown?: boolean; type?: RegExp; maxPrice?: number; brand?: RegExp; title?: RegExp; maxW?: number; none?: boolean; text?: RegExp }
const CASES: Case[] = [
  { q: "θέλω ένα πλυντήριο ρούχων 9 κιλών μέχρι 500 ευρώ", type: /Πλυντήρια Ρούχων/, maxPrice: 500 },
  { q: "κάτι για να στεγνώνω τα ρούχα τον χειμώνα", type: /Στεγνωτήρια|αφυγραντ/i, title: /στεγνωτ/i }, // ο αφυγραντήρας είναι θεμιτή φθηνή εναλλακτική
  { q: "τηλεόραση 55 ιντσών oled", type: /Τηλεοράσεις/, title: /55/ },
  { q: "φθηνό κλιματιστικό 12000 btu με wifi", type: /Κλιματιστικά/ },
  { q: "ψυγειοκαταψύκτης no frost που να χωράει σε 60 εκατοστά πλάτος", type: /Ψυγειοκαταψύκτες/, maxW: 60 },
  { q: "ψυγείο samsung", type: /Ψυγ|Side by Side/, brand: /samsung/i },
  { q: "iphone 17 256gb", type: /Smartphones/, title: /iphone 17/i },
  { q: "laptop για φοιτητή έως 700€", type: /Laptop/, maxPrice: 700 },
  { q: "σκούπα stick για σπίτι με σκύλο", type: /Σκούπες Stick|Ηλεκτρικές Σκούπες/ },
  { q: "μηχανή espresso για αρχάριο", type: /Espresso/ },
  { q: "αθόρυβο πλυντήριο πιάτων εντοιχιζόμενο", type: /Πλυντήρια Πιάτων/ },
  { q: "κάτι φθηνότερο;", prev: "τηλεόραση 65 ιντσών", type: /Τηλεοράσεις/ },
  { q: "WGG254ZHGR", title: /WGG254/i },
  { q: "air fryer μεγάλη για οικογένεια", type: /Φριτέζες/ },
  { q: "ακουστικά bluetooth για τρέξιμο", type: /Handsfree|Ακουστικά/ },
  { q: "tablet για παιδί μέχρι 150 ευρώ", type: /Tablets/, maxPrice: 150 },
  { q: "πόσες δόσεις μπορώ να κάνω χωρίς κάρτα;", none: true, text: /δόσ/i },
  { q: "σε πόσες μέρες μπορώ να το επιστρέψω;", none: true, text: /14/ },
  { q: "ποιος θα κερδίσει το πρωτάθλημα φέτος;", none: true },
  { q: "καταψύκτης μπαούλο μικρός", type: /Καταψύκτες/ },
  { q: "φούρνος μικροκυμάτων με γκριλ", type: /μικροκυμάτων/i },
  { q: "θέλω το καλύτερο πλυντήριο ρούχων που έχετε", type: /Πλυντήρια Ρούχων/ },
  // συζητήσεις: η μνήμη και η συνέπεια είναι το ζητούμενο
  { turns: ["θέλω κλιματιστικό για σαλόνι 30 τετραγωνικά", "ναι inverter, να είναι οικονομικό στο ρεύμα"], q: "από αυτά ποιο είναι πιο αθόρυβο;", type: /Κλιματιστικά/, sameAsShown: true },
  { turns: ["κλιματιστικά toyotomi για σαλόνι 30 τετραγωνικά"], q: "από αυτά το φθηνότερο ποιο είναι;", type: /Κλιματιστικά/, brand: /toyotomi/i, sameAsShown: true },
  { turns: ["ψάχνω πλυντήριο για τετραμελή οικογένεια"], q: "τελικά μέχρι 400 ευρώ", type: /Πλυντήρια Ρούχων/, maxPrice: 400 },
  { turns: ["τηλεόραση για σαλόνι, κάθομαι 3 μέτρα μακριά"], q: "το πρώτο τι διαφορά έχει από το δεύτερο;", type: /Τηλεοράσεις/, sameAsShown: true },
  // expert: κλιματιστικά
  { q: "κλιματιστικό για ρετιρέ 25 τετραγωνικά με πολύ ήλιο", type: /Κλιματιστικά/, text: /18\.?000|ήλιο|ρετιρέ/i },
  { q: "θέλω κλιματιστικό που να ζεσταίνει καλά και τον χειμώνα, για 20 τμ", type: /Κλιματιστικά/, text: /SCOP|θέρμανσ/i },
  { turns: ["κλιματιστικό 12000 btu οικονομικό"], q: "πόσο ρεύμα θα μου καίει τον χρόνο;", type: /Κλιματιστικά/, text: /€|ευρώ|kWh/i },
  { turns: ["κλιματιστικό για υπνοδωμάτιο 12 τμ"], q: "τι περιλαμβάνει η εγκατάσταση;", text: /τεχνικ|σωλήν|εγκατάστασ/i },
  { turns: ["κλιματιστικό 18000 btu"], q: "τι σημαίνει το SEER που γράφει;", text: /SEER/ },
  // expert: τηλεοράσεις
  { q: "τηλεόραση 65 ιντσών για playstation 5", type: /Τηλεοράσεις/, text: /120|HDMI 2\.1|VRR/i },
  { q: "oled ή qled για φωτεινό σαλόνι;", type: /Τηλεοράσεις/, text: /φωτειν|QLED|Mini LED/i },
  { turns: ["τηλεόραση 55 ιντσών μέχρι 600 ευρώ"], q: "χωράει σε έπιπλο 110 εκατοστών;", type: /Τηλεοράσεις/, text: /εκ|cm|πλάτος/i },
  { turns: ["τηλεόραση 50 ιντσών για την κουζίνα"], q: "έχει κεραία ψηφιακή ή θέλω αποκωδικοποιητή;", text: /DVB|ψηφιακ|δέκτ/i },
];

async function main() {
  const only = process.argv.includes("--only") ? Number(process.argv[process.argv.indexOf("--only") + 1]) : null;
  const ctx = { name: defaultSettings.advisor.name, commerce: defaultSettings.site.commerce };
  let pass = 0, n = 0; const t00 = Date.now(); const before = await db.aiUsage.aggregate({ _sum: { costUsd: true } });
  for (const [k, c] of CASES.entries()) {
    if (only !== null && k + 1 !== only) continue;
    n++; const t0 = Date.now();
    // συζήτηση: τρέχουν οι προηγούμενοι γύροι και χτίζεται το νήμα, όπως το στέλνει ο browser
    const thread: Turn[] = []; let state: AdvisorState | null = null; const shownBefore: string[] = [];
    for (const tq of c.turns ?? []) { const r = await smartAdvisor({ q: tq, thread, shown: shownBefore, state }, ctx); thread.push({ role: "user", text: tq }); if (r) { thread.push({ role: "advisor", text: r.text, products: r.products.map((p) => p.id) }); state = r.state; shownBefore.push(...r.products.map((p) => p.id)); } }
    const a = await smartAdvisor({ q: c.q, prev: c.prev, thread, shown: shownBefore, state }, ctx);
    const ms = Date.now() - t0, fails: string[] = [];
    if (!a) fails.push("καμία απάντηση");
    else {
      const rows = await db.product.findMany({ where: { id: { in: a.products.map((p) => p.id) } }, select: { id: true, title: true, price: true, brand: { select: { name: true } }, category: { select: { name: true } }, dimensions: { select: { w: true, source: true } } } });
      if (rows.length !== a.products.length) fails.push("προϊόν εκτός βάσης");
      if (c.none && a.products.length) fails.push(`δεν έπρεπε να προτείνει προϊόντα (${a.products.length})`);
      if (!c.none && !a.products.length) fails.push("κανένα προϊόν");
      for (const p of a.products) {
        const r = rows.find((x) => x.id === p.id); if (!r) continue;
        if ((r.price ?? 0) !== p.price && !(p.price === 0 && !r.price)) fails.push(`τιμή ≠ βάση (${p.price} / ${r.price})`);
        if (c.type && !c.type.test(r.category.name)) fails.push(`λάθος τύπος: ${r.category.name}`);
        if (c.maxPrice && p.price > c.maxPrice * 1.15) fails.push(`πάνω από προϋπολογισμό: ${p.price}`);
        if (c.brand && !c.brand.test(r.brand.name)) fails.push(`λάθος μάρκα: ${r.brand.name}`);
        if (c.maxW && r.dimensions.length && Math.min(...r.dimensions.map((d) => d.w)) > c.maxW) fails.push(`πλάτος > ${c.maxW}`);
      }
      if (c.sameAsShown && a.products.some((p) => !shownBefore.includes(p.id))) fails.push("έφερε άλλα προϊόντα αντί για τα ήδη δειγμένα");
      if (c.title && !a.products.some((p) => c.title!.test(`${p.brand} ${p.title}`))) fails.push(`κανένα με «${c.title.source}»`);
      if (c.text && !c.text.test(a.text)) fails.push(`η απάντηση δεν περιέχει «${c.text.source}»`);
    }
    if (!fails.length) pass++;
    console.log(`${fails.length ? "✗" : "✓"} ${String(k + 1).padStart(2)} ${(ms / 1000).toFixed(1)}s  ${c.turns ? c.turns.join(" → ") + " → " : ""}${c.q}${fails.length ? `\n      → ${[...new Set(fails)].join(" · ")}` : ""}`);
    if (only !== null || fails.length) { console.log(`      κατάλαβε: ${a?.understood.join(" · ")}`); console.log(`      ${a?.text}`); for (const p of a?.products ?? []) console.log(`      • ${p.brand} ${p.title.slice(0, 50)} — ${p.price} € — ${p.why}`); }
  }
  await new Promise((r) => setTimeout(r, 2500)); // η καταγραφή χρήσης του Ερμή γράφεται στο παρασκήνιο
  const after = await db.aiUsage.aggregate({ _sum: { costUsd: true } });
  console.log(`\n${pass}/${n} · ${((Date.now() - t00) / 1000 / Math.max(1, n)).toFixed(1)} s ανά ερώτηση · κόστος $${((after._sum.costUsd ?? 0) - (before._sum.costUsd ?? 0)).toFixed(4)}`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
