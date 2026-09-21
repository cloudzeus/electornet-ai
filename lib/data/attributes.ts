import type { Product, Spec } from "./types";

/**
 * Characteristics layer. The ERP (and the scraped specs) name the same
 * attribute in several ways («Εύρος Οθόνης», «Διαγώνιος», «Μέγεθος
 * Οθόνης»). Here every product is reduced to a canonical, comparable set
 * of attributes so that:
 *  · the listing can offer characteristic facets (?f_Διαγώνιος=55"|65")
 *  · the compare table lines the same row up across products
 *  · the PDP «σύγκρινε με παρόμοια» finds shared keys.
 * Missing values are derived from the title / energy label where safe.
 */
export interface Attr {
  key: string;
  value: string;
  group: string;
}

type Rule = { canon: string; group: string; norm?: (v: string) => string | null };

const inches = (v: string) => {
  const m = v.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)/);
  return m ? `${m[1].replace(".", ",")}"` : null;
};
const yesNo = (v: string) => (/^(ναι|yes|wi-?fi)/i.test(v.trim()) ? "Ναι" : /^(όχι|no)/i.test(v.trim()) ? "Όχι" : v);
const resolution = (v: string) => {
  if (/8k|7680/i.test(v)) return "8K";
  if (/4k|uhd|3840|2160/i.test(v)) return "4K UHD";
  if (/full hd|1920|1080/i.test(v)) return "Full HD";
  if (/\bhd\b|1366|720/i.test(v)) return "HD";
  return v;
};
const firstNumber = (unit: string) => (v: string) => {
  const m = v.match(/(\d+(?:[.,]\d+)?)/);
  return m ? `${m[1]} ${unit}` : v;
};
const btu = (v: string) => {
  const m = v.replace(/\./g, "").match(/(\d{4,5})/);
  return m ? `${Number(m[1]).toLocaleString("el-GR")} BTU` : v;
};

