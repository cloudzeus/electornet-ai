import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { parseDescription } from "@/lib/softone/describe";
import { sectionText, type StudioDoc } from "@/lib/catalog/banner-doc";
import { loadGroups, groupOfCategory } from "@/lib/catalog/supplier-sheet";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { specLines, eprelDimsCm, classLabel } from "@/lib/eprel/normalize";
import type { EprelRaw } from "@/lib/eprel/client";
import { validateSuggestion, type AiAnswer, type SpecSuggestion, type SuggestedDims } from "@/lib/catalog/spec-suggest-core";

/**
 * «Πρόταση από την απόδελτίωση» (Γρήγορη διόρθωση, σελίδα Πληρότητα): από το κείμενο των banners που αποδελτιώθηκαν
 * (πρόχειρα και δημοσιευμένες ενότητες) βγάζει τιμές για τα χαρακτηριστικά της ομάδας της κατηγορίας, διαστάσεις και
 * βάρος. Μία κλήση AI ανά πάτημα· κάθε τιμή ελέγχεται (validateSuggestion) ότι στηρίζεται σε απόσπασμα του κειμένου.
 * Δεύτερη πηγή το EPREL (ενεργειακή κλάση, κατανάλωση, χωρητικότητα, θόρυβος, διαστάσεις…): αν το προϊόν δεν έχει
 * συνδεθεί και η κατηγορία έχει ενεργειακή ετικέτα, γίνεται πρώτα αναζήτηση στο EPREL. Οι διαστάσεις που έχουν ήδη βρεθεί
 * (EPREL, περιγραφή SoftOne) προτείνονται χωρίς AI. Τίποτα δεν γράφεται στο SoftOne εδώ.
 */
const MAX_TEXT = 14000;

export interface SuggestResult extends SpecSuggestion {
  group: string | null;
  /** από πού διαβάστηκε το κείμενο */
  sources: { extractions: number; sections: number; banners: number; eprel: string | null };
  aiUsed: boolean;
  note: string | null;
}

