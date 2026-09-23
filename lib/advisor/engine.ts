import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { catalogTree, dbProductsByIds, hrefOf, LISTED, type CatNode } from "@/lib/data/db-catalog";
import { searchVector } from "@/lib/vector/index";
import { dimsFor, fitMattersFor } from "@/lib/data/dims";
import { fitVerdict, type MySpace } from "@/lib/space/fit";
import type { Product } from "@/lib/data/types";
import type { AdvisorAnswer } from "./answer";

/**
 * Ο Ερμής πάνω στον πραγματικό κατάλογο. Το LLM ΔΕΝ «ξέρει» προϊόντα: καταλαβαίνει τη συζήτηση, ερευνά και εξηγεί —
 * τα προϊόντα, οι τιμές, το απόθεμα και τα χαρακτηριστικά έρχονται ΜΟΝΟ από τη βάση μας.
 *
 * Μία ΣΥΖΗΤΗΣΗ, όχι ανεξάρτητες ερωτήσεις: ο πελάτης στέλνει το νήμα (τι είπε, τι απάντησε ο Ερμής, ποια προϊόντα του
 * δείχτηκαν) και τη συσσωρευμένη κατάσταση. «Από αυτά ποιο είναι πιο αθόρυβο;» απαντιέται πάνω σε ΑΥΤΑ, «το Toyotomi που
 * είδα» βρίσκεται στα ήδη δειγμένα, οι απαιτήσεις («30 τ.μ.», «οικονομικό») κρατιούνται γύρο με γύρο.
 *
 *   1. understand  (γρήγορο)  νήμα + κατάσταση → νέες συνολικές απαιτήσεις, τύποι από τη λίστα, εστίαση (νέα έρευνα ή τα δειγμένα)
 *   2. mapNeeds    (γρήγορο)  ανάγκες → ΤΙΜΕΣ φίλτρων που έχει όντως ο τύπος
 *   3. retrieve    (βάση)     φίλτρα SQL + pgvector → έως 30 υποψήφια με σύντομο δελτίο
 *   4. shortlist   (γρήγορο)  έρευνα: από τα 30 κρατά ≤ 6 με αιτιολογία — εδώ μπαίνει η τεχνογνωσία (τ.μ. → BTU, άτομα → κιλά)
 *   5. compose     (κύριο)    ΠΛΗΡΕΣ δελτίο των 6 (όλη η περιγραφή, φίλτρα, ετικέτα, διαστάσεις) → έως 3 με τεκμηρίωση
 *
 * Κάθε βήμα έχει ντετερμινιστική εφεδρεία. Χωρίς κατάλογο στη βάση επιστρέφει null (ο καλών πέφτει στο demo).
 */
export interface Turn { role: "user" | "advisor"; text: string; products?: string[] }
export interface AdvisorState { types: number[]; typeNames: string[]; brands: string[]; minPrice: number | null; maxPrice: number | null; maxWidth: number | null; maxHeight: number | null; maxDepth: number | null; inStockOnly: boolean; needs: string[]; priority: "price" | "quality" | "energy" | "quiet" | null; sizing: string | null }
export interface AdvisorInput { q: string; thread?: Turn[]; shown?: string[]; state?: AdvisorState | null; prev?: string; space?: MySpace | null; pid?: string }
export interface AdvisorContext { name: string; /** τιμή kWh για εκτίμηση κόστους λειτουργίας */ kwhPrice?: number; commerce: { freeShippingFrom: number; returnDays: number; warrantyYears: number; maxInstalments: number; noCardInstalments: { min: number; max: number; months: number }; codMax: number; codFee: number; clickCollectHours: number } }
export type AdvisorReply = AdvisorAnswer & { state: AdvisorState; shown: string[] };

