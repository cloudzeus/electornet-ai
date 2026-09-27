import "server-only";
import { chat, getAi, parseJson } from "@/lib/ai/openrouter";
import { autoLayout, HEADINGS, layoutFits, LAYOUTS, sectionHasContent, sectionText, uid, type SectionLayout, type Stat, type StudioDoc, type StudioFeature, type StudioSection } from "./banner-doc";

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

const bodyLen = (s: StudioSection) => s.paragraphs.reduce((n, p) => n + p.text.length, 0);
/** «Μικρο-ενότητα»: τίτλος + λίγες γραμμές, το πολύ ένα εικονίδιο, καμία φωτογραφία (π.χ. μία λειτουργία από λίστα λειτουργιών). */
const isMini = (s: StudioSection) => s.include && !!s.title?.text.trim() && !s.images.some((i) => i.include) && s.features.filter((f) => f.include).length <= 1 && bodyLen(s) <= 420 && !s.footnote?.text.trim() && !s.stats?.length;
/** Επικεφαλίδα χωρίς περιεχόμενο («Λειτουργίες», «Φίλτρα») — γίνεται ο τίτλος του πλέγματος που ακολουθεί. */
const isHeader = (s: StudioSection) => s.include && !!s.title?.text.trim() && !s.paragraphs.some((p) => p.text.trim()) && !s.features.some((f) => f.include) && !s.images.some((i) => i.include);

/** Μικρο-ενότητα → κάρτα: τίτλος, περιγραφή, το εικονίδιό της (κομμένο από το δικό της banner, `src`). */
function toCard(m: StudioSection, src?: string): StudioFeature {
  const f = m.features.find((x) => x.include);
  const extra = f && f.label.trim() && norm(f.label) !== norm(m.title!.text) ? f.label.trim() : "";
  return { id: uid("f"), label: m.title!.text.trim(), original: m.title!.original, detail: [extra, ...m.paragraphs.map((p) => p.text.trim())].filter(Boolean).join(" "), ...(src ? { src } : {}), box: m.title!.box, icon: f?.icon ?? null, include: true, includeIcon: !!(f?.icon && f.includeIcon) };
}

/** Καθαρό χαρτί πριν από κάθε σχεδιασμό: ό,τι είχε αλλάξει ο προηγούμενος σχεδιαστής αναιρείται (όχι όσα απέκλεισε άνθρωπος). */
export function resetDesign(doc: StudioDoc): StudioDoc {
  const sections = doc.sections.filter((s) => !s.crossMerged).map((s) => {
    const c = { ...s };
    if (c.dropReason || c.mergedInto) { c.include = true; delete c.dropReason; delete c.mergedInto; }
    delete c.rank; delete c.designedBy; delete c.heading;
    return c;
  });
  return { ...doc, sections };
}

/**
 * Μετά τη σειρά του σχεδιαστή:
 *   · μονές λειτουργίες που κατέληξαν η μία δίπλα στην άλλη (από ΔΙΑΦΟΡΕΤΙΚΑ banners) → ένα πλέγμα καρτών
 *   · κάρτες που επαναλαμβάνουν ό,τι ειπώθηκε ήδη πιο πάνω (ίδιος τίτλος) φεύγουν
 */
function mergeAndDedupe(refs: Ref[], docs: StudioDoc[]) {
  const live = refs.filter((r) => r.s.include).sort((a, b) => (a.s.rank ?? 0) - (b.s.rank ?? 0));
  // 1. διαδοχικές μονές λειτουργίες
  for (let i = 0; i < live.length; ) {
    let j = i; while (j < live.length && isMini(live[j].s)) j++;
    if (j - i >= 2) {
      const run = live.slice(i, j), host = run[0];
      const votes = new Map<string, number>(); run.forEach((r) => r.s.heading && votes.set(r.s.heading, (votes.get(r.s.heading) ?? 0) + 1));
      const heading = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Λειτουργίες";
      const merged: StudioSection = { id: uid("s"), include: true, crossMerged: true, layout: "features", rank: host.s.rank, designedBy: host.s.designedBy, heading, title: null, subtitle: null, paragraphs: [], footnote: null, images: [], features: run.map((r) => toCard(r.s, r.doc === host.doc ? undefined : docs[r.doc].sourceUrl)) };
      const at = docs[host.doc].sections.indexOf(host.s);
      docs[host.doc].sections.splice(at, 0, merged);
      run.forEach((r) => { r.s.include = false; r.s.mergedInto = merged.id; });
    }
    i = Math.max(j, i + 1);
  }
  // 2. διπλές κάρτες / ενότητες με τίτλο που ειπώθηκε ήδη
  const seen = new Set<string>();
  const ordered = docs.flatMap((d) => d.sections.filter((s) => s.include && sectionHasContent(s))).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const s of ordered) {
    const t = s.title ? norm(s.title.text) : "";
    if (t.length >= 4 && seen.has(t) && isMini(s)) { s.include = false; s.dropReason = "ο ίδιος τίτλος υπάρχει ήδη πιο πάνω"; continue; }
    if (t.length >= 4) seen.add(t);
    const cards = s.features.filter((f) => f.include);
    if (cards.length >= 3) {
      // ίδιο ή σύντομη μορφή του ίδιου («Τεχνητή Νοημοσύνη» ↔ «Τεχνητή Νοημοσύνη AI»)
      const dup = cards.filter((f) => { const k = norm(f.label); return k.length >= 4 && (seen.has(k) || (k.length >= 8 && [...seen].some((x) => x.length >= 8 && (x.startsWith(k) || k.startsWith(x))))); });
      if (dup.length && dup.length < cards.length) dup.forEach((f) => { f.include = false; });
    }
    cards.filter((f) => f.include).forEach((f) => { const k = norm(f.label); if (k.length >= 4) seen.add(k); });
  }
}

