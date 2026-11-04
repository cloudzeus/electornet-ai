import type { PublishedSection } from "./banner-doc";

/**
 * Η περιγραφή του ERP είναι ελεύθερο κείμενο, αλλά σχεδόν πάντα έχει δομή που χάνεται σε μία παράγραφο:
 * γραμμές «ΤΙΤΛΟΣ : α, β, γ» (λειτουργίες, προγράμματα) και κανονικές παραγράφους. Εδώ οι πρώτες γίνονται
 * τίτλος + λίστα, οι δεύτερες παράγραφοι (απόδοση: components/pdp/RichDescription.tsx).
 */
export type Block = { kind: "p"; text: string } | { kind: "list"; title: string | null; items: string[] };
const tidy = (s: string) => { const t = s.trim().replace(/[.;]+$/, ""); return t ? t[0].toLocaleUpperCase("el-GR") + t.slice(1) : t; };
/** Το ERP γράφει τις επικεφαλίδες με κεφαλαία χωρίς τόνους· οι συχνές παίρνουν τη σωστή γραφή, οι υπόλοιπες απλώς πεζά. */
const HEADINGS: Record<string, string> = { "ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Χαρακτηριστικά", "ΑΛΛΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Άλλα χαρακτηριστικά", "ΓΕΝΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Γενικά χαρακτηριστικά", "ΤΕΧΝΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Τεχνικά χαρακτηριστικά", "ΠΡΟΓΡΑΜΜΑΤΑ": "Προγράμματα", "ΛΕΙΤΟΥΡΓΙΕΣ": "Λειτουργίες", "ΑΣΦΑΛΕΙΑ": "Ασφάλεια", "ΣΥΝΔΕΣΙΜΟΤΗΤΑ": "Συνδεσιμότητα", "ΓΕΝΙΚΑ": "Γενικά", "ΕΞΟΠΛΙΣΜΟΣ": "Εξοπλισμός", "ΑΞΕΣΟΥΑΡ": "Αξεσουάρ", "ΠΕΡΙΛΑΜΒΑΝΕΙ": "Περιλαμβάνει", "ΣΥΝΤΗΡΗΣΗ": "Συντήρηση", "ΚΑΤΑΨΥΞΗ": "Κατάψυξη", "ΑΠΟΔΟΣΗ": "Απόδοση", "ΑΝΕΣΗ": "Άνεση" };
const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const titleCase = (s: string) => HEADINGS[strip(s).toLocaleUpperCase("el-GR").trim()] ?? (s === s.toLocaleUpperCase("el-GR") ? s[0] + s.slice(1).toLocaleLowerCase("el-GR") : s);

export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim(); if (!line) continue;
    const m = /^([^:]{3,40}?)\s*:\s*(.+)$/.exec(line);
    const items = m ? m[2].split(/\s*,\s*(?![^()]*\))/).map(tidy).filter(Boolean) : [];
    if (m && items.length >= 3 && m[1].split(/\s+/).length <= 4) out.push({ kind: "list", title: titleCase(m[1].trim()), items });
    else out.push({ kind: "p", text: line });
  }
  // σειρές από σύντομες γραμμές («18000BTU», «Wi-Fi Installed», «Ιονισμός»…) ήταν μία παράγραφος η καθεμία — γίνονται λίστα
  const short = (b: Block) => b.kind === "p" && b.text.length <= 60 && !/[.!;]$/.test(b.text);
  const grouped: Block[] = [];
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && short(out[j])) j++;
    if (j - i >= 3) { grouped.push({ kind: "list", title: null, items: out.slice(i, j).map((b) => tidy((b as { text: string }).text)) }); i = j; }
    else grouped.push(out[i++]);
  }
  return grouped;
}

const words = (s: string) => (s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-zα-ω0-9]{4,}/g) ?? []);
/**
 * Με ενότητες από τον κατασκευαστή, η περιγραφή του ERP συχνά λέει τα ίδια (αντιγραμμένα από τα ίδια banners):
 * παράγραφος που τα λόγια της υπάρχουν σχεδόν όλα στις ενότητες φεύγει — μένει ό,τι λέει κάτι παραπάνω
 * (π.χ. η πρώτη γραμμή με τις βασικές προδιαγραφές).
 */
export function withoutRepeats(blocks: Block[], sections: PublishedSection[]): Block[] {
  if (!sections.length) return blocks;
  const known = new Set(sections.flatMap((s) => words([s.title, s.subtitle, s.body, ...s.features.flatMap((f) => [f.label, f.text])].filter(Boolean).join(" "))));
  const said = (t: string, min: number) => { const w = words(t); return w.length > 0 && w.filter((x) => known.has(x)).length / w.length >= min; };
  return blocks.flatMap((b, i): Block[] => {
    // η πρώτη σύντομη γραμμή με νούμερα είναι η σύνοψη προδιαγραφών («Οθόνη 50", 3840 x 2160, …») — μένει πάντα
    if (b.kind === "p" && i === 0 && b.text.length <= 220 && /\d/.test(b.text)) return [b];
    if (b.kind === "p") return said(b.text, b.text.length <= 60 ? 1 : 0.7) ? [] : [b];
    const items = b.items.filter((it) => !said(it, 1));
    return items.length ? [{ ...b, items }] : [];
  });
}
