import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { emptyDraft, type PromoDraft } from "./admin";
import { TEMPLATES } from "./catalog";
import { getServiceList } from "@/lib/services/catalog";

/**
 * Ερμής για το διαχειριστικό: «−20 % σε όλα τα πλυντήρια LG μέχρι τέλος Νοεμβρίου» → προσυμπληρωμένος οδηγός.
 * Πρώτα κανόνες (δουλεύουν πάντα), μετά — αν υπάρχει AI — βελτίωση από το μοντέλο. Τα ονόματα μαρκών / κατηγοριών /
 * προϊόντων αντιστοιχίζονται ΜΟΝΟ σε ό,τι υπάρχει στη βάση. Ποτέ δεν δημοσιεύει: ο άνθρωπος ελέγχει και πατά «Δημοσίευση».
 */

interface Parsed { template?: string; percent?: number; amount?: number; buy?: number; get?: number; nth?: number; serviceSlug?: string; minValue?: number; startsAt?: string | null; endsAt?: string | null; brands?: string[]; categories?: string[]; products?: string[]; name?: string; tagLabel?: string; customers?: "all" | "new" | "registered"; couponCode?: string; maxPerCustomer?: number }

const MONTHS = ["ιανουαρ", "φεβρουαρ", "μαρτ", "απριλ", "μαι", "ιουν", "ιουλ", "αυγουστ", "σεπτεμβρ", "οκτωβρ", "νοεμβρ", "δεκεμβρ"];
const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Ημερομηνίες όπως τις λέμε: «έως 30/11», «μέχρι 30 Νοεμβρίου», «τέλος Νοεμβρίου», «από 1/11». */
function parseDate(t: string, now: Date, end: boolean): string | null {
  const y = now.getFullYear();
  const mk = (d: number, m: number) => { const x = new Date(y, m, d, end ? 23 : 0, end ? 59 : 0); if (x < now && end) x.setFullYear(y + 1); return x.toISOString(); };
  let m = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (m) return mk(Number(m[1]), Number(m[2]) - 1);
  m = t.match(/(\d{1,2})\s+([α-ω]+)/);
  if (m) { const i = MONTHS.findIndex((x) => m![2].startsWith(x)); if (i >= 0) return mk(Number(m[1]), i); }
  m = t.match(/τελος\s+([α-ω]+)/);
  if (m) { const i = MONTHS.findIndex((x) => m![1].startsWith(x)); if (i >= 0) return mk(new Date(y, i + 1, 0).getDate(), i); }
  return null;
}

function rules(text: string, now: Date): Parsed {
  const t = norm(text);
  const p: Parsed = {};
  const plus = t.match(/(\d)\s*\+\s*(\d)/);
  const pct = t.match(/(\d{1,2})\s*%/);
  const amt = t.match(/(\d+(?:[.,]\d+)?)\s*(?:€|ευρω)/);
  if (plus) { p.template = "nplusm"; p.buy = Number(plus[1]); p.get = Number(plus[2]); }
  else if (/(2ο|δευτερο|3ο|τριτο)/.test(t) && pct) { p.template = "nth"; p.nth = /(3ο|τριτο)/.test(t) ? 3 : 2; p.percent = Number(pct[1]); }
  else if (/κουπονι|κωδικο/.test(t)) { p.template = pct ? "coupon-percent" : "coupon-amount"; if (pct) p.percent = Number(pct[1]); else if (amt) p.amount = Math.round(Number(amt[1].replace(",", ".")) * 100); const c = text.match(/\b([A-Z][A-Z0-9-]{2,29})\b/); if (c) p.couponCode = c[1]; }
  else if (/δωρεαν\s+μεταφορικ/.test(t)) p.template = "shipping";
  else if (/δωρεαν\s+(επεκταση|εγγυηση|ανακυκλωση|φυλαξη|e-?support)/.test(t)) { p.template = "service"; p.serviceSlug = /ανακυκλ/.test(t) ? "anakyklosi-aiie" : /φυλαξ/.test(t) ? "dorean-fylaxi" : /support/.test(t) ? "e-support" : "epektasi-eggyisis"; }
  else if (/δωρο/.test(t)) p.template = "gift";
  else if (pct) { p.template = "percent"; p.percent = Number(pct[1]); }
  else if (amt) { p.template = "amount"; p.amount = Math.round(Number(amt[1].replace(",", ".")) * 100); }
  const min = t.match(/(?:απο|πανω απο|για αγορες απο)\s*(\d+)\s*(?:€|ευρω)/);
  if (min && p.template !== "amount") p.minValue = Number(min[1]) * 100;
  if (/πρωτη\s+αγορα|νεους\s+πελατες/.test(t)) p.customers = "new";
  else if (/μελη|εγγεγραμμεν/.test(t)) p.customers = "registered";
  const until = t.match(/(?:εως|μεχρι|ως)\s+([^,.;]+)/);
  if (until) p.endsAt = parseDate(until[1], now, true);
  const from = t.match(/(?:απο)\s+(\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+[α-ω]+)/);
  if (from) p.startsAt = parseDate(from[1], now, false);
  return p;
}