/**
 * Ενώνει διαδοχικές μικρο-ενότητες του ίδιου banner (≥ 3) σε ΕΝΑ πλέγμα καρτών: εικονίδιο, τίτλος, περιγραφή.
 * Μια λίστα 25 λειτουργιών δεν είναι 25 ενότητες η μία κάτω από την άλλη — είναι μία ενότητα «Λειτουργίες».
 */
export function groupMiniSections(doc: StudioDoc): StudioDoc {
  const out: StudioSection[] = [];
  let run: StudioSection[] = [];
  const flush = () => {
    if (run.length >= 3) {
      const prev = out[out.length - 1], header = prev && isHeader(prev) ? out.pop()! : null;
      out.push({
        id: uid("s"), include: true, layout: "features",
        title: header?.title ?? null, subtitle: header?.subtitle ?? null, paragraphs: [], footnote: null, images: [],
        features: run.map((m) => toCard(m)),
      });
    } else out.push(...run);
    run = [];
  };
  for (const s of doc.sections) { if (isMini(s)) run.push(s); else { flush(); out.push(s); } }
  flush();
  return { ...doc, sections: out };
}

export async function designPage(input: StudioDoc[], product: { brand: string; title: string; typeName: string }): Promise<{ docs: StudioDoc[]; by: "ai" | "rules"; costUsd: number; dropped: number }> {
  const docs: StudioDoc[] = structuredClone(input).map(resetDesign).map(groupMiniSections);
  const refs: Ref[] = docs.flatMap((d, di) => d.sections.filter((s) => s.include && sectionHasContent(s)).map((s, si) => ({ key: `s${di}_${si}`, doc: di, s })));
  if (!refs.length) return { docs, by: "rules", costUsd: 0, dropped: 0 };
  const cfg = await getAi();
  if (!cfg) { byRules(refs, docs); mergeAndDedupe(refs, docs); return { docs, by: "rules", costUsd: 0, dropped: 0 }; }

  const listing = refs.map((r) => {
    const sh = shape(r.s, docs[r.doc]);
    return { id: r.key, banner: r.doc + 1, ...(isMini(r.s) ? { single_feature: true } : {}), title: r.s.title?.text ?? null, text: sh.text.slice(0, 320), textChars: sh.textChars, features: r.s.features.filter((f) => f.include).map((f) => (f.detail ? `${f.label} — ${f.detail.slice(0, 60)}` : f.label)).slice(0, 10), images: sh.imgs, footnote: !!r.s.footnote?.text };
  });
  const r = await chat({
    feature: "banner-design", model: DESIGN_MODEL, json: true, maxTokens: 5000, temperature: 0.2, timeoutMs: 45000, reasoning: "low",
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
SINGLE FEATURES: sections marked "single_feature" explain one function each (title + 1–3 sentences). Rank related single features CONSECUTIVELY — consecutive ones are shown together as one grid of cards.
HEADING: for every section with title null, and for every single_feature section, return "heading" = the best fitting group name from this closed list (exact string): ${HEADINGS.map((h) => `"${h}"`).join(", ")}. Otherwise omit it.
DROP a section only if it repeats another section's message (keep the richer one), or carries no product information (only a logo, only the product name, generic "product details" filler). Never drop more than a third of the sections.
"why" ≤ 8 words. Return ONLY JSON: {"sections":[{"id":string,"layout":string,"rank":number,"drop":boolean,"why":string,"heading"?:string,"stats":[{"value":string,"label":string}]}]}` },
      { role: "user", content: JSON.stringify({ product: `${product.brand} ${product.title}`, type: product.typeName, sections: listing }) },
    ],
  }).catch((e) => { if (process.env.DEBUG_DESIGN) console.error("design:", e); return null; });
  if (process.env.DEBUG_DESIGN) console.error("design raw:", r?.text?.length, r?.text?.slice(-300));
  const j = r ? parseJson<{ sections?: { id?: string; layout?: string; rank?: number; drop?: boolean; why?: string; heading?: string; stats?: unknown }[] }>(r.text) : null;
  if (!j?.sections?.length) { byRules(refs, docs); mergeAndDedupe(refs, docs); return { docs, by: "rules", costUsd: r?.costUsd ?? 0, dropped: 0 }; }

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
    if (typeof d?.heading === "string" && (HEADINGS as readonly string[]).includes(d.heading) && (!ref.s.title?.text.trim() || isMini(ref.s))) ref.s.heading = d.heading;
    if (allowDrops && d?.drop) { ref.s.include = false; ref.s.dropReason = String(d.why ?? "διπλή ή χωρίς πληροφορία").slice(0, 160); dropped++; }
  });
  // σταθερή αρίθμηση 1…n με τη σειρά του σχεδιαστή
  [...refs].sort((a, b) => (a.s.rank ?? 0) - (b.s.rank ?? 0)).forEach((x, i) => { x.s.rank = i + 1; });
  mergeAndDedupe(refs, docs);
  return { docs, by: "ai", costUsd: r?.costUsd ?? 0, dropped };
}
