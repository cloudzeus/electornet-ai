import "server-only";
import { chat, getAi, parseJson } from "@/lib/ai/openrouter";
import { autoLayout, layoutFits, LAYOUTS, sectionHasContent, sectionText, type SectionLayout, type Stat, type StudioDoc, type StudioSection } from "./banner-doc";

/**
 * Σχεδιαστής σελίδας: από τις ενότητες ΟΛΩΝ των banners ενός προϊόντος φτιάχνει μια σελίδα που διαβάζεται σαν ιστορία.
 * Διαλέγει διάταξη ανά ενότητα, σειρά (άνοιγμα με την πιο δυνατή εικόνα → οφέλη → λεπτομέρειες → πιστοποιήσεις → ψιλά
 * γράμματα), πετά διπλές / κενές ενότητες και βγάζει «μεγάλα νούμερα». ΔΕΝ γράφει νέο κείμενο: τα νούμερα και οι λεζάντες
 * τους ελέγχονται ότι υπάρχουν αυτούσια στο κείμενο της ενότητας. Ό,τι δεν περνά τον έλεγχο πέφτει σε κανόνες (autoLayout).
 */
export const DESIGN_MODEL = process.env.BANNER_DESIGN_MODEL || "google/gemini-3.8-flash";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.,]+/g, "");
const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-zα-ω0-9]+/).filter((w) => w.length >= 4);

interface Ref { key: string; doc: number; s: StudioSection }
const shape = (s: StudioSection, doc: StudioDoc) => {
  const imgs = s.images.filter((i) => i.include).map((i) => ({ kind: i.kind, ratio: +((i.box[2] * doc.width) / Math.max(1, i.box[3] * doc.height)).toFixed(2), overlayText: i.overlayText }));
  const text = [s.subtitle?.text, ...s.paragraphs.map((p) => p.text)].filter(Boolean).join(" ");
  return { imgs, features: s.features.filter((f) => f.include && f.label.trim()).length, textChars: text.length, text };
};

/** Μόνο νούμερα που υπάρχουν αυτούσια στο κείμενο, με λεζάντα από λέξεις του ίδιου κειμένου. */
function validStats(raw: unknown, s: StudioSection): Stat[] {
  if (!Array.isArray(raw)) return [];
  const all = sectionText(s), n = norm(all), w = new Set(words(all));
  return raw.map((x) => ({ value: String((x as Stat)?.value ?? "").trim(), label: String((x as Stat)?.label ?? "").trim() }))
    .filter((x) => x.value && x.label && x.value.length <= 14 && x.label.length <= 48 && /\d/.test(x.value) && n.includes(norm(x.value)))
    .filter((x) => { const lw = words(x.label); return lw.length === 0 || lw.filter((k) => w.has(k)).length / lw.length >= 0.5; })
    .slice(0, 4);
}

/** Κανόνες χωρίς AI: διάταξη από το σχήμα του περιεχομένου, σειρά όπως στα banners με την πιο «ανοιχτική» εικόνα πρώτη. */
function byRules(refs: Ref[], docs: StudioDoc[]) {
  refs.forEach((r, i) => {
    const sh = shape(r.s, docs[r.doc]);
    r.s.layout = autoLayout({ images: sh.imgs, features: sh.features, stats: r.s.stats?.length ?? 0, textChars: sh.textChars });
    r.s.rank = i + 1; r.s.designedBy = "rules";
  });
  const hero = refs.find((r) => r.s.layout === "hero");
  if (hero && hero.s.rank !== 1) { refs.forEach((r) => { if (r !== hero) r.s.rank! += 1; }); hero.s.rank = 1; }
}