const RULES: Record<string, Rule> = {
  "Εύρος Οθόνης": { canon: "Διαγώνιος", group: "Οθόνη", norm: inches },
  Διαγώνιος: { canon: "Διαγώνιος", group: "Οθόνη", norm: inches },
  "Μέγεθος Οθόνης": { canon: "Διαγώνιος", group: "Οθόνη", norm: inches },
  "Τεχνολογία Panel": { canon: "Τεχνολογία panel", group: "Οθόνη" },
  "Τεχνολογία panel": { canon: "Τεχνολογία panel", group: "Οθόνη" },
  "Ανάλυση Οθόνης": { canon: "Ανάλυση", group: "Οθόνη", norm: resolution },
  Ανάλυση: { canon: "Ανάλυση", group: "Οθόνη", norm: resolution },
  "Ρυθμός Ανανέωσης Εικόνας": { canon: "Ρυθμός ανανέωσης", group: "Οθόνη", norm: firstNumber("Hz") },
  "Ρυθμός ανανέωσης": { canon: "Ρυθμός ανανέωσης", group: "Οθόνη", norm: firstNumber("Hz") },
  "Smart TV": { canon: "Smart TV", group: "Συνδεσιμότητα", norm: yesNo },
  WiFi: { canon: "Wi-Fi", group: "Συνδεσιμότητα", norm: yesNo },
  "WiFi / Bluetooth": { canon: "Wi-Fi", group: "Συνδεσιμότητα", norm: yesNo },
  Συνδεσιμότητα: { canon: "Wi-Fi", group: "Συνδεσιμότητα", norm: yesNo },
  Bluetooth: { canon: "Bluetooth", group: "Συνδεσιμότητα", norm: yesNo },
  "Δέκτης DVB-T2": { canon: "DVB-T2", group: "Συνδεσιμότητα", norm: yesNo },
  "DVB-T2 / S2": { canon: "DVB-T2", group: "Συνδεσιμότητα", norm: yesNo },
  HDMI: { canon: "HDMI", group: "Συνδεσιμότητα" },
  USB: { canon: "USB", group: "Συνδεσιμότητα" },
  "Ονομαστική απόδοση": { canon: "Απόδοση (BTU)", group: "Απόδοση", norm: btu },
  "Ισχύς ψύξης": { canon: "Απόδοση (BTU)", group: "Απόδοση", norm: btu },
  "Ψυκτική Ισχύς": { canon: "Ψυκτική ισχύς", group: "Απόδοση" },
  "Θερμική Ισχύς": { canon: "Θερμική ισχύς", group: "Απόδοση" },
  "Ενεργειακή Κλάση Ψύξης": { canon: "Ενεργειακή κλάση", group: "Απόδοση" },
  "Ενεργειακή κλάση ψύξης / θέρμανσης": { canon: "Ενεργειακή κλάση", group: "Απόδοση", norm: (v) => v.split("/")[0].trim() },
  "Ενεργειακή κλάση": { canon: "Ενεργειακή κλάση", group: "Απόδοση" },
  "Ενεργειακή Κλάση Θέρμανσης": { canon: "Κλάση θέρμανσης", group: "Απόδοση" },
  "SEER / SCOP": { canon: "SEER / SCOP", group: "Απόδοση" },
  Ιονιστής: { canon: "Ιονιστής", group: "Λειτουργίες", norm: yesNo },
  "Intelligent Eye": { canon: "Αισθητήρας παρουσίας", group: "Λειτουργίες", norm: yesNo },
  "Ηχητική Ισχύς Εσωτερικής Μονάδας": { canon: "Θόρυβος", group: "Απόδοση", norm: firstNumber("dB") },
  "Ηχητική Ισχύς": { canon: "Θόρυβος", group: "Απόδοση", norm: firstNumber("dB") },
  "Στάθμη θορύβου": { canon: "Θόρυβος", group: "Απόδοση", norm: firstNumber("dB") },
  "Θόρυβος στύψιμο": { canon: "Θόρυβος", group: "Απόδοση", norm: firstNumber("dB") },
  Χωρητικότητα: { canon: "Χωρητικότητα", group: "Επιδόσεις" },
  "Αποθηκευτικός χώρος": { canon: "Χωρητικότητα", group: "Επιδόσεις" },
  "Μνήμη RAM": { canon: "Μνήμη RAM", group: "Επιδόσεις" },
  RAM: { canon: "Μνήμη RAM", group: "Επιδόσεις" },
  Επεξεργαστής: { canon: "Επεξεργαστής", group: "Επιδόσεις" },
  Στροφές: { canon: "Στροφές", group: "Επιδόσεις", norm: firstNumber("σ.α.λ.") },
  "Βασική Κάμερα": { canon: "Κάμερα", group: "Κάμερα", norm: firstNumber("MP") },
  Κύρια: { canon: "Κάμερα", group: "Κάμερα", norm: firstNumber("MP") },
  Selfie: { canon: "Selfie κάμερα", group: "Κάμερα", norm: firstNumber("MP") },
  "Dual SIM": { canon: "Dual SIM", group: "Συνδεσιμότητα", norm: yesNo },
  "4G/5G": { canon: "5G", group: "Συνδεσιμότητα", norm: (v) => (/5g/i.test(v) ? "Ναι" : "Όχι") },
  "5G / Dual SIM": { canon: "5G", group: "Συνδεσιμότητα", norm: (v) => (/5g/i.test(v) ? "Ναι" : "Όχι") },
  Λειτουργικό: { canon: "Λειτουργικό", group: "Επιδόσεις" },
  Χρώμα: { canon: "Χρώμα", group: "Εμφάνιση" },
  Αυτονομία: { canon: "Αυτονομία", group: "Επιδόσεις" },
  Ισχύς: { canon: "Ισχύς", group: "Επιδόσεις", norm: firstNumber("W") },
  Πίεση: { canon: "Πίεση", group: "Επιδόσεις", norm: firstNumber("bar") },
  Εγγύηση: { canon: "Εγγύηση", group: "Γενικά" },
  "Υ × Π × Β": { canon: "Διαστάσεις (Υ×Π×Β)", group: "Διαστάσεις" },
};

const COLOURS = ["Μαύρο", "Λευκό", "Μπλε", "Ασημί", "Γκρι", "Χρυσό", "Κόκκινο", "Πράσινο", "Ροζ", "Μωβ", "Inox", "Midnight", "Blue", "Black", "White", "Silver", "Graphite", "Starlight", "Titanium"];

