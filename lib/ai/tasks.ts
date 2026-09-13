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