async function ai(text: string, now: Date): Promise<Parsed | null> {
  const cfg = await getAi();
  if (!cfg || (await overBudget(cfg))) return null;
  const r = await chat({
    feature: "promo-draft",
    messages: [
      { role: "system", content: `Μετατρέπεις περιγραφές προσφορών e-shop ηλεκτρικών σε JSON για τον οδηγό του διαχειριστικού. Σήμερα: ${now.toISOString().slice(0, 10)}. Πρότυπα: ${TEMPLATES.filter((x) => !x.held).map((x) => `${x.key} (${x.title})`).join(", ")}. Υπηρεσίες: ${(await getServiceList()).map((s) => `${s.slug} (${s.title})`).join(", ")}. Απαντάς ΜΟΝΟ με JSON: {"template": string, "name": string (σύντομο εσωτερικό όνομα), "percent"?: number, "amount"?: number (σε ευρώ), "buy"?: number, "get"?: number, "nth"?: number, "serviceSlug"?: string, "minValue"?: number (ευρώ), "customers"?: "all"|"new"|"registered", "startsAt"?: "YYYY-MM-DD", "endsAt"?: "YYYY-MM-DD", "brands"?: string[], "categories"?: string[] (όπως τις λέει ο χρήστης, π.χ. «πλυντήρια ρούχων»), "products"?: string[] (κωδικοί ή τίτλοι), "tagLabel"?: string (έως 20 χαρακτήρες), "couponCode"?: string, "maxPerCustomer"?: number}. Μην επινοείς τίποτα που δεν λέει ο χρήστης.` },
      { role: "user", content: text },
    ],
    json: true, maxTokens: 500, reasoning: "low", timeoutMs: 15000,
  }).catch(() => null);
  const j = r ? parseJson<Parsed & { amount?: number; minValue?: number }>(r.text) : null;
  if (!j) return null;
  return {
    ...j,
    amount: j.amount != null ? Math.round(j.amount * 100) : undefined,
    minValue: j.minValue != null ? Math.round(j.minValue * 100) : undefined,
    startsAt: j.startsAt ? new Date(`${j.startsAt}T00:00:00`).toISOString() : undefined,
    endsAt: j.endsAt ? new Date(`${j.endsAt}T23:59:00`).toISOString() : undefined,
  };
}

