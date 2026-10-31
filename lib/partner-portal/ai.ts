import "server-only";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { CONN_TYPES, MAP_FIELDS, type FieldMapping } from "./connection-types";
import { portalLog } from "./log";

/**
 * Βοηθός αρχικοποίησης της πύλης (OpenRouter, DeepSeek V4). Μόνο προτάσεις — ο χρήστης αποφασίζει και κάθε πρόταση
 * περνά από τους ίδιους ελέγχους με τις επιλογές του. Χωρίς κλειδί / πάνω από το ημερήσιο όριο → null και η οθόνη
 * συνεχίζει χωρίς βοηθό. Δεν στέλνουμε ποτέ προσωπικά δεδομένα ή secrets — μόνο ονόματα στηλών, δείγμα αποθέματος, απαντήσεις.
 */
export const PORTAL_MODEL = process.env.PORTAL_AI_MODEL || "deepseek/deepseek-v4-flash";

async function ask<T>(partnerId: string, feature: string, system: string, user: unknown, maxTokens = 700): Promise<T | null> {
  const cfg = await getAi();
  if (!cfg || !cfg.apiKey || (await overBudget(cfg))) return null;
  const t0 = Date.now();
  const r = await chat({ feature: `portal-${feature}`, model: PORTAL_MODEL, reasoning: "off", json: true, maxTokens, temperature: 0.2, timeoutMs: 25_000, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }] }).catch(() => null);
  await portalLog(partnerId, "ai", !!r, r ? `Βοηθός: ${feature}` : `Ο βοηθός δεν απάντησε (${feature})`, { ms: Date.now() - t0, detail: r ? { model: r.model, costUsd: r.costUsd } : undefined });
  return r ? parseJson<T>(r.text) : null;
}

export type SetupAdvice = { type: string; confidence: "high" | "medium" | "low"; why: string; steps: string[]; ask: string[]; warnings: string[] };

/** Από το ερωτηματολόγιο → ποιος τρόπος σύνδεσης ταιριάζει και τι να ετοιμάσει. */
export async function adviseSetup(partnerId: string, answers: Record<string, unknown>) {
  const types = CONN_TYPES.map((c) => ({ type: c.type, title: c.title, bestFor: c.bestFor, needs: c.needs, automatic: c.automatic }));
  const r = await ask<SetupAdvice>(partnerId, "setup", `Είσαι ο βοηθός αρχικοποίησης της πύλης συνεργατών Euronics. Ένα κατάστημα-μέλος θα μας στέλνει το απόθεμά του ανά κατάστημα. Διάλεξε ΕΝΑΝ από τους διαθέσιμους τρόπους σύνδεσης με βάση τις απαντήσεις του, χωρίς να επινοείς άλλους. Προτίμησε αυτόματους τρόπους όταν υπάρχει το σύστημα. Ελληνικά, σύντομα, χωρίς υπερβολές. JSON: {"type": ένας από ${types.map((t) => t.type).join("|")}, "confidence": "high|medium|low", "why": 1-2 προτάσεις, "steps": 3-5 σύντομα βήματα που θα κάνει, "ask": τι να ζητήσει από τον τεχνικό του (0-4), "warnings": 0-3}. Διαθέσιμοι τρόποι: ${JSON.stringify(types)}`, answers);
  return r && CONN_TYPES.some((c) => c.type === r.type) ? r : null;
}

export type MappingAdvice = { map: FieldMapping; notes: Partial<Record<keyof FieldMapping, string>>; summary: string };

/** Πρόταση αντιστοίχισης στηλών από τα ονόματα και 5 γραμμές δείγματος. */
export async function adviseMapping(partnerId: string, columns: string[], preview: Record<string, string>[]) {
  const fields = MAP_FIELDS.map((f) => ({ key: f.key, label: f.label, help: f.help }));
  const r = await ask<MappingAdvice>(partnerId, "mapping", `Αντιστοιχίζεις στήλες ενός αρχείου αποθέματος καταστήματος ηλεκτρικών ειδών στα πεδία μας. Χρησιμοποίησε ΜΟΝΟ ονόματα στηλών από τη λίστα, ακριβώς όπως είναι. Κάθε στήλη σε ένα πεδίο το πολύ. Αν δεν είσαι σίγουρος για ένα πεδίο, άφησέ το έξω. "qty" = διαθέσιμη ποσότητα (όχι τιμή, όχι δεσμευμένα). "location" μόνο αν η στήλη δείχνει κατάστημα/αποθήκη. Ελληνικά. JSON: {"map": {πεδίο: στήλη}, "notes": {πεδίο: γιατί, έως 12 λέξεις}, "summary": 1 πρόταση}. Πεδία: ${JSON.stringify(fields)}`, { columns, preview: preview.slice(0, 5) });
  if (!r?.map) return null;
  const clean: FieldMapping = {};
  for (const [k, v] of Object.entries(r.map)) if (MAP_FIELDS.some((f) => f.key === k) && typeof v === "string" && columns.includes(v)) clean[k as keyof FieldMapping] = v;
  return { ...r, map: clean };
}

/** Εξήγηση αποτυχημένου ελέγχου σε απλά λόγια, με τι να κάνει. */
export async function explainTest(partnerId: string, type: string, steps: { key: string; ok: boolean; message: string }[]) {
  return ask<{ title: string; explanation: string; fixes: string[]; forTechnician: string }>(partnerId, "explain", `Εξηγείς σε ιδιοκτήτη καταστήματος (όχι τεχνικό) γιατί απέτυχε ο έλεγχος σύνδεσης ${type} με την Euronics και τι να κάνει. Βασίσου ΜΟΝΟ στα μηνύματα των βημάτων. Ελληνικά, απλά. JSON: {"title": έως 8 λέξεις, "explanation": 1-2 προτάσεις, "fixes": 2-4 βήματα, "forTechnician": ένα μήνυμα που μπορεί να προωθήσει στον τεχνικό του}.`, { steps }, 600);
}