/** Τα βήματα κατανόησης και έρευνας θέλουν ταχύτητα, όχι ευγλωττία: μικρό γρήγορο μοντέλο (αλλάζει με ADVISOR_ROUTER_MODEL). Η απάντηση γράφεται από το κύριο. */
const ROUTER = process.env.ADVISOR_ROUTER_MODEL || "google/gemini-3.5-flash-lite";
/** Η απάντηση: ρητό, δοκιμασμένο μοντέλο — ο αυτόματος δρομολογητής του OpenRouter επιστρέφει πότε-πότε κενό σε δομημένο JSON. */
const WRITER = process.env.ADVISOR_MODEL || "google/gemini-3.8-flash";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ");
const clean = (label: string) => label.replace(/\s*\([^)]*\)/, "").trim();
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 2 })} €`;
const EMPTY_STATE: AdvisorState = { types: [], typeNames: [], brands: [], minPrice: null, maxPrice: null, maxWidth: null, maxHeight: null, maxDepth: null, inStockOnly: false, needs: [], priority: null, sizing: null };

/**
 * Τεχνογνωσία πωλητή — ΟΧΙ δεδομένα προϊόντων: πώς μεταφράζεται η ανάγκη σε μέγεθος. Το μοντέλο τη χρησιμοποιεί για να
 * ζητήσει τα σωστά φίλτρα και να κρίνει τα υποψήφια, ποτέ για να «θυμηθεί» προϊόντα.
 */
const EXPERTISE = `ΤΕΧΝΟΓΝΩΣΙΑ ΠΩΛΗΤΗ (Ελλάδα) — για διαστασιολόγηση και για να ΕΞΗΓΕΙΣ τι σημαίνει κάθε νούμερο· ποτέ για να «θυμηθείς» προϊόντα
ΚΛΙΜΑΤΙΣΤΙΚΑ
- Μέγεθος: ~350 BTU/τ.μ. σε κανονικό χώρο· +20–30 % σε ρετιρέ, νότιο, μεγάλα τζάμια, κακή μόνωση, ύψος οροφής > 3 μ. Έως 15 τ.μ. → 9.000 · 15–25 → 12.000 · 25–35 → 18.000 · 35–50 → 24.000. Μικρότερο από όσο πρέπει = δουλεύει συνέχεια στο φουλ και καίει· πολύ μεγαλύτερο = ανοιγοκλείνει και δεν αφυγραίνει.
- Inverter: ρυθμίζει την ισχύ αντί να ανοιγοκλείνει → 30–50 % λιγότερο ρεύμα, σταθερή θερμοκρασία, πιο αθόρυβο. Σήμερα σχεδόν όλα είναι inverter.
- Οικονομία: κλάση ΨΥΞΗΣ (A+++ κορυφή) και SEER (όσο ψηλότερο τόσο καλύτερο: 6,1 = A++, 8,5+ = A+++). Για ΘΕΡΜΑΝΣΗ τον χειμώνα μετράει το SCOP (4,0 = A+, 4,6 = A++, 5,1+ = A+++) και η κλάση θέρμανσης — ένα καλό inverter θερμαίνει 3–4 φορές φθηνότερα από ηλεκτρική θερμάστρα ίδιας απόδοσης.
- Κόστος λειτουργίας: kWh τον χρόνο (ετήσια κατανάλωση ψύξης / θέρμανσης από την ετικέτα) × τιμή kWh = € τον χρόνο. Αν λείπει, εκτίμηση: (BTU ÷ 3.412) ÷ SEER × ώρες χρήσης.
- Θόρυβος: ηχητική ισχύς ή στάθμη εσωτερικής μονάδας σε dB· 19–25 dB στο χαμηλό = ψίθυρος (υπνοδωμάτιο), 35–45 = ήσυχο δωμάτιο, 50+ = συζήτηση. Η ΕΞΩΤΕΡΙΚΗ μονάδα (50–65 dB) ενδιαφέρει τον γείτονα και το μπαλκόνι.
- Λειτουργίες που αξίζουν: Wi-Fi (άναμμα από το κινητό πριν φτάσεις), ιονιστής / φίλτρα (αλλεργίες), Follow me (αισθητήρας στο τηλεχειριστήριο), λειτουργία ύπνου, αυτοκαθαρισμός. Ψυκτικό R32 = το σύγχρονο, πιο οικολογικό.
- Εγκατάσταση: γίνεται από τεχνικό του καταστήματος· περιλαμβάνει συνήθως έως 3 μ. σωλήνα, βάσεις, τρύπα στον τοίχο· επιπλέον μέτρα, σκαλωσιά ή μετακίνηση παλιού χρεώνονται ξεχωριστά. Η εξωτερική μονάδα θέλει μπαλκόνι ή τοίχο με αέρα.
ΤΗΛΕΟΡΑΣΕΙΣ
- Μέγεθος: απόσταση θέασης σε μέτρα × 20–25 ≈ ίντσες (2 μ. → 43–50", 2,5 μ. → 55–65", 3 μ. → 65–75"). Στο 4K μπορείς να κάτσεις πιο κοντά χωρίς να φαίνονται pixel.
- Panel: OLED = τέλειο μαύρο, άπειρη αντίθεση, ιδανικό για σκοτεινό σαλόνι και ταινίες, πιο ακριβό· QLED / Mini LED = πολύ φωτεινό, καλύτερο για φωτεινό δωμάτιο και μέρα, ανθεκτικό· απλό LED (Direct LED / Edge) = οικονομικό, για δεύτερη τηλεόραση ή κουζίνα.
- Ανάλυση: 4K είναι το στάνταρ από 43" και πάνω· 8K μόνο σε πολύ μεγάλες, χωρίς 8K περιεχόμενο. HDR (Dolby Vision, HDR10+) = πιο ζωντανά χρώματα, κάνει διαφορά σε Netflix / Disney+.
- Gaming (PS5, Xbox, PC): 120 Hz φυσικός ρυθμός ανανέωσης + HDMI 2.1 + VRR / ALLM = ομαλή εικόνα χωρίς σκίσιμο· 60 Hz αρκεί για απλή χρήση.
- Smart: webOS (LG), Tizen (Samsung), Google TV / Android TV (Sony, TCL, Hisense, Philips) — όλα έχουν Netflix, YouTube, ERTflix· το Google TV έχει τα περισσότερα apps. Δέκτης DVB-T2 = ψηφιακή κεραία χωρίς αποκωδικοποιητή· DVB-S2 = δορυφορικό.
- Ήχος: 20 W = επαρκής για δωμάτιο· για σαλόνι / ταινίες αξίζει soundbar. Κατανάλωση: kWh ανά 1.000 ώρες (SDR) × ώρες × τιμή kWh = κόστος· μια 55" καίει περίπου 70–100 kWh/1.000 ώρες.
- Τοποθέτηση: VESA (π.χ. 300 × 300 mm) = ποια βάση τοίχου ταιριάζει· πλάτος με βάση για το έπιπλο.
- Πλυντήριο ρούχων: 1–2 άτομα → 6–7 kg · 3–4 → 8–9 kg · 5+ → 10 kg και πάνω. Αθόρυβο: ≤ 72 dB στο στύψιμο, μοτέρ inverter.
- Ψυγείο: 1–2 άτομα → 200–300 λίτρα · 3–4 → 300–400 · 5+ → 400+. No Frost = χωρίς απόψυξη.
- Τηλεόραση: απόσταση θέασης σε μέτρα × 20–25 ≈ ίντσες (2 μ. → 43–50", 2,5 μ. → 55–65", 3 μ. → 65–75"). OLED για σκοτεινό δωμάτιο, QLED/Mini LED για φωτεινό.
- Πλυντήριο πιάτων: 45 εκ. → 9–10 σερβίτσια (1–2 άτομα), 60 εκ. → 12–15 σερβίτσια. Αθόρυβο ≤ 44 dB.
- Στεγνωτήριο: αντλία θερμότητας = μισή κατανάλωση από συμπύκνωσης. Κιλά όσα και το πλυντήριο.`;

// ---------- 1. Κατανόηση ----------

interface TypeRow { i: number; node: CatNode; path: CatNode[]; label: string; hint: string }
let hintCache: { at: number; v: Map<string, string> } | null = null;
/** Τι ΠΩΛΕΙΤΑΙ κάτω από κάθε τύπο, από τους τίτλους των προϊόντων του: οι «Φριτέζες» είναι air fryers, τα «Handsfree Bluetooth» earbuds. */
async function typeHints(): Promise<Map<string, string>> {
  if (hintCache && Date.now() - hintCache.at < 30 * 60_000) return hintCache.v;
  const rows = await db.product.findMany({ where: LISTED, select: { categoryId: true, title: true, brand: { select: { name: true } } } });
  const by = new Map<string, { n: number; words: Map<string, number> }>();
  for (const r of rows) {
    const e = by.get(r.categoryId) ?? { n: 0, words: new Map<string, number>() }; e.n++;
    const brand = norm(r.brand.name);
    for (const w of new Set(norm(r.title).split(/[^a-zα-ω]+/).filter((x) => x.length >= 4 && x !== brand))) e.words.set(w, (e.words.get(w) ?? 0) + 1);
    by.set(r.categoryId, e);
  }
  const v = new Map([...by.entries()].map(([id, e]) => [id, [...e.words.entries()].filter(([, c]) => c >= Math.max(3, e.n * 0.12)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w).join(", ")]));
  hintCache = { at: Date.now(), v };
  return v;
}
async function typeList(): Promise<TypeRow[]> {
  const [t, hints] = await Promise.all([catalogTree(), typeHints()]);
  const up = (n: CatNode): CatNode[] => (n.parentId && t.byId.get(n.parentId) ? [...up(t.byId.get(n.parentId)!), n] : [n]);
  return [...t.byId.values()].filter((n) => n.depth === 2 && n.count > 0).map((node, i) => { const path = up(node); return { i, node, path, label: path.map((p) => p.name).join(" › "), hint: hints.get(node.id) ?? "" }; });
}

interface Understood extends AdvisorState { kind: "products" | "advice" | "info" | "other"; focus: "new" | "shown"; shownRefs: number[]; modelCodes: string[]; search: string; understood: string[] }

interface ShownRow { i: number; id: string; brand: string; title: string; price: number; typeName: string }

async function understand(input: AdvisorInput, types: TypeRow[], shown: ShownRow[], viewing: Product | null): Promise<Understood | null> {
  const thread = (input.thread ?? []).slice(-10).map((t) => `${t.role === "user" ? "ΠΕΛΑΤΗΣ" : "ΕΡΜΗΣ"}: ${t.text.slice(0, 400)}`).join("\n");
  const r = await chat({
    feature: "advisor-understand", accounting: "background", model: ROUTER, json: true, maxTokens: 600, temperature: 0, timeoutMs: 9000, reasoning: "low",
    messages: [
      { role: "system", content: `Παρακολουθείς μια συζήτηση πελάτη με τον σύμβουλο πωλήσεων ελληνικού e-shop ηλεκτρικών. Σου δίνεται η ΚΑΤΑΣΤΑΣΗ (οι απαιτήσεις μέχρι τώρα), τα ΔΕΙΓΜΕΝΑ προϊόντα, το ΝΗΜΑ και η ΝΕΑ ΕΡΩΤΗΣΗ. Απαντάς ΜΟΝΟ με JSON:
{"kind":"products"|"advice"|"info"|"other","focus":"new"|"shown","shownRefs":number[],"types":number[],"brands":string[],"minPrice":number|null,"maxPrice":number|null,"maxWidth":number|null,"maxHeight":number|null,"maxDepth":number|null,"inStockOnly":boolean,"needs":string[],"priority":"price"|"quality"|"energy"|"quiet"|null,"sizing":string|null,"modelCodes":string[],"search":string,"understood":string[]}
- Η ΚΑΤΑΣΤΑΣΗ ΣΥΣΣΩΡΕΥΕΤΑΙ: ό,τι ίσχυε κρατιέται εκτός αν ο πελάτης το αλλάξει ρητά («τελικά μέχρι 400», «όχι Samsung»). Επιστρέφεις τη ΣΥΝΟΛΙΚΗ κατάσταση, όχι μόνο τη διαφορά. Μια νέα, άσχετη ανάγκη («και μια τηλεόραση;») μηδενίζει τύπους / ανάγκες / προϋπολογισμό.
- focus "shown": η ερώτηση αφορά τα ΔΕΙΓΜΕΝΑ («από αυτά ποιο…», «το πρώτο», «το Toyotomi που είδα», «αυτό χωράει;», «γιατί το δεύτερο;», «διαφορά τους;») → shownRefs = οι δείκτες τους (όλα τα σχετικά αν λέει «αυτά»). Αλλιώς "new" και shownRefs=[].
- Ο κατάλογος είναι πιο πρόσφατος από τη γνώση σου: ένα μοντέλο που δεν ξέρεις (iPhone 17, Galaxy S26) είναι απλώς νεότερο — το ψάχνεις κανονικά.
- kind: "products" για αναζήτηση/σύγκριση/ερώτηση για προϊόν· "advice" για συμβουλή αγοράς ή τεχνική απορία («OLED ή QLED;», «τι σημαίνει SEER;», «πόσα BTU θέλω;», «αξίζει το inverter;») — τότε βάζεις και τους σχετικούς types και needs ώστε να δείξουμε παραδείγματα· "info" για παράδοση, δόσεις, επιστροφές, εγγύηση, εγκατάσταση, καταστήματα· "other" άσχετο.
- types: έως 3 αριθμοί από τη ΛΙΣΤΑ ΤΥΠΩΝ (η στήλη «συχνές λέξεις» λέει τι πωλείται εκεί). Ποτέ αξεσουάρ όταν ζητά τη συσκευή.
- needs: κάθε απαίτηση χαρακτηριστικού ως σύντομη φράση, ΜΑΖΙ με όσες προκύπτουν από την τεχνογνωσία («σαλόνι 30 τ.μ.» → "12.000 ή 18.000 BTU"). ΟΧΙ τιμή, μάρκα, διαστάσεις χώρου.
- sizing: μία πρόταση με τον συλλογισμό διαστασιολόγησης αν υπάρχει («30 τ.μ. → 12.000–18.000 BTU»), αλλιώς null.
- maxWidth/maxHeight/maxDepth σε εκ. μόνο αν δίνει χώρο. priority: "price" φθηνό, "energy" κατανάλωση, "quiet" αθόρυβο, "quality" το καλύτερο.
- search: η ουσία της συνολικής ανάγκης σε μία φυσική φράση. understood: 2–6 σύντομες φράσεις με ΟΛΑ όσα ισχύουν τώρα.
${EXPERTISE}

ΛΙΣΤΑ ΤΥΠΩΝ (αριθμός|κατηγορία › τύπος|συχνές λέξεις στους τίτλους των προϊόντων του):
${types.map((t) => `${t.i}|${t.path.slice(-2).map((p) => p.name).join(" › ")}|${t.hint}`).join("\n")}` },
      { role: "user", content: `ΚΑΤΑΣΤΑΣΗ: ${JSON.stringify(input.state ?? EMPTY_STATE)}\nΔΕΙΓΜΕΝΑ: ${shown.length ? shown.map((s) => `${s.i}|${s.brand} ${s.title.slice(0, 70)}|${s.price ? eur(s.price) : "—"}|${s.typeName}`).join("\n") : "κανένα"}\n${viewing ? `ΒΛΕΠΕΙ ΤΩΡΑ ΣΤΗ ΣΕΛΙΔΑ: ${viewing.brand} ${viewing.title} (${viewing.path?.map((p) => p.name).join(" › ") ?? ""})\n` : ""}ΝΗΜΑ:\n${thread || "(αρχή συζήτησης)"}\nΝΕΑ ΕΡΩΤΗΣΗ: ${input.q.slice(0, 500)}` },
    ],
  }).catch(() => null);
  const j = r ? parseJson<Partial<Understood>>(r.text) : null;
  if (!j) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const list = (v: unknown, n = 10) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, n) : []);
  const idx = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max) : []);
  const typesOut = idx(j.types, types.length).slice(0, 3);
  return {
    kind: j.kind === "info" || j.kind === "other" || j.kind === "advice" ? j.kind : "products", focus: j.focus === "shown" && shown.length ? "shown" : "new", shownRefs: idx(j.shownRefs, shown.length),
    types: typesOut, typeNames: typesOut.map((i) => types[i].node.name),
    brands: list(j.brands, 5), minPrice: num(j.minPrice), maxPrice: num(j.maxPrice), maxWidth: num(j.maxWidth), maxHeight: num(j.maxHeight), maxDepth: num(j.maxDepth),
    inStockOnly: j.inStockOnly === true, needs: list(j.needs), priority: (["price", "quality", "energy", "quiet"] as const).find((p) => p === j.priority) ?? null, sizing: typeof j.sizing === "string" && j.sizing.trim() ? j.sizing.trim() : null,
    modelCodes: list(j.modelCodes, 3), search: typeof j.search === "string" && j.search.trim() ? j.search.trim() : input.q, understood: list(j.understood, 6),
  };
}

/** Εφεδρεία χωρίς LLM: κρατά την κατάσταση, τύπος από τις λέξεις της ερώτησης, προϋπολογισμός με κανόνα. */
function understandByRules(input: AdvisorInput, types: TypeRow[]): Understood {
  const n = norm(input.q), words = n.split(/[^a-z0-9α-ω]+/).filter((w) => w.length >= 4);
  const scored = types.map((t) => ({ t, s: words.reduce((a, w, i) => a + (norm(t.node.name).includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 / (1 + i) : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.t.node.count - a.t.node.count);
  const budget = n.match(/(?:κατω|μεχρι|εωσ|under|<)\s*(?:απο\s*)?(\d{2,5})/)?.[1] ?? n.match(/(\d{3,5})\s*(?:€|ευρω)/)?.[1];
  const prev = input.state ?? EMPTY_STATE;
  const typesOut = scored.length ? scored.slice(0, 2).map((x) => x.t.i) : prev.types.filter((i) => i < types.length);
  return { ...prev, kind: "products", focus: "new", shownRefs: [], types: typesOut, typeNames: typesOut.map((i) => types[i].node.name), maxPrice: budget ? Number(budget) : prev.maxPrice, priority: /φθην|οικονομικ/.test(n) ? "price" : /αθορυβ|ησυχ/.test(n) ? "quiet" : /ρευμα|καταναλωσ/.test(n) ? "energy" : prev.priority, modelCodes: [], search: input.q, understood: [...typesOut.slice(0, 1).map((i) => types[i].node.name), ...(budget ? [`έως ${budget} €`] : [])] };
}

// ---------- 2. Ανάγκες → τιμές φίλτρων ----------

interface FacetInfo { label: string; raw: string[]; values: { value: string; count: number }[] }
const facetCache = new Map<string, { at: number; v: FacetInfo[] }>();
async function facetsOf(typeIds: string[]): Promise<FacetInfo[]> {
  const key = [...typeIds].sort().join(","), hit = facetCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const v = await loadFacets(typeIds); facetCache.set(key, { at: Date.now(), v });
  return v;
}
async function loadFacets(typeIds: string[]): Promise<FacetInfo[]> {
  const facets = await db.facet.findMany({ where: { categoryId: { in: typeIds }, productCount: { gt: 0 } }, orderBy: { sortNo: "asc" }, select: { id: true, label: true } });
  if (!facets.length) return [];
  const counts = await db.productFacetValue.groupBy({ by: ["facetId", "value"], where: { facetId: { in: facets.map((f) => f.id) }, product: LISTED }, _count: { _all: true } });
  const out = new Map<string, FacetInfo>();
  for (const f of facets) {
    const k = clean(f.label), e = out.get(k) ?? { label: k, raw: [], values: [] };
    if (!e.raw.includes(f.label)) e.raw.push(f.label);
    for (const c of counts.filter((x) => x.facetId === f.id)) { const v = e.values.find((x) => x.value === c.value); if (v) v.count += c._count._all; else e.values.push({ value: c.value, count: c._count._all }); }
    out.set(k, e);
  }
  const numeric = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
  return [...out.values()].filter((f) => f.values.length).map((f) => ({ ...f, values: f.values.sort((a, b) => (isNaN(numeric(a.value)) || isNaN(numeric(b.value)) ? b.count - a.count : numeric(a.value) - numeric(b.value))).slice(0, 40) }));
}

interface FacetFilter { label: string; raw: string[]; values: string[]; need: string }
async function mapNeeds(needs: string[], facets: FacetInfo[]): Promise<{ filters: FacetFilter[]; unmapped: string[] }> {
  if (!needs.length || !facets.length) return { filters: [], unmapped: needs };
  const r = await chat({
    feature: "advisor-facets", accounting: "background", model: ROUTER, json: true, maxTokens: 600, temperature: 0, timeoutMs: 9000, reasoning: "low",
    messages: [
      { role: "system", content: `Αντιστοιχίζεις απαιτήσεις πελάτη σε ΤΙΜΕΣ φίλτρων ενός e-shop. Απαντάς ΜΟΝΟ με JSON {"filters":[{"facet":string,"values":string[],"need":string}],"unmapped":string[]}.
- "facet" και "values" ΑΚΡΙΒΩΣ όπως γράφονται στη λίστα. Ποτέ τιμή που δεν υπάρχει.
- Για ποσότητες διάλεξε ΟΛΕΣ τις τιμές που ικανοποιούν την απαίτηση: «9 κιλά» → 9 kg και ό,τι είναι πολύ κοντά (8–10)· «12.000 ή 18.000 BTU» → και τις δύο (και τις γειτονικές τιμές τους, π.χ. 11.600, 17.743)· «55 ιντσών» → 55" (και 54"–58")· «αθόρυβο» σε φίλτρο dB → οι χαμηλότερες τιμές.
- Ναι/Όχι φίλτρα: «με wifi» → ["Ναι"] ή ["Wi-Fi"], ό,τι υπάρχει.
- Ό,τι δεν αντιστοιχεί σε κανένα φίλτρο πάει στο "unmapped".` },
      { role: "user", content: `ΦΙΛΤΡΑ (όνομα: τιμές):\n${facets.map((f) => `${f.label}: ${f.values.map((v) => v.value).join(" | ")}`).join("\n")}\n\nΑΠΑΙΤΗΣΕΙΣ: ${JSON.stringify(needs)}` },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ filters?: { facet?: string; values?: string[]; need?: string }[]; unmapped?: string[] }>(r.text) : null;
  if (!j) return { filters: [], unmapped: needs };
  const filters: FacetFilter[] = [];
  for (const f of j.filters ?? []) {
    const info = facets.find((x) => x.label === f.facet); if (!info) continue;
    const values = (f.values ?? []).filter((v) => info.values.some((x) => x.value === v)); // μόνο τιμές που υπάρχουν στη βάση
    if (values.length && values.length < info.values.length) filters.push({ label: info.label, raw: info.raw, values, need: f.need ?? info.label });
  }
  return { filters, unmapped: (j.unmapped ?? []).filter((x) => typeof x === "string") };
}

// ---------- 3. Ανάκτηση από τη βάση ----------

interface Cand { id: string; brandId: string; erpCode: string | null; price: number | null; stock: number; score: number; noise: number | null; kwh: number | null; cls: string | null }
const CLASS_ORDER = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

/** Ονόματα σειράς μέσα στην ερώτηση («iphone 17», «galaxy s25», «ps5», «kuro»): ό,τι έχει λέξη + αριθμό, ή λατινική λέξη ≥ 4 γραμμάτων που δεν είναι γενικός όρος. */
const GENERIC_NAMES = new Set(["ps", "gb", "usb", "hdmi", "wifi", "dvb", "hdr"]);
function nameTerms(q: string): string[] {
  const t = norm(q);
  const out = [...t.matchAll(/\b([a-z]{2,}\s?\d{1,4}[a-z]?)\b/g)].map((m) => m[1].replace(/\s+/g, " ")).filter((x) => !/^\d/.test(x) && !/(gb|tb|kg|btu|hz|cm|mm|lt|mah|w|kw|"|ιντσ)$/.test(x));
  return [...new Set(out)].filter((x) => !GENERIC_NAMES.has(x.split(" ")[0])).slice(0, 3);
}

/** Όροι αναζήτησης μιας ανάγκης μέσα στα χαρακτηριστικά: «120 Hz» → 120 Hz / 120Hz, «HDMI 2.1» → HDMI 2.1, «Dolby Vision» → όπως είναι. */
function specTerms(need: string): string[] {
  const t = need.replace(/[«»"]/g, "").trim();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(hz|w|kw|btu|db|kg|l|lt|gb|tb|mah|"|ιντσ\w*|cm|mm)/i);
  if (m) { const unit = m[2].toLowerCase().startsWith("ιντσ") ? '"' : m[2]; return [`${m[1]} ${unit}`, `${m[1]}${unit}`]; }
  const words = t.split(/\s+/).filter((w) => w.length >= 3 && !/^(με|για|και|να|το|την|τον|ή|ή)$/i.test(w));
  return words.length && t.length <= 40 ? [t] : [];
}

async function retrieve(u: Understood, typeIds: string[], filters: FacetFilter[], search: string, specNeeds: string[] = [], take = 30) {
  const relaxed: string[] = [];
  const brandWhere: Prisma.ProductWhereInput[] = u.brands.length ? [{ OR: u.brands.map((b) => ({ brand: { name: { contains: b, mode: "insensitive" as const } } })) }] : [];
  const build = (fs: FacetFilter[], maxPrice: number | null, brands = true): Prisma.ProductWhereInput => ({ AND: [
    LISTED, ...(typeIds.length ? [{ categoryId: { in: typeIds } }] : []), ...(brands ? brandWhere : []),
    ...(maxPrice ? [{ price: { gt: 0, lte: maxPrice } }] : []), ...(u.minPrice ? [{ price: { gte: u.minPrice } }] : []), ...(u.inStockOnly ? [{ stock: { gt: 0 } }] : []),
    ...fs.map((f) => ({ facetValues: { some: { facet: { label: { in: f.raw } }, value: { in: f.values } } } })),
  ] });
  const select = { id: true, brandId: true, erpCode: true, price: true, stock: true, energy: { select: { class: true, eprel: { select: { annualKwh: true, noise: true } } } }, dimensions: { select: { source: true, w: true, h: true, d: true } } } satisfies Prisma.ProductSelect;
  const fetch = (w: Prisma.ProductWhereInput) => db.product.findMany({ where: w, take: 400, orderBy: [{ stock: "desc" }, { price: "desc" }], select });

  const active = [...filters];
  let maxPrice = u.maxPrice, rows = await fetch(build(active, maxPrice));
  // Ανάγκες που δεν είναι φίλτρα του ERP («120 Hz», «HDMI 2.1», «Dolby Vision», «SCOP», «R32») φιλτράρονται πάνω στα ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ
  // (Icecat / ιστότοποι κατασκευαστών / περιγραφή) και στους τίτλους — μόνο όταν αφήνουν ≥ 3 προϊόντα, αλλιώς μένουν για τη σημασιολογική κατάταξη
  for (const need of specNeeds) {
    const terms = specTerms(need); if (!terms.length) continue;
    const hit = await db.product.findMany({ where: { AND: [LISTED, ...(typeIds.length ? [{ categoryId: { in: typeIds } }] : []), { id: { in: rows.map((r) => r.id) } }, { OR: terms.flatMap((t) => [{ title: { contains: t, mode: "insensitive" as const } }, { specs: { some: { OR: [{ value: { contains: t, mode: "insensitive" as const } }, { key: { contains: t, mode: "insensitive" as const } }] } } }]) }] }, select: { id: true } });
    if (hit.length >= 3) { const ids = new Set(hit.map((h) => h.id)); rows = rows.filter((r) => ids.has(r.id)); active.push({ label: need, raw: [], values: terms, need }); }
    else relaxed.push(`λίγα ή κανένα με «${need}» στα καταγεγραμμένα χαρακτηριστικά`);
  }
  // Το όνομα της σειράς νικά όλα τα φίλτρα: αν ζητά «iPhone 17» και ΥΠΑΡΧΟΥΝ iPhone 17, μένουμε σε αυτά (και χαλαρώνουμε τα υπόλοιπα αν χρειαστεί)
  const names = nameTerms(u.search + " " + (u.understood.join(" ") ?? ""));
  if (names.length) {
    const byName = (rs: typeof rows, titles: Map<string, string>) => rs.filter((r) => { const t = norm(titles.get(r.id) ?? ""); return names.some((n) => t.includes(n) || t.includes(n.replace(" ", ""))); });
    const titled = await db.product.findMany({ where: { AND: [LISTED, ...(typeIds.length ? [{ categoryId: { in: typeIds } }] : []), { OR: names.flatMap((n) => [{ title: { contains: n, mode: "insensitive" as const } }, { title: { contains: n.replace(" ", ""), mode: "insensitive" as const } }]) }] }, take: 400, orderBy: [{ stock: "desc" }, { price: "desc" }], select: { ...select, title: true } });
    if (titled.length) { const titles = new Map(titled.map((t) => [t.id, t.title])); const inRows = byName(rows, titles); rows = inRows.length ? inRows : titled; if (!inRows.length) { active.length = 0; relaxed.push(`κράτησα τα «${names.join(", ")}» και χαλάρωσα τα υπόλοιπα κριτήρια`); } }
  }
  // Χαλάρωση, από το λιγότερο δεσμευτικό: τελευταία απαίτηση → … → προϋπολογισμός +15 % → μάρκα. Ο Ερμής το λέει στον πελάτη.
  while (rows.length < 3 && active.length) { const dropped = active.pop()!; relaxed.push(`δεν υπάρχει με «${dropped.need}»`); rows = await fetch(build(active, maxPrice)); }
  if (rows.length < 3 && maxPrice) { maxPrice = Math.round(maxPrice * 1.15); const more = await fetch(build(active, maxPrice)); if (more.length > rows.length) { rows = more; relaxed.push(`λίγα έως ${eur(u.maxPrice!)} — κοίταξα έως ${eur(maxPrice)}`); } }
  if (!rows.length && brandWhere.length) { rows = await fetch(build(active, maxPrice, false)); if (rows.length) relaxed.push(`όχι από ${u.brands.join(", ")} — άλλες μάρκες`); }

  // όρια χώρου: πάνω στις ομογενοποιημένες διαστάσεις· όσα δεν έχουν διαστάσεις δεν μπορούμε να τα υποσχεθούμε
  if (u.maxWidth || u.maxHeight || u.maxDepth) {
    const fits = rows.filter((r) => { const d = r.dimensions.find((x) => x.source === "manual") ?? r.dimensions.find((x) => x.source === "s1-desc") ?? r.dimensions.find((x) => x.source === "eprel"); return d && (!u.maxWidth || d.w <= u.maxWidth) && (!u.maxHeight || d.h <= u.maxHeight) && (!u.maxDepth || d.d <= u.maxDepth); });
    if (fits.length) rows = fits; else relaxed.push("κανένα με δηλωμένες διαστάσεις μέσα στον χώρο που έδωσες");
  }

  const sims = new Map<string, number>();
  if (rows.length > 1) { const hits = await searchVector(search, { refIds: rows.map((r) => r.erpCode).filter(Boolean) as string[], activeOnly: false }, 60).catch(() => []); for (const h of hits) sims.set(h.refId, h.score); }
  const cands: Cand[] = rows.map((r) => ({ id: r.id, brandId: r.brandId, erpCode: r.erpCode, price: r.price, stock: r.stock, noise: r.energy?.eprel?.noise ?? null, kwh: r.energy?.eprel?.annualKwh ?? null, cls: r.energy?.class ?? null,
    score: (sims.get(r.erpCode ?? "") ?? 0) + (r.stock > 0 ? 0.06 : 0) + (r.price && r.price > 0 ? 0.05 : -0.25) + (r.energy ? 0.02 : 0) }));
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, take * 2);
  if (u.priority === "price") top.sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
  if (u.priority === "quiet") top.sort((a, b) => (a.noise ?? 999) - (b.noise ?? 999));
  if (u.priority === "energy") top.sort((a, b) => (CLASS_ORDER.indexOf(a.cls ?? "") + 1 || 99) - (CLASS_ORDER.indexOf(b.cls ?? "") + 1 || 99) || (a.kwh ?? 1e9) - (b.kwh ?? 1e9));
  if (u.priority === "quality") top.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  // Ένας σοβαρός πωλητής δείχνει εύρος, όχι παραλλαγές της ίδιας σειράς: έως 4 ανά μάρκα στα υποψήφια της έρευνας
  const perBrand = new Map<string, number>(), picked: Cand[] = [];
  for (const c of top) { if ((perBrand.get(c.brandId) ?? 0) >= 4 && !u.brands.length) continue; perBrand.set(c.brandId, (perBrand.get(c.brandId) ?? 0) + 1); picked.push(c); if (picked.length === take) break; }
  return { ids: (picked.length >= 3 ? picked : top.slice(0, take)).map((c) => c.id), total: rows.length, relaxed, applied: active };
}

async function byModelCode(codes: string[]): Promise<string[]> {
  if (!codes.length) return [];
  const rows = await db.product.findMany({ where: { AND: [LISTED, { OR: codes.flatMap((c) => [{ sku: { contains: c, mode: "insensitive" as const } }, { title: { contains: c, mode: "insensitive" as const } }, { modelCode: { contains: c, mode: "insensitive" as const } }, { ean: c }]) }] }, take: 3, select: { id: true } });
  return rows.map((r) => r.id);
}

// ---------- 4. Δελτία και έρευνα ----------

function fitOf(p: Product, space: MySpace | null | undefined): { kind: "fits" | "tight" | "no"; text: string } | null {
  if (!space || !p.dims || !fitMattersFor(p)) return null;
  const d = dimsFor(p); if (!d) return null;
  const v = fitVerdict(d, space);
  return { kind: v.kind, text: v.kind === "fits" ? `χωράει, περιθώριο ${v.margin.toFixed(0)} εκ.` : v.kind === "tight" ? `οριακά, περιθώριο ${v.margin.toFixed(0)} εκ.` : `δεν χωράει: λείπουν ${v.by.toFixed(0)} εκ. ${v.where === "door" ? "στην πόρτα" : "στην εσοχή"}` };
}

/** Σύντομο δελτίο για τη φάση της έρευνας: μία γραμμή ανά υποψήφιο. */
function brief(p: Product, space: MySpace | null | undefined) {
  const facts = (p.attrs ?? []).filter((a) => a.value !== "Όχι" && !/^Διαστάσεις|^Μάρκα$/.test(a.key)).slice(0, 8).map((a) => (a.value === "Ναι" ? a.key : `${a.key}: ${a.value}`));
  const label = (p.specs ?? []).filter((s) => s.group === "Από την ενεργειακή ετικέτα").slice(0, 4).map((s) => `${s.key}: ${s.value}`);
  const fit = fitOf(p, space);
  return `${p.brand} ${p.title.slice(0, 80)} | ${p.noPrice ? "τιμή στο κατάστημα" : eur(p.price)} | ${p.availability.kind === "in-stock" ? "άμεσα" : "παραγγελία"} | ${[...facts, ...label, p.dims ? `${p.dims.w}×${p.dims.h}×${p.dims.d} εκ.` : "", fit?.text ?? ""].filter(Boolean).join(" · ")}`;
}

/**
 * ΠΛΗΡΕΣ δελτίο ενός προϊόντος — ό,τι ξέρει το κατάστημα γι' αυτό: ολόκληρη η περιγραφή του ERP (το έγγραφο του vector index),
 * όλες οι τιμές φίλτρων, η ενεργειακή ετικέτα, οι ομογενοποιημένες διαστάσεις, τιμή, απόθεμα, ο έλεγχος χώρου.
 */
async function dossiers(products: Product[], space: MySpace | null | undefined) {
  const codes = await db.product.findMany({ where: { id: { in: products.map((p) => p.id) } }, select: { id: true, erpCode: true } });
  const erp = new Map(codes.map((c) => [c.id, c.erpCode ?? ""]));
  const docs = await db.vectorDoc.findMany({ where: { kind: "product", refId: { in: [...erp.values()].filter(Boolean) } }, select: { refId: true, text: true } }).catch(() => []);
  const byRef = new Map(docs.map((d) => [d.refId, d.text]));
  return products.map((p) => {
    const fit = fitOf(p, space);
    const text = (byRef.get(erp.get(p.id) ?? "") ?? "").split("\n").filter((l) => !/^Κωδικός:|^Κατηγορία:|^Χαρακτηριστικά αυτού του τύπου/.test(l)).join("\n").slice(0, 2600);
    return {
      brand: p.brand, title: p.title, price: p.noPrice ? null : p.price, wasPrice: p.wasPrice ?? null,
      availability: p.availability.kind === "in-stock" ? `άμεσα διαθέσιμο${p.stockLeft ? ` (τελευταία ${p.stockLeft} τεμάχια)` : ""}` : p.noPrice ? "τιμή και διαθεσιμότητα στο κατάστημα" : "κατόπιν παραγγελίας",
      energyClass: p.energy?.cls ?? null, kwhPerYear: p.energy?.kwh ?? null,
      specs: (p.attrs ?? []).filter((a) => a.value !== "Όχι" && a.key !== "Μάρκα").map((a) => (a.value === "Ναι" ? a.key : `${a.key}: ${a.value}`)),
      dimsCm: p.dims ? { w: p.dims.w, h: p.dims.h, d: p.dims.d } : null, fit: fit?.text ?? null, fitKind: fit?.kind ?? null,
      fullDescription: text || (p.description ?? "").slice(0, 1500),
    };
  });
}
type Dossier = Awaited<ReturnType<typeof dossiers>>[number];

/** Έρευνα: από τα ≤ 30 υποψήφια, ποια αξίζουν πλήρη εξέταση — με την τεχνογνωσία διαστασιολόγησης, όχι με «μου φαίνεται». */
async function shortlist(u: Understood, thread: Turn[], briefs: string[], notes: string[]): Promise<number[] | null> {
  const r = await chat({
    feature: "advisor-research", accounting: "background", model: ROUTER, json: true, maxTokens: 400, temperature: 0, timeoutMs: 9000, reasoning: "low",
    messages: [
      { role: "system", content: `Είσαι ο ερευνητής ενός σοβαρού πωλητή ηλεκτρικών. Σου δίνονται οι απαιτήσεις του πελάτη και έως 30 υποψήφια από τον κατάλογο (μία γραμμή το καθένα). Διαλέγεις τα 6 που ΑΞΙΖΕΙ να εξεταστούν πλήρως: πρώτα όσα ικανοποιούν ΟΛΕΣ τις απαιτήσεις και το σωστό μέγεθος για τη χρήση, μετά η προτεραιότητα του πελάτη (τιμή / κατανάλωση / θόρυβος / ποιότητα), μετά τα άμεσα διαθέσιμα, και ΕΥΡΟΣ (όχι έξι παραλλαγές της ίδιας σειράς — αλλά αν το ζητούμενο είναι μία μάρκα, μένεις σε αυτήν). Απαντάς ΜΟΝΟ με JSON {"keep": number[]} (δείκτες, το πιο κατάλληλο πρώτο).
${EXPERTISE}` },
      { role: "user", content: `ΑΠΑΙΤΗΣΕΙΣ: ${JSON.stringify({ understood: u.understood, needs: u.needs, sizing: u.sizing, priority: u.priority, maxPrice: u.maxPrice, brands: u.brands })}\nΣΗΜΕΙΩΣΕΙΣ: ${notes.join(" · ") || "—"}\nΤΕΛΕΥΤΑΙΑ ΛΟΓΙΑ ΠΕΛΑΤΗ: ${thread.filter((t) => t.role === "user").slice(-2).map((t) => t.text).join(" / ")}\n\nΥΠΟΨΗΦΙΑ:\n${briefs.map((b, i) => `${i}| ${b}`).join("\n")}` },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ keep?: number[] }>(r.text) : null;
  const keep = (j?.keep ?? []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < briefs.length).filter((n, i, a) => a.indexOf(n) === i).slice(0, 6);
  return keep.length >= 2 ? keep : null;
}

// ---------- 5. Σύνθεση ----------

const policy = (c: AdvisorContext["commerce"]) => [
  `Δωρεάν μεταφορικά για παραγγελίες από ${c.freeShippingFrom} €.`, `Παραλαβή από κατάστημα σε ${c.clickCollectHours} ώρες (click & collect), 350 καταστήματα-μέλη σε όλη την Ελλάδα.`,
  `Δόσεις χωρίς κάρτα για ποσά ${c.noCardInstalments.min}–${c.noCardInstalments.max} €, έως ${c.noCardInstalments.months} μήνες· με κάρτα έως ${c.maxInstalments} άτοκες.`,
  `Αντικαταβολή έως ${c.codMax} € (χρέωση ${c.codFee} €).`, `Επιστροφή εντός ${c.returnDays} ημερών.`, `Εγγύηση ${c.warrantyYears} έτη, με δυνατότητα επέκτασης.`,
  "Εγκατάσταση και σύνδεση από τον τεχνικό του καταστήματος της περιοχής· απόσυρση της παλιάς συσκευής.",
];

async function compose(input: AdvisorInput, ctx: AdvisorContext, u: Understood, items: Dossier[], viewing: Dossier | null, notes: { relaxed: string[]; total: number; typeNames: string[]; focusShown: boolean }) {
  const thread = (input.thread ?? []).slice(-8).map((t) => `${t.role === "user" ? "ΠΕΛΑΤΗΣ" : "ΕΡΜΗΣ"}: ${t.text.slice(0, 500)}`).join("\n");
  const r = await chat({
    feature: "advisor", accounting: "background", model: WRITER, json: true, maxTokens: 1200, timeoutMs: 18000, reasoning: "low", temperature: 0.5,
    messages: [
      { role: "system", content: `Είσαι ο ${ctx.name}, ο έμπειρος πωλητής του euronics.gr — ο άνθρωπος του καταστήματος που ξέρει κάθε προϊόν του και χαίρεται να βοηθά. Μιλάς ελληνικά στον ενικό, ΖΩΝΤΑΝΑ και ΑΠΛΑ, όπως θα μιλούσες σε πελάτη μπροστά σου: μικρές προτάσεις, καθημερινές λέξεις, ζεστός τόνος. Ακρίβεια στα νούμερα, αλλά κάθε νούμερο ΜΕΤΑΦΡΑΖΕΤΑΙ σε κάτι που καταλαβαίνει ο καθένας («53 dB — όσο ένα ήσυχο ψυγείο», «κλάση A+++ — γύρω στα 30 % λιγότερο ρεύμα από ένα A+», «9 κιλά — για τετραμελή οικογένεια»). Καμία ορολογία χωρίς εξήγηση, καμία ξύλινη φράση («σύμφωνα με», «διαθέτει τεχνολογία», «ιδανική επιλογή», «προσφέρει λύση»), κανένα θαυμαστικό, καμία υπερβολή τηλεπωλήσεων. Λέγε τα πράγματα με το όνομά τους: «το φθηνότερο», «το πιο ήσυχο», «αξίζει τα 100 € παραπάνω γιατί…».
ΑΠΑΡΑΒΑΤΟΙ ΚΑΝΟΝΕΣ
- Προτείνεις ΜΟΝΟ προϊόντα από τα ΔΕΛΤΙΑ και αναφέρεις ΜΟΝΟ στοιχεία που υπάρχουν εκεί ή στην ΠΟΛΙΤΙΚΗ ΚΑΤΑΣΤΗΜΑΤΟΣ. Αν κάτι λείπει, το λες απλά («δεν το έχω καταγεγραμμένο, θα το δω στο κατάστημα»). Η ΤΕΧΝΟΓΝΩΣΙΑ επιτρέπεται μόνο για διαστασιολόγηση και για την εξήγηση των νούμερων.
- ΣΥΝΕΧΕΙΑ: είναι ένα ΝΗΜΑ. Αν ο πελάτης ρωτά για όσα του έδειξες («από αυτά», «το πρώτο», «το Toyotomi»), απαντάς για ΑΥΤΑ — δεν φέρνεις άλλα. Δεν αλλάζεις πρόταση από γύρο σε γύρο χωρίς λόγο· αν αλλάξει, λες γιατί («τώρα που ξέρω ότι το θες αθόρυβο…»).
- Ποτέ προϊόν, τιμή, διαθεσιμότητα ή χαρακτηριστικό εκτός δεδομένων. Ποτέ ανταγωνιστές.
- Ο ΚΑΤΑΛΟΓΟΣ ΕΙΝΑΙ ΠΙΟ ΠΡΟΣΦΑΤΟΣ ΑΠΟ ΤΗ ΓΝΩΣΗ ΣΟΥ: ποτέ δεν λες ότι ένα προϊόν «δεν υπάρχει ακόμα» ή «δεν κυκλοφορεί» — αν είναι στα δελτία, υπάρχει και πωλείται.
- Αν στις ΣΗΜΕΙΩΣΕΙΣ γράφει ότι κάτι δεν βρέθηκε όπως ζητήθηκε, το λες ευθέως και δίνεις την κοντινότερη λύση.
- Έως 3 προϊόντα, το καλύτερο πρώτο, και εξηγείς ΤΗ ΔΙΑΦΟΡΑ τους (τι παίρνει παραπάνω με τα επιπλέον χρήματα). Όταν συγκρίνει, απαντάς με τα νούμερα (dB, kWh, kg, BTU, εκ.) και τι σημαίνουν στην πράξη. Προτιμάς τα άμεσα διαθέσιμα όταν είναι ισάξια.
- Αν δίνεται «fit», το λαμβάνεις υπόψη. Όταν ρωτά για κόστος ρεύματος, το υπολογίζεις από τα kWh του δελτίου × kwhPriceEur και δίνεις € τον χρόνο (στρογγυλά).
- Κλείνεις με ΜΙΑ ερώτηση μόνο όταν χρειάζεται όντως κάτι για να αποφασίσεις· αν ο πελάτης έχει δώσει αρκετά, δίνεις τη σύστασή σου και τελειώνεις. Ποτέ ερώτηση που έχει ήδη απαντηθεί στο νήμα.
- Δεν αναφέρεις ότι είσαι AI.
Απαντάς ΜΟΝΟ με JSON: {"text": string (έως 90 λέξεις· για kind=advice έως 120), "picks": [{"i": number, "why": string (έως 16 λέξεις, το όφελος με απλά λόγια και το νούμερο που το στηρίζει)}]}. Για kind=advice: πρώτα απαντάς στην απορία με την ΤΕΧΝΟΓΝΩΣΙΑ, απλά και καθαρά, και μετά (αν υπάρχουν δελτία) δείχνεις 1–2 παραδείγματα από τον κατάλογο που την επιβεβαιώνουν. Για ερώτηση πολιτικής (kind=info) ή χωρίς δελτία: picks=[].
${EXPERTISE}` },
      { role: "user", content: JSON.stringify({ thread, question: input.q, kind: u.kind, understood: u.understood, sizing: u.sizing, priority: u.priority, customerSpace: input.space ?? null, viewingNow: viewing, notes: { productTypes: notes.typeNames, matchingInCatalogue: notes.total, relaxed: notes.relaxed, answeringAboutAlreadyShown: notes.focusShown }, storePolicy: policy(ctx.commerce), kwhPriceEur: ctx.kwhPrice ?? 0.19, dossiers: items.map((s, i) => ({ i, ...s, fitKind: undefined })) }) },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ text?: string; picks?: { i?: number; why?: string }[] }>(r.text) : null;
  if (!j?.text || j.text.trim().length < 20) return null;
  const picks = (j.picks ?? []).filter((p): p is { i: number; why: string } => Number.isInteger(p.i) && p.i! >= 0 && p.i! < items.length && typeof p.why === "string").filter((p, k, a) => a.findIndex((x) => x.i === p.i) === k).slice(0, 3);
  return { text: j.text.trim(), picks };
}

// ---------- Ενορχήστρωση ----------

export async function smartAdvisor(input: AdvisorInput, ctx: AdvisorContext): Promise<AdvisorReply | null> {
  const t0 = Date.now(), lap: string[] = [], mark = (k: string) => { if (process.env.ADVISOR_DEBUG) lap.push(`${k} ${Date.now() - t0}ms`); };
  const types = await typeList();
  if (!types.length) return null;
  const cfg = await getAi();
  const ai = !!cfg && cfg.advisorEnabled && !(await overBudget(cfg));
  // συμβατότητα με τον παλιό καλούντα (prev μόνο): γίνεται νήμα ενός γύρου
  const thread: Turn[] = input.thread?.length ? input.thread : input.prev ? [{ role: "user", text: input.prev }] : [];
  const shownIds = [...new Set([...(input.shown ?? []), ...thread.flatMap((t) => t.products ?? [])])].slice(-12);
  const [viewing, shownProducts] = await Promise.all([input.pid ? dbProductsByIds([input.pid]).then((r) => r[0] ?? null).catch(() => null) : null, shownIds.length ? dbProductsByIds(shownIds).catch(() => []) : []]);
  const shown: ShownRow[] = shownIds.map((id) => shownProducts.find((p) => p.id === id)).filter((p): p is Product => !!p).map((p, i) => ({ i, id: p.id, brand: p.brand, title: p.title, price: p.price, typeName: p.path?.[p.path.length - 1]?.name ?? "" }));

  const u = (ai ? await understand({ ...input, thread }, types, shown, viewing) : null) ?? understandByRules({ ...input, thread }, types);
  mark("understand");
  if (u.kind === "other" && !u.types.length && !u.modelCodes.length && u.focus !== "shown") u.kind = "info";
  let chosen = u.types.map((i) => types[i]);
  if (!chosen.length && viewing?.typeSlug && (u.kind === "products" || u.kind === "advice") && u.focus === "new") { const t = types.find((x) => x.node.slug === viewing.typeSlug); if (t) { chosen = [t]; u.types = [t.i]; u.typeNames = [t.node.name]; } }

  let candidates: Product[] = [], total = 0, relaxed: string[] = [];
  const wantsProducts = u.kind === "products" || u.kind === "advice";
  if (wantsProducts && u.focus === "shown") {
    // η ερώτηση αφορά όσα έχει ήδη δει: μένουμε ΣΕ ΑΥΤΑ — καμία νέα έρευνα, καμία εναλλαγή προτάσεων
    const refs = u.shownRefs.length ? u.shownRefs : shown.map((s) => s.i);
    candidates = refs.map((i) => shown[i] && shownProducts.find((p) => p.id === shown[i].id)).filter((p): p is Product => !!p).slice(0, 6);
    if (viewing && !candidates.some((c) => c.id === viewing.id) && /αυτο(?![a-zα-ω])/.test(norm(input.q))) candidates = [viewing, ...candidates].slice(0, 6);
    total = candidates.length;
  } else if (wantsProducts) {
    const typeIds = chosen.map((t) => t.node.id);
    const { filters, unmapped } = ai && chosen.length ? await mapNeeds(u.needs, await facetsOf(typeIds)) : { filters: [], unmapped: u.needs };
    mark("facets");
    const search = [u.search, ...unmapped].join(" · ");
    const [exact, found] = await Promise.all([byModelCode(u.modelCodes), chosen.length || u.brands.length || u.maxPrice ? retrieve(u, typeIds, filters, search, unmapped) : Promise.resolve({ ids: [] as string[], total: 0, relaxed: [] as string[], applied: [] as FacetFilter[] })]);
    total = found.total; relaxed = found.relaxed;
    for (const f of found.applied) if (!u.understood.some((x) => norm(x).includes(norm(f.need)))) u.understood.push(f.need);
    const ids = [...new Set([...exact, ...found.ids])].filter((id) => id !== viewing?.id || u.modelCodes.length > 0);
    const loaded = ids.length ? await dbProductsByIds(ids) : [];
    const pool = ids.map((id) => loaded.find((p) => p.id === id)).filter((p): p is Product => !!p);
    mark("retrieve");
    // έρευνα: ποια από τα 30 αξίζουν πλήρη εξέταση
    const keep = ai && pool.length > 6 ? await shortlist(u, thread, pool.map((p) => brief(p, input.space)), relaxed) : null;
    candidates = (keep ?? pool.slice(0, 6).map((_, i) => i)).map((i) => pool[i]).filter(Boolean);
    for (const id of exact) { const p = pool.find((x) => x.id === id); if (p && !candidates.some((c) => c.id === id)) candidates.unshift(p); }
    candidates = candidates.slice(0, 6);
    mark("research");
  }
  const [items, viewingDossier] = await Promise.all([candidates.length ? dossiers(candidates, input.space) : Promise.resolve([] as Dossier[]), viewing ? dossiers([viewing], input.space).then((d) => d[0] ?? null) : Promise.resolve(null)]);

  const written = ai ? await compose({ ...input, thread }, ctx, u, items, viewingDossier, { relaxed, total, typeNames: u.typeNames, focusShown: u.focus === "shown" }) : null;
  mark("compose"); if (process.env.ADVISOR_DEBUG) console.log("      [advisor]", lap.join(" · "));
  const picks = written?.picks.length ? written.picks : items.slice(0, 3).map((s, i) => ({ i, why: [s.energyClass ? `κλάση ${s.energyClass}` : null, ...s.specs.slice(0, 2), s.availability].filter(Boolean).join(" · ") }));
  const text = written?.text ?? (candidates.length
    ? `${chosen.length ? `Από ${total} ${chosen[0].node.name.toLowerCase()} του καταλόγου` : "Από τον κατάλογο"}${u.maxPrice ? ` έως ${eur(u.maxPrice)}` : ""}, αυτά ταιριάζουν περισσότερο.${relaxed.length ? ` Σημείωση: ${relaxed.join("· ")}.` : ""}`
    : u.kind === "info" ? policy(ctx.commerce).slice(0, 3).join(" ") : u.kind === "advice" ? "Πες μου για ποιον χώρο ή χρήση το θες και θα σου εξηγήσω τι σου ταιριάζει." : "Δεν βρήκα στον κατάλογό μας κάτι που να ταιριάζει σε αυτό που περιγράφεις. Πες μου το είδος της συσκευής και τον προϋπολογισμό σου.");

  const products = picks.map(({ i, why }) => { const p = candidates[i], s = items[i]; return { id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, image: p.image ?? null, why, fit: (s.fitKind ?? undefined) as "fits" | "tight" | "no" | undefined }; });
  const state: AdvisorState = { types: u.types, typeNames: u.typeNames, brands: u.brands, minPrice: u.minPrice, maxPrice: u.maxPrice, maxWidth: u.maxWidth, maxHeight: u.maxHeight, maxDepth: u.maxDepth, inStockOnly: u.inStockOnly, needs: u.needs, priority: u.priority, sizing: u.sizing };
  return {
    q: input.q, understood: u.understood, text, products,
    href: chosen.length ? { label: `Όλα: ${chosen[0].node.name}`, href: `${hrefOf(chosen[0].path)}${u.maxPrice ? `?max=${u.maxPrice}` : ""}` } : undefined,
    state, shown: [...new Set([...shownIds, ...products.map((p) => p.id)])].slice(-12),
  };
}