/** Ονόματα στο κείμενο που υπάρχουν στη βάση (μάρκες, κατηγορίες) — δουλεύει και χωρίς AI. */
async function findInText(text: string) {
  const t = ` ${norm(text)} `;
  const [brands, cats] = await Promise.all([db.brand.findMany({ select: { id: true, name: true } }), db.category.findMany({ where: { active: true }, select: { id: true, name: true, depth: true } })]);
  const b = brands.filter((x) => x.name.length > 1 && new RegExp(`(?<![\\p{L}\\d])${norm(x.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "u").test(t));
  // κατηγορίες: ταίριασμα της ρίζας κάθε λέξης (πλυντήρια ↔ πλυντήριο) — κρατιέται η πιο συγκεκριμένη
  const stem = (w: string) => w.replace(/(ια|ιο|ες|ος|α|ο|η|ες|ων|εις|ης)$/u, "");
  const words = new Set(t.split(/[^\p{L}\d]+/u).filter((w) => w.length > 3).map(stem));
  // όχι «κατηγορίες» που είναι ονόματα υπηρεσιών (π.χ. «Επέκταση εγγύησης» στο «δωρεάν επέκταση εγγύησης»)
  const svc = new Set((await getServiceList()).map((x) => norm(x.title)));
  const c = cats.filter((x) => { if (svc.has(norm(x.name)) || /εγγυησ/.test(norm(x.name))) return false; const ws = norm(x.name).split(/[^\p{L}\d]+/u).filter((w) => w.length > 3).map(stem); return ws.length > 0 && ws.every((w) => words.has(w)); }).sort((a, b2) => b2.depth - a.depth);
  return { brands: b, categories: c.slice(0, 3) };
}

export async function draftFromText(text: string): Promise<{ draft: PromoDraft; notes: string[]; via: "ai" | "rules" }> {
  const now = new Date();
  const base = rules(text, now);
  const fromAi = await ai(text, now);
  const p: Parsed = { ...base, ...Object.fromEntries(Object.entries(fromAi ?? {}).filter(([, v]) => v != null && v !== "")) };
  const tpl = TEMPLATES.find((x) => x.key === p.template && !x.held) ?? TEMPLATES[0];
  const d = emptyDraft(tpl.key);
  const notes: string[] = [];
  d.name = (p.name ?? text).slice(0, 80);
  if (p.percent != null) d.reward.percent = p.percent;
  if (p.amount != null) d.reward.amount = p.amount;
  if (p.buy) d.reward.buy = p.buy;
  if (p.get) d.reward.get = p.get;
  if (p.nth) d.reward.nth = p.nth;
  if (p.serviceSlug && (await getServiceList()).some((s) => s.slug === p.serviceSlug && s.slug !== "paradosi-egkatastasi")) d.reward.serviceSlug = p.serviceSlug;
  if (p.minValue) d.rules.minValue = p.minValue;
  if (p.customers && p.customers !== "all") d.rules.customers = p.customers;
  d.startsAt = p.startsAt ?? null;
  d.endsAt = p.endsAt ?? null;
  if (p.tagLabel) d.tagLabel = p.tagLabel.slice(0, 28);
  if (p.couponCode) d.couponCode = p.couponCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (p.maxPerCustomer) d.maxPerCustomer = p.maxPerCustomer;

  const found = await findInText(text);
  const brandIds = new Set(found.brands.map((b) => b.id));
  for (const name of p.brands ?? []) { const b = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } }); if (b) brandIds.add(b.id); else notes.push(`Η μάρκα «${name}» δεν βρέθηκε.`); }
  const catIds = new Set(found.categories.map((c) => c.id));
  for (const name of p.categories ?? []) {
    if (/εγγυησ/.test(norm(name))) continue;
    // ολόκληρο το όνομα, αλλιώς η μεγαλύτερη λέξη χωρίς κατάληξη («μικροσυσκευές κουζίνας» → «μικροσυσκευ»)
    const longest = name.split(/\s+/).sort((a, b2) => b2.length - a.length)[0] ?? name;
    const c = (await db.category.findFirst({ where: { active: true, name: { contains: name.replace(/(ια|ες)$/u, ""), mode: "insensitive" } }, orderBy: { depth: "asc" }, select: { id: true } }))
      ?? (longest.length > 5 ? await db.category.findFirst({ where: { active: true, name: { contains: longest.slice(0, -2), mode: "insensitive" } }, orderBy: { depth: "asc" }, select: { id: true } }) : null);
    if (c) catIds.add(c.id); else if (!found.categories.length) notes.push(`Η κατηγορία «${name}» δεν βρέθηκε — διάλεξέ τη στο βήμα «Προϊόντα».`);
  }
  // όχι και η κατηγορία και η υποκατηγορία της: η πιο γενική καλύπτει ήδη τις υπόλοιπες
  if (catIds.size > 1) {
    const rows = await db.category.findMany({ where: { id: { in: [...catIds] } }, select: { id: true, parentId: true, parent: { select: { parentId: true, parent: { select: { parentId: true } } } } } });
    for (const r of rows) if ([r.parentId, r.parent?.parentId, r.parent?.parent?.parentId].some((a) => a && catIds.has(a))) catIds.delete(r.id);
  }
  const prodIds: string[] = [];
  for (const q of p.products ?? []) { const x = await db.product.findFirst({ where: { active: true, OR: [{ sku: q }, { ean: q }, { title: { contains: q, mode: "insensitive" } }] }, select: { id: true } }); if (x) prodIds.push(x.id); else notes.push(`Το προϊόν «${q}» δεν βρέθηκε.`); }
  // μάρκα + κατηγορία μαζί = «πλυντήρια LG»: η μηχανή ταιριάζει «ή», οπότε κρατάμε την κατηγορία και σημειώνουμε τη μάρκα
  if (brandIds.size && catIds.size) notes.push("Μάρκα και κατηγορία μαζί: οι στόχοι είναι «ή». Για «μόνο LG πλυντήρια» διάλεξε τα προϊόντα ή κράτα μόνο τη μάρκα και εξαίρεσε κατηγορίες.");
  d.targets = [...[...catIds].map((refId) => ({ kind: "category" as const, refId, exclude: false })), ...(catIds.size ? [] : [...brandIds].map((refId) => ({ kind: "brand" as const, refId, exclude: false }))), ...prodIds.map((refId) => ({ kind: "product" as const, refId, exclude: false }))];
  if (tpl.mechanism === "gift") notes.push("Διάλεξε το προϊόν-δώρο στο βήμα «Προϊόντα».");
  if (!d.endsAt) notes.push("Δεν δόθηκε λήξη — όρισέ τη στο βήμα «Κανόνες».");
  if (!fromAi) notes.push("Χωρίς AI αυτή τη στιγμή: το προσχέδιο βγήκε με κανόνες — έλεγξέ το.");
  return { draft: d, notes, via: fromAi ? "ai" : "rules" };
}
