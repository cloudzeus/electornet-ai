import "server-only";
import { chat, getAi, overBudget, parseJson } from "./openrouter";
import type { AdvisorAnswer } from "@/lib/advisor/answer";

/**
 * AI tasks on top of the OpenRouter client. Every task degrades gracefully:
 * no key / over budget / error → the caller keeps its rule-based result.
 */

/** Άρης: rewrite the rule-based answer in natural Greek and personalise the «why» per product. Same JSON shape. */
export async function advisorCompose(base: AdvisorAnswer, opts: { name: string; context?: string }): Promise<AdvisorAnswer> {
  const cfg = await getAi();
  if (!cfg || !cfg.advisorEnabled || (await overBudget(cfg))) return base;
  const products = base.products.map((p, i) => ({ i, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, facts: p.why, fit: p.fit }));
  const r = await chat({
    feature: "advisor",
    messages: [
      { role: "system", content: `Είσαι ο ${opts.name}, ο σύμβουλος αγορών του euronics.gr (350 καταστήματα στην Ελλάδα). Μιλάς ελληνικά, φιλικά και σύντομα, στον ενικό. Δεν επινοείς χαρακτηριστικά ή τιμές: χρησιμοποιείς μόνο τα δεδομένα που σου δίνονται. Απαντάς ΜΟΝΟ με JSON: {"text": string (έως 45 λέξεις), "why": string[] (μία σύντομη πρόταση ανά προϊόν, ίδια σειρά, έως 12 λέξεις)}.` },
      { role: "user", content: JSON.stringify({ question: base.q, understood: base.understood, context: opts.context ?? null, products, noResults: base.products.length === 0 }) },
    ],
    json: true,
    maxTokens: Math.min(cfg.maxTokens, 400),
    timeoutMs: 9000,
  }).catch(() => null);
  const j = r ? parseJson<{ text?: string; why?: string[] }>(r.text) : null;
  if (!j?.text) return base;
  return { ...base, text: j.text, products: base.products.map((p, i) => ({ ...p, why: j.why?.[i]?.trim() || p.why })) };
}

/** Alt text + short title for an image (vision model). */
export async function describeImage(url: string, hint?: string): Promise<{ alt: string; title: string; tags: string[] } | null> {
  const cfg = await getAi();
  if (!cfg || (await overBudget(cfg))) return null;
  const r = await chat({
    feature: "alt-text",
    model: "vision",
    messages: [
      { role: "system", content: 'Γράφεις alt text για e-shop ηλεκτρικών (euronics.gr). Απαντάς ΜΟΝΟ με JSON {"alt": string (ελληνικά, έως 125 χαρακτήρες, περιγραφικό, χωρίς «εικόνα του»), "title": string (έως 6 λέξεις), "tags": string[] (3-6 λέξεις-κλειδιά, πεζά, ελληνικά ή brand)}.' },
      { role: "user", content: [{ type: "text", text: hint ? `Πληροφορίες: ${hint}` : "Περιέγραψε την εικόνα." }, { type: "image_url", image_url: { url } }] },
    ],
    json: true,
    maxTokens: 200,
    timeoutMs: 20000,
  }).catch(() => null);
  const j = r ? parseJson<{ alt?: string; title?: string; tags?: string[] }>(r.text) : null;
  return j?.alt ? { alt: j.alt.trim(), title: (j.title ?? "").trim(), tags: (j.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6) } : null;
}

/** Product web copy from ERP facts (title, specs). */
export async function productCopy(input: { brand: string; title: string; specs: { key: string; value: string }[]; category: string }): Promise<{ short: string; long: string; bullets: string[]; seoTitle: string; seoDescription: string } | null> {
  const cfg = await getAi();
  if (!cfg || (await overBudget(cfg))) return null;
  const r = await chat({
    feature: "copy",
    messages: [
      { role: "system", content: 'Γράφεις περιγραφές προϊόντων για το euronics.gr. Ελληνικά, σαφή, χωρίς υπερβολές, μόνο από τα δεδομένα. JSON: {"short": έως 30 λέξεις, "long": 2-3 παράγραφοι, "bullets": 4-6 σύντομα οφέλη, "seoTitle": έως 60 χαρακτήρες, "seoDescription": έως 155 χαρακτήρες}.' },
      { role: "user", content: JSON.stringify(input) },
    ],
    json: true,
    maxTokens: 900,
  }).catch(() => null);
  return r ? parseJson(r.text) : null;
}

export interface ApplianceId { kind: string; kindLabel: string; brand: string | null; model: string | null; serial: string | null; energyClass: string | null; ageYears: number | null; condition: string | null; dims: { w: number | null; h: number | null; d: number | null } | null; confidence: number; notes: string | null; isAppliance: boolean }
/** Vision: identify an appliance (or its rating plate) from a photo. */
export async function identifyAppliance(imageDataUrl: string, hint?: string): Promise<{ result: ApplianceId; costUsd: number } | null> {
  const cfg = await getAi();
  if (!cfg || (await overBudget(cfg))) return null;
  const r = await chat({
    feature: "snap",
    model: "vision",
    messages: [
      { role: "system", content: `Αναγνωρίζεις οικιακές ηλεκτρικές συσκευές από φωτογραφία (ή από την πινακίδα τους) για το euronics.gr. Απαντάς ΜΟΝΟ με JSON:
{"isAppliance": boolean, "kind": one of ["plyntiria","stegnotiria","psygeia","plyntiria-piaton","koyzines","air-condition","tileoraseis","skoypes","mikrosyskeves","smartphones","laptops","other"], "kindLabel": ελληνική ονομασία (π.χ. "Πλυντήριο ρούχων"), "brand": string|null, "model": string|null (ακριβής κωδικός μοντέλου αν διαβάζεται), "serial": string|null, "energyClass": string|null, "ageYears": number|null (εκτίμηση ηλικίας), "condition": "καλή"|"μέτρια"|"κακή"|null, "dims": {"w":cm|null,"h":cm|null,"d":cm|null}|null (μόνο αν φαίνονται/αναγράφονται), "confidence": 0..1, "notes": string|null (τι σε βοήθησε, έως 20 λέξεις)}. Μην επινοείς μοντέλο: null αν δεν διαβάζεται.` },
      { role: "user", content: [{ type: "text", text: hint ? `Στοιχεία από OCR: ${hint}` : "Τι συσκευή είναι αυτή;" }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    json: true,
    maxTokens: 400,
    timeoutMs: 30000,
  }).catch(() => null);
  const j = r ? parseJson<ApplianceId>(r.text) : null;
  if (!j) return null;
  return { result: { ...j, confidence: Number(j.confidence) || 0, dims: j.dims ?? null, notes: j.notes ?? null, brand: j.brand || null, model: j.model || null, serial: j.serial || null, energyClass: j.energyClass || null, ageYears: j.ageYears ?? null, condition: j.condition ?? null, kindLabel: j.kindLabel || j.kind }, costUsd: r!.costUsd };
}