export function attributesOf(p: Product): Attr[] {
  // Προϊόν της βάσης: τα χαρακτηριστικά του τύπου του, όπως τα ορίζει το ERP — όχι ό,τι τύχει να γράφει η περιγραφή
  if (p.attrs) return [...p.attrs, { key: "Μάρκα", value: p.brand, group: "Γενικά" }];
  const out = new Map<string, Attr>();
  const put = (key: string, value: string | null | undefined, group: string) => {
    if (!value || out.has(key)) return;
    out.set(key, { key, value: value.trim(), group });
  };
  if (p.energy) put("Ενεργειακή κλάση", p.energy.cls, "Απόδοση");
  for (const s of p.specs ?? []) {
    const r = RULES[s.key];
    if (r) put(r.canon, r.norm ? r.norm(s.value) : s.value, r.group);
    else put(s.key, s.value, s.group);
  }
  // Derived from the title where the ERP left a gap.
  const t = p.title;
  const inch = t.match(/(\d{2}(?:[.,]\d)?)\s?(?:"|″|''|inch|ίντσ)/i);
  if (inch && ["tileoraseis", "laptops", "monitors", "tablets"].includes(p.subcategory)) put("Διαγώνιος", `${inch[1].replace(".", ",")}"`, "Οθόνη");
  const kg = t.match(/(\d{1,2})\s?kg/i);
  if (kg) put("Χωρητικότητα", `${kg[1]} kg`, "Επιδόσεις");
  const gb = t.match(/(\d+)\s?GB(?!\/)/i);
  const ramStor = t.match(/(\d+)\s?GB\s?\/\s?(\d+)\s?(GB|TB)/i);
  if (ramStor) {
    put("Μνήμη RAM", `${ramStor[1]} GB`, "Επιδόσεις");
    put("Χωρητικότητα", `${ramStor[2]} ${ramStor[3].toUpperCase()}`, "Επιδόσεις");
  } else if (gb) put("Χωρητικότητα", `${gb[1]} GB`, "Επιδόσεις");
  const btuT = t.match(/(\d{1,2})[.,]?000\s?BTU/i) ?? t.match(/-?(09|12|18|24)(?:[A-Z]|WFI|000)/);
  if (btuT && p.subcategory === "air-condition") put("Απόδοση (BTU)", `${Number(btuT[1]) * 1000 >= 9000 ? (Number(btuT[1]) * 1000).toLocaleString("el-GR") : (Number(btuT[1]) * 1000).toLocaleString("el-GR")} BTU`, "Απόδοση");
  if (/inverter/i.test(t) && p.subcategory === "air-condition") put("Inverter", "Ναι", "Λειτουργίες");
  const colour = COLOURS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(t));
  if (colour) put("Χρώμα", colour, "Εμφάνιση");
  if (p.isRenew) put("Κατάσταση", "Renew · ανακατασκευασμένο", "Γενικά");
  put("Μάρκα", p.brand, "Γενικά");
  return [...out.values()];
}

/** Keys that never make a useful facet. */
const NO_FACET = new Set(["Μάρκα", "Διαστάσεις (Υ×Π×Β)", "Επεξεργαστής", "Εγγύηση", "Ψυκτική ισχύς", "Θερμική ισχύς", "SEER / SCOP", "Θόρυβος"]);

export interface AttrFacet {
  key: string;
  group: string;
  values: { value: string; count: number }[];
}

/** Characteristic facets for a product set: keys shared by ≥ 2 products with ≥ 2 distinct values, most-covered first. */
export function attributeFacets(list: Product[], max = 10): AttrFacet[] {
  const byKey = new Map<string, { group: string; values: Map<string, number>; products: number }>();
  for (const p of list) {
    for (const a of attributesOf(p)) {
      if (NO_FACET.has(a.key)) continue;
      const k = byKey.get(a.key) ?? { group: a.group, values: new Map(), products: 0 };
      k.values.set(a.value, (k.values.get(a.value) ?? 0) + 1);
      k.products++;
      byKey.set(a.key, k);
    }
  }
  return [...byKey.entries()]
    .filter(([, v]) => v.products >= 2 && v.values.size >= 2)
    .sort((a, b) => b[1].products - a[1].products)
    .slice(0, max)
    .map(([key, v]) => ({ key, group: v.group, values: [...v.values.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => smart(a.value, b.value)) }));
}

const smart = (a: string, b: string) => {
  const na = parseFloat(a.replace(/\./g, "").replace(",", "."));
  const nb = parseFloat(b.replace(/\./g, "").replace(",", "."));
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b, "el");
};

export function matchesAttrs(p: Product, attrs?: Record<string, string[]>) {
  if (!attrs) return true;
  const mine = attributesOf(p);
  for (const [key, wanted] of Object.entries(attrs)) {
    if (!wanted.length) continue;
    const v = mine.find((a) => a.key === key)?.value;
    if (!v || !wanted.includes(v)) return false;
  }
  return true;
}

/** Spec rows for a compare table: every canonical key seen in the set, grouped, in a stable order. */
export function compareRows(list: Product[]) {
  const order: string[] = [];
  const groups = new Map<string, string[]>();
  const all = new Map(list.map((p) => [p.id, attributesOf(p)]));
  // Γραμμή μόνο όταν έχει κάτι να συγκρίνει: τιμή σε τουλάχιστον δύο προϊόντα (ή στο μοναδικό). Όχι στήλες με «—».
  const need = list.length >= 2 ? 2 : 1;
  for (const p of list) {
    for (const a of all.get(p.id)!) {
      if (a.key === "Μάρκα" || order.includes(a.key)) continue;
      if (list.filter((x) => all.get(x.id)!.some((y) => y.key === a.key)).length < need) continue;
      order.push(a.key);
      groups.set(a.group, [...(groups.get(a.group) ?? []), a.key]);
    }
  }
  const val = (p: Product, k: string) => all.get(p.id)?.find((a) => a.key === k)?.value ?? "—";
  return { groups: [...groups.entries()], val };
}

export type { Spec };