export async function suggestSpecs(productId: string): Promise<SuggestResult | null> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true, erpCode: true, source: true, brand: { select: { name: true } }, category: { select: { name: true, erpCode: true } } } });
  if (!p) return null;
  const mtrl = Number(p.erpCode);
  const [item, extractions, sections, banners, dimRows] = await Promise.all([
    p.source === "softone" && Number.isInteger(mtrl) ? db.s1Item.findUnique({ where: { mtrl }, select: { longDesc: true, specGroupS1Id: true } }) : null,
    db.bannerExtraction.findMany({ where: { productId, status: { not: "discarded" } }, orderBy: { createdAt: "desc" }, take: 20, select: { doc: true } }),
    db.productSection.findMany({ where: { productId, hidden: false }, select: { title: true, subtitle: true, body: true, features: true, footnote: true, stats: true } }),
    db.media.count({ where: { productId, kind: "banner" } }),
    db.productDimension.findMany({ where: { productId }, orderBy: { source: "asc" } }),
  ]);
  // EPREL: η συνδεδεμένη καταχώριση· αλλιώς αναζήτηση τώρα (μόνο για κατηγορίες με ενεργειακή ετικέτα)
  const eprelOf = () => db.energyLabel.findUnique({ where: { productId }, select: { class: true, eprel: { select: { registrationNumber: true, modelIdentifier: true, data: true } } } });
  let energy = await eprelOf();
  if (!energy?.eprel && hasEnergyLabel(p.category.name)) {
    const { matchProductEprel } = await import("@/lib/catalog/eprel-match");
    const m = await matchProductEprel(productId).catch(() => null);
    if (m?.ok && m.status === "matched") energy = await eprelOf();
  }
  const eprelText = energy?.eprel ? [`EPREL ${energy.eprel.modelIdentifier}`, ...(energy.class ? [`Ενεργειακή κλάση: ${classLabel(energy.class)}`] : []), ...specLines(energy.eprel.data).map((l) => `${l.label}: ${l.value}${l.unit ? ` ${l.unit}` : ""}`)].join("\n") : "";
  const eprelDims = energy?.eprel ? eprelDimsCm(energy.eprel.data as EprelRaw) : null;

  const groupId = groupOfCategory(p.category.erpCode) ?? item?.specGroupS1Id ?? null;
  const group = groupId != null ? (await loadGroups([groupId])).get(groupId) ?? null : null;
  const defs = (group?.specs ?? []).map((s) => ({ name: s.name, options: s.options.map((o) => o.name) }));
  const existing = parseDescription(item?.longDesc ?? "").specs.map((s) => s.key);

  // διαστάσεις που υπάρχουν ήδη στα δεδομένα μας (EPREL / περιγραφή) — του σώματος πρώτα
  const SRC: Record<string, string> = { eprel: "EPREL", "s1-desc": "περιγραφή SoftOne", manual: "χειροκίνητα" };
  const known: SuggestedDims[] = [...dimRows].sort((a, b) => Number(b.kind === "product") - Number(a.kind === "product"))
    .map((r) => ({ w: r.w, h: r.h, d: r.d, quote: `${r.rawKey ?? "Διαστάσεις"}: ${r.rawValue ?? ""}`.slice(0, 160), source: SRC[r.source] ?? r.source }));
  if (eprelDims && !known.some((k) => k.w === eprelDims.w && k.h === eprelDims.h && k.d === eprelDims.d)) known.push({ ...eprelDims, quote: `EPREL ${energy?.eprel?.registrationNumber}`, source: "EPREL" });

  const text = [
    eprelText,
    ...extractions.flatMap((e) => ((e.doc as unknown as StudioDoc)?.sections ?? []).map((s) => [sectionText(s), ...(s.stats ?? []).map((x) => `${x.value} ${x.label}`)].join(" \n "))),
    ...sections.map((s) => [s.title, s.subtitle, s.body, ...((s.features as { label?: string; text?: string }[] | null) ?? []).flatMap((f) => [f.label, f.text]), ...((s.stats as { value?: string; label?: string }[] | null) ?? []).map((x) => `${x.value ?? ""} ${x.label ?? ""}`), s.footnote].filter(Boolean).join(" \n ")),
  ].filter((t) => t.trim()).filter((t, i, a) => a.indexOf(t) === i).join("\n\n").slice(0, MAX_TEXT);

  const base = { group: group?.name ?? null, sources: { extractions: extractions.length, sections: sections.length, banners, eprel: energy?.eprel?.registrationNumber ?? null }, specs: [], dims: known, weight: null };
  if (!text.trim()) return { ...base, aiUsed: false, note: banners ? "Τα banners του προϊόντος δεν έχουν αποδελτιωθεί ακόμα και δεν βρέθηκε στο EPREL." : "Δεν υπάρχει απόδελτίωση, banners ή καταχώριση EPREL για αυτό το προϊόν." };
  const cfg = await getAi();
  if (!cfg) return { ...base, aiUsed: false, note: "Δεν έχει οριστεί κλειδί AI (Ρυθμίσεις → AI)." };
  if (await overBudget(cfg)) return { ...base, aiUsed: false, note: "Έφτασε το ημερήσιο όριο κόστους AI." };

  const system = `Διαβάζεις για ΕΝΑ προϊόν τα τεχνικά της καταχώρισής του στο EPREL (αν υπάρχουν, στην αρχή) και το κείμενο που αποδελτιώθηκε από τα banners του κατασκευαστή και συμπληρώνεις τα χαρακτηριστικά του. Απαντάς ΜΟΝΟ με JSON: {"specs":[{"name":string (ακριβώς ένα από τα ονόματα της λίστας),"value":string,"quote":string}],"dims":{"w":number,"h":number,"d":number,"unit":"mm"|"cm"|"m","quote":string}|null,"weight":{"value":number,"unit":"g"|"kg","quote":string}|null}. Κανόνες: μόνο τιμές που ΓΡΑΦΟΝΤΑΙ ρητά στο κείμενο — ποτέ εκτίμηση. "quote" = αυτούσιο απόσπασμα του κειμένου (έως 15 λέξεις) που δείχνει την τιμή. Αν το χαρακτηριστικό έχει "options", το value είναι ΑΚΡΙΒΩΣ ένα από αυτά. Χωρίς μονάδα στο value όταν η μονάδα είναι ήδη στο όνομα. dims: πλάτος (w), ύψος (h), βάθος (d) του ίδιου του προϊόντος (όχι συσκευασίας). weight: καθαρό βάρος προϊόντος. Ό,τι δεν αναφέρεται → παράλειψη / null.`;
  const user = { product: `${p.brand.name} ${p.title}`, category: p.category.name, specs: defs.map((d) => (d.options.length ? { name: d.name, options: d.options.slice(0, 40) } : { name: d.name })), text };
  const ask = (model?: "main") => chat({ feature: "spec-suggest", model, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }], json: true, maxTokens: Math.max(cfg.maxTokens, 3000), reasoning: "low", timeoutMs: 45000 })
    .then((r) => parseJson<AiAnswer>(r.text)).catch(() => null);
  // το αυτόματο μοντέλο κάποτε εξαντλεί τα tokens χωρίς έγκυρο JSON: μία ακόμη φορά με το κύριο
  const ans = (await ask()) ?? (await ask("main"));
  if (!ans) return { ...base, aiUsed: false, note: "Το AI δεν απάντησε — δοκίμασε ξανά." };
  const v = validateSuggestion(ans, defs, text, existing);
  return { ...base, specs: v.specs, dims: v.dims ? [v.dims, ...known] : known, weight: v.weight, aiUsed: true, note: v.specs.length || v.dims || v.weight ? null : "Δεν βρέθηκαν τιμές για τα χαρακτηριστικά της κατηγορίας στο κείμενο της απόδελτίωσης." };
}
