import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { CATALOG_TEXT_MODEL } from "./ai-models";
import { cleanCopy, pickExamples, type CategoryExample } from "./marketing-copy-core";

/**
 * Σύντομη και αναλυτική περιγραφή με AI (DeepSeek V4 μέσω OpenRouter, βλ. ai-models), σε γλώσσα marketing: από το
 * όνομα, τη μάρκα, την κατηγορία και τα χαρακτηριστικά του προϊόντος (ERP, EPREL, Icecat, Channel3, κατασκευαστής), με
 * παραδείγματα ύφους από περιγραφές της ίδιας κατηγορίας. Δεν αποθηκεύει τίποτα: ο διαχειριστής διορθώνει και εγκρίνει
 * (enrich-actions → saveCopyAction, που γράφει στο SoftOne).
 */
export interface CopyDraft { short: string; long: string; examples: string[]; specCount: number; costUsd: number; model: string }

const SYSTEM = `Είσαι copywriter του euronics.gr (ηλεκτρικές συσκευές, Ελλάδα). Γράφεις περιγραφές προϊόντων σε γλώσσα marketing:
ζωντανή, θετική, με οφέλη για τον πελάτη στην καθημερινότητά του — όχι λίστα τεχνικών.
Κανόνες:
- Μόνο από τα δεδομένα που σου δίνονται. ΠΟΤΕ μην επινοείς χαρακτηριστικά, νούμερα, βραβεία, εγγυήσεις, τιμές ή προσφορές.
- Ακολούθησε το ύφος, τη δομή και το μήκος των παραδειγμάτων της ίδιας κατηγορίας, αλλά με δικά σου λόγια (μην αντιγράφεις φράσεις).
- Ελληνικά, σωστός τονισμός, χωρίς emoji, χωρίς markdown, χωρίς κεφαλαία σε ολόκληρες λέξεις.
- Καμία γραμμή της μορφής «Ετικέτα: τιμή» — τα τεχνικά χαρακτηριστικά εμφανίζονται χωριστά στη σελίδα.
- Αγγλικά χαρακτηριστικά (π.χ. από καταστήματα του εξωτερικού) τα αποδίδεις στα ελληνικά· ονόματα τεχνολογιών (QLED, Inverter, AirDry) μένουν όπως είναι.
Απάντηση ΜΟΝΟ JSON: {"short": "1–2 προτάσεις, έως 40 λέξεις, το κύριο όφελος", "long": "3–4 παράγραφοι χωρισμένες με κενή γραμμή, 120–250 λέξεις"}`;

export async function draftMarketingCopy(productId: string): Promise<CopyDraft | { error: string }> {
  const cfg = await getAi();
  if (!cfg) return { error: "Δεν έχει οριστεί κλειδί AI (Ρυθμίσεις → AI & υπηρεσίες)." };
  if (await overBudget(cfg)) return { error: "Ξεπεράστηκε το ημερήσιο όριο κόστους AI — δοκίμασε αύριο ή αύξησέ το στις Ρυθμίσεις." };
  const p = await db.product.findUnique({ where: { id: productId }, select: {
    title: true, summary: true, description: true, categoryId: true,
    brand: { select: { name: true } }, category: { select: { name: true } },
    specs: { orderBy: [{ sortNo: "asc" }, { id: "asc" }], take: 80, select: { key: true, value: true } },
  } });
  if (!p) return { error: "Το προϊόν δεν βρέθηκε." };
  const seen = new Set<string>();
  const specs = p.specs.filter((s) => { const k = s.key.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
  if (specs.length < 3 && !p.description) return { error: "Λίγα στοιχεία για περιγραφή: βρες πρώτα χαρακτηριστικά (Αναζήτηση τώρα)." };
  const rows = await db.product.findMany({ where: { categoryId: p.categoryId, id: { not: productId }, active: true, description: { not: null } }, take: 60, orderBy: { updatedAt: "desc" }, select: { title: true, summary: true, description: true, brand: { select: { name: true } } } });
  const examples: CategoryExample[] = pickExamples(rows.map((r) => ({ title: r.title, brand: r.brand.name, summary: r.summary, description: r.description })));
  const input = {
    product: { name: p.title, brand: p.brand.name, category: p.category.name, currentShort: p.summary ?? undefined, currentLong: p.description?.slice(0, 1500) || undefined },
    specs: specs.map((s) => `${s.key}: ${s.value}`),
    categoryExamples: examples.map((e) => ({ name: e.title, short: e.summary ?? undefined, long: e.description })),
  };
  const r = await chat({ feature: "copy-marketing", model: CATALOG_TEXT_MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(input) }], json: true, reasoning: "off", maxTokens: 1400, temperature: 0.7, timeoutMs: 60_000 })
    .catch((e: Error) => ({ error: e.message }));
  if ("error" in r) return { error: `Το AI δεν απάντησε: ${r.error}`.slice(0, 200) };
  const j = parseJson<{ short?: string; long?: string }>(r.text);
  const short = cleanCopy(j?.short ?? "").replace(/\n+/g, " "), long = cleanCopy(j?.long ?? "");
  if (!short || !long) return { error: "Το AI δεν έδωσε έγκυρη περιγραφή — δοκίμασε ξανά." };
  return { short: short.slice(0, 600), long: long.slice(0, 4000), examples: examples.map((e) => e.title), specCount: specs.length, costUsd: r.costUsd, model: r.model };
}