export async function designPage(input: StudioDoc[], product: { brand: string; title: string; typeName: string }): Promise<{ docs: StudioDoc[]; by: "ai" | "rules"; costUsd: number; dropped: number }> {
  const docs: StudioDoc[] = structuredClone(input);
  const refs: Ref[] = docs.flatMap((d, di) => d.sections.filter((s) => s.include && sectionHasContent(s)).map((s, si) => ({ key: `s${di}_${si}`, doc: di, s })));
  if (!refs.length) return { docs, by: "rules", costUsd: 0, dropped: 0 };
  const cfg = await getAi();
  if (!cfg) { byRules(refs, docs); return { docs, by: "rules", costUsd: 0, dropped: 0 }; }

  const listing = refs.map((r) => {
    const sh = shape(r.s, docs[r.doc]);
    return { id: r.key, banner: r.doc + 1, title: r.s.title?.text ?? null, text: sh.text.slice(0, 320), textChars: sh.textChars, features: r.s.features.filter((f) => f.include).map((f) => f.label).slice(0, 8), images: sh.imgs, footnote: !!r.s.footnote?.text };
  });
  const r = await chat({
    feature: "banner-design", model: DESIGN_MODEL, json: true, maxTokens: 2500, temperature: 0.2, timeoutMs: 45000, reasoning: "low",
    messages: [
      { role: "system", content: `You are the art director of an electronics e-shop product page. You receive the content sections extracted from the manufacturer's marketing banners of ONE product (several banners, in their original order). Design the page: choose a layout for each section, the order of the story, and drop duplicates. You NEVER write new text.
LAYOUTS: ${LAYOUTS.map((l) => `"${l.key}" = ${l.hint}`).join(" · ")}.
- "hero": a wide lifestyle/product photo (ratio ≥ 1.4) with a short headline — ideal to OPEN the page. Use at most 1–2 heroes per page.
- "split": photo + meaningful text side by side — the workhorse for feature explanations.
- "features": 3+ short labelled items (with or without icons).
- "stats": a section whose text contains 2–4 strong numbers (e.g. "512 ζώνες", "144Hz", "5000:1", "9 kg", "A+++"): also return them in "stats" as {value,label}; value copied VERBATIM from the text (≤ 14 chars), label = 1–5 words copied from the same text.
- "gallery": 2+ photos with little text. "badges": ONLY rows of certification/partner LOGOS (very wide, short image) — never technical drawings or dimension diagrams (those are "split"). "text": no photo.
- A specification table (many "label: value" lines) is "features".
STORY ORDER (rank 1 = top): 1) the most striking hero/lifestyle opener; 2) the key benefits (stats, features); 3) detailed feature sections (split), grouping related topics together (picture quality with picture quality, sound with sound, energy with energy); 4) galleries/details; 5) certifications/badges; 6) text-heavy or legal-heavy sections last.
DROP a section only if it repeats another section's message (keep the richer one), or carries no product information (only a logo, only the product name, generic "product details" filler). Never drop more than a third of the sections.
Return ONLY JSON: {"sections":[{"id":string,"layout":string,"rank":number,"drop":boolean,"why":string,"stats":[{"value":string,"label":string}]}]}` },
      { role: "user", content: JSON.stringify({ product: `${product.brand} ${product.title}`, type: product.typeName, sections: listing }) },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ sections?: { id?: string; layout?: string; rank?: number; drop?: boolean; why?: string; stats?: unknown }[] }>(r.text) : null;
  if (!j?.sections?.length) { byRules(refs, docs); return { docs, by: "rules", costUsd: r?.costUsd ?? 0, dropped: 0 }; }

  const out = new Map(j.sections.filter((x) => typeof x.id === "string").map((x) => [x.id!, x]));
  const drops = refs.filter((x) => out.get(x.key)?.drop === true);
  const allowDrops = drops.length <= Math.ceil(refs.length / 3); // ασφάλεια: ο σχεδιαστής δεν αδειάζει τη σελίδα
  let dropped = 0;
  refs.forEach((ref, i) => {
    const d = out.get(ref.key), sh = shape(ref.s, docs[ref.doc]);
    ref.s.stats = validStats(d?.stats, ref.s);
    const want = (LAYOUTS.find((l) => l.key === d?.layout)?.key ?? null) as SectionLayout | null;
    const fits = (l: SectionLayout) => layoutFits(l, { images: sh.imgs.length, features: sh.features, stats: ref.s.stats?.length ?? 0, textChars: sh.textChars, ratios: sh.imgs.map((i) => i.ratio) });
    ref.s.layout = want && fits(want) ? want : autoLayout({ images: sh.imgs, features: sh.features, stats: ref.s.stats?.length ?? 0, textChars: sh.textChars });
    ref.s.rank = typeof d?.rank === "number" && Number.isFinite(d.rank) ? d.rank : 100 + i;
    ref.s.designedBy = "ai";
    if (allowDrops && d?.drop) { ref.s.include = false; ref.s.dropReason = String(d.why ?? "διπλή ή χωρίς πληροφορία").slice(0, 160); dropped++; }
  });
  // σταθερή αρίθμηση 1…n με τη σειρά του σχεδιαστή
  [...refs].sort((a, b) => (a.s.rank ?? 0) - (b.s.rank ?? 0)).forEach((x, i) => { x.s.rank = i + 1; });
  return { docs, by: "ai", costUsd: r?.costUsd ?? 0, dropped };
}
