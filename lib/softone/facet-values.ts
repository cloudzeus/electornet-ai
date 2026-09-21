import { slugify } from "@/lib/slug";
import { extractDims } from "@/lib/catalog/dimensions";

/**
 * Από τι παίρνει τιμή ένα φίλτρο του SoftOne για ένα συγκεκριμένο προϊόν.
 *
 * Το ERP ορίζει ΠΟΙΑ φίλτρα έχει κάθε τύπος προϊόντος («Εύρος Οθόνης», «Χρώμα»,
 * «Ιονιστής»), αλλά όχι την τιμή κάθε είδους. Η τιμή λύνεται σε τρεις στρώσεις,
 * από τη βεβαιότερη προς την πιο αβέβαιη — και κάθε τιμή θυμάται από πού ήρθε:
 *   1. spec  — χαρακτηριστικό της περιγραφής με το ίδιο (ή συνώνυμο) όνομα
 *   2. title — από τον τίτλο: ίντσες, GB, kg, BTU, χρώμα, τεχνολογία panel…
 *   3. text  — φίλτρα «υπάρχει / δεν υπάρχει» (Aqua Sensor, Follow me): η φράση
 *              εμφανίζεται στο κείμενο του προϊόντος → «Ναι». Ποτέ «Όχι» από απουσία.
 *
 * Καθαρές συναρτήσεις, χωρίς βάση.
 */
export interface FacetDef { id: string; label: string }
export interface ProductInput { title: string; summary: string | null; description: string | null; specs: { key: string; value: string }[]; typeName: string }
export interface FacetValue { facetId: string; value: string; slug: string; num: number | null; source: "spec" | "title" | "text" }

export const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^a-z0-9α-ω+]+/g, " ").trim();
const base = (s: string) => plain(s.replace(/\([^)]*\)/g, " "));
const numOf = (v: string) => { const m = /(\d+(?:[.,]\d+)?)/.exec(v.replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2")); return m ? parseFloat(m[1].replace(",", ".")) : null; };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

interface Val { value: string; num?: number | null; src?: "spec" }
type Norm = (v: string, p: ProductInput) => Val | Val[] | null;

// ---------- Κανονικοποιητές ----------

// Προσοχή: το \b της JavaScript ξέρει μόνο λατινικά — δίπλα σε ελληνικά γράμματα δεν «βλέπει» όριο λέξης. Παντού εδώ: E = «δεν ακολουθεί γράμμα/ψηφίο».
const E = "(?![a-zα-ω0-9])", S = "(?<![a-zα-ω0-9])";
const YES = new RegExp(`^(ναι|yes|υπαρχει|διαθετει|περιλαμβανεται|true)${E}`), NO = new RegExp(`^(οχι|no|δεν|χωρισ|false|δ/υ)${E}`);
const yesNo: Norm = (v) => { const t = plain(v); return YES.test(t) || /^[✓✔]/.test(v.trim()) ? { value: "Ναι" } : NO.test(t) || /^[-–✗✘x]$/i.test(v.trim()) ? { value: "Όχι" } : null; };
/** Φίλτρα-δυνατότητες (WiFi, Bluetooth): «Όχι» μόνο αν το λέει ρητά· οποιαδήποτε άλλη περιγραφή («BT 5.4», «WiFi 5») σημαίνει ότι υπάρχει. */
const presence: Norm = (v, p) => yesNo(v, p) ?? (/[a-zα-ω0-9]/i.test(v) ? { value: "Ναι" } : null);
const unit = (u: string, min = 0, max = Infinity): Norm => (v) => { const n = numOf(v); return n != null && n >= min && n <= max ? { value: `${fmt(n)} ${u}`, num: n } : null; };
const inchRange = (p: ProductInput): [number, number] => { const t = plain(p.typeName); return /κινητ|smartphone/.test(t) ? [1.5, 8.5] : /watch|tracker|ρολο/.test(t) ? [0.5, 3] : /tablet|ipad/.test(t) ? [6, 15] : /laptop|macbook/.test(t) ? [10, 19] : /τηλεορασ/.test(t) ? [19, 116] : [1, 120]; };
/** Πρώτα ο αριθμός που έχει δίπλα του σύμβολο ίντσας· αλλιώς ο πρώτος αριθμός που είναι λογικός για τον τύπο («120Hz 6,7″» σε κινητό → 6,7). */
const inches: Norm = (v, p) => {
  const [lo, hi] = inchRange(p), ok = (n: number) => n >= lo && n <= hi;
  const marked = [...v.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:"|″|''|”|´´|ιντσ|ίντσ|inch|in\b)/gi)].map((m) => parseFloat(m[1].replace(",", "."))).find(ok);
  const n = marked ?? [...v.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)(?!\s?(?:hz|nits|ppi|mp|gb|mah|x|×|\d))/gi)].map((m) => parseFloat(m[1].replace(",", "."))).find(ok);
  return n != null ? { value: `${fmt(n)}"`, num: n } : null;
};
const resolution: Norm = (v) => (/8k|7680/i.test(v) ? { value: "8K", num: 4320 } : /4k|uhd|3840|2160/i.test(v) ? { value: "4K UHD", num: 2160 } : /qhd|2560|1440/i.test(v) ? { value: "QHD", num: 1440 } : /full\s?hd|fhd|1920|1080/i.test(v) ? { value: "Full HD", num: 1080 } : /hd\s?ready|\bhd\b|1366|1280|720/i.test(v) ? { value: "HD", num: 720 } : null);
const btu: Norm = (v) => { const m = /(\d{1,2})[.,]?(\d{3})/.exec(v); const n = m ? Number(m[1] + m[2]) : null; return n && n >= 5000 && n <= 80000 ? { value: `${n.toLocaleString("el-GR")} BTU`, num: n } : null; };
const bytes: Norm = (v) => { const m = /(\d+(?:[.,]\d+)?)\s?(tb|gb|mb)/i.exec(v); if (!m) return null; const n = parseFloat(m[1].replace(",", ".")), u = m[2].toUpperCase(); return { value: `${fmt(n)} ${u}`, num: u === "TB" ? n * 1024 : u === "MB" ? n / 1024 : n }; };
const watts: Norm = (v) => { const m = /(\d+(?:[.,]\d+)?)\s?(kw|w)\b/i.exec(v.replace(/(\d)\.(\d{3})/g, "$1$2")); if (!m) return null; const n = parseFloat(m[1].replace(",", ".")) * (/kw/i.test(m[2]) ? 1000 : 1); return { value: `${fmt(n)} W`, num: n }; };
const energyClass: Norm = (v) => { const m = /^\s*([AΑ]\+{1,3}|[A-GΑΒΕ])(?![A-Za-zΑ-Ωα-ω0-9])/.exec(v.trim()); if (!m) return null; const c = m[1].replace("Α", "A").replace("Β", "B").replace("Ε", "E"); return { value: c, num: "ABCDEFG".indexOf(c[0]) - (c.length - 1) * 0.1 }; };
const os: Norm = (v) => { const m = /(android|ipados|ios|windows|macos|chrome\s?os|harmonyos|wear\s?os|watchos|tizen|webos|google tv|linux|freedos|dos)\s*(\d{1,2})?/i.exec(v); if (!m) return null; const names: Record<string, string> = { android: "Android", ipados: "iPadOS", ios: "iOS", windows: "Windows", macos: "macOS", chromeos: "ChromeOS", harmonyos: "HarmonyOS", wearos: "Wear OS", watchos: "watchOS", tizen: "Tizen", webos: "webOS", "googletv": "Google TV", linux: "Linux", freedos: "FreeDOS", dos: "FreeDOS" }; const k = m[1].toLowerCase().replace(/\s/g, ""); return { value: `${names[k] ?? m[1]}${m[2] ? ` ${m[2]}` : ""}` }; };
const cores: Norm = (v) => { const w: Record<string, number> = { single: 1, dual: 2, quad: 4, hexa: 6, octa: 8, deca: 10 }; const m = /(single|dual|quad|hexa|octa|deca)/i.exec(v); const n = m ? w[m[1].toLowerCase()] : numOf(v); return n && n >= 1 && n <= 64 ? { value: `${n} πυρήνες`, num: n } : null; };
const generation: Norm = (v) => (/5g/i.test(v) ? { value: "5G", num: 5 } : /4g|lte/i.test(v) ? { value: "4G", num: 4 } : null);

const COLOURS: [string, string][] = [
  ["μαυρ[α-ω]*|black|midnight|graphite|onyx|anthracite|ανθρακ[α-ω]*|obsidian|phantom black", "Μαύρο"], ["λευκ[α-ω]*|white|starlight|ασπρ[α-ω]*|cream|ivory", "Λευκό"],
  ["inox|ινοξ|stainless|ανοξειδωτ[α-ω]*", "Inox"], ["ασημ[α-ω]*|silver|titanium|τιτανιο", "Ασημί"], ["γκρι[α-ω]*|gr[ae]y", "Γκρι"],
  ["μπλε|blue|navy|glacier|ultramarine|γαλαζ[α-ω]*", "Μπλε"], ["κοκκιν[α-ω]*|red|burgundy|μπορντο", "Κόκκινο"], ["πρασιν[α-ω]*|green|mint|sage|teal", "Πράσινο"],
  ["ροζ|pink|rose", "Ροζ"], ["μωβ|purple|violet|lavender|lilac", "Μωβ"], ["χρυσ[α-ω]*|gold|champagne", "Χρυσό"], ["κιτριν[α-ω]*|yellow", "Κίτρινο"],
  ["πορτοκαλ[α-ω]*|orange|coral", "Πορτοκαλί"], ["μπεζ|beige|sand|desert", "Μπεζ"], ["καφε|brown|bronze|μπρονζ[α-ω]*", "Καφέ"],
];
const COLOUR_RE = COLOURS.map(([re, name]) => [new RegExp(`${S}(${re})${E}`), name] as const);
/** Το χρώμα που εμφανίζεται ΠΡΩΤΟ στο κείμενο («Black Titanium» → Μαύρο). */
const colour: Norm = (v) => { const t = plain(v); let best: { i: number; name: string } | null = null; for (const [re, name] of COLOUR_RE) { const m = re.exec(t); if (m && (!best || m.index < best.i)) best = { i: m.index, name }; } return best ? { value: best.name } : null; };

const CONNECT: [RegExp, string][] = [[/wi-?fi|wlan/i, "Wi-Fi"], [/bluetooth|\bbt\b/i, "Bluetooth"], [/\bnfc\b/i, "NFC"], [/\b5g\b/i, "5G"], [/ethernet|\blan\b|rj-?45/i, "Ethernet"], [/hdmi/i, "HDMI"], [/usb[- ]?c|type[- ]?c/i, "USB-C"], [/airplay/i, "AirPlay"], [/chromecast/i, "Chromecast"]];
const connectivity: Norm = (v) => { const out = CONNECT.filter(([re]) => re.test(v)).map(([, value]) => ({ value })); return out.length ? out : null; };

const PANEL: [RegExp, string][] = [[/qd[- ]?oled/i, "QD-OLED"], [/\boled\b/i, "OLED"], [/neo\s?qled/i, "Neo QLED"], [/\bqned\b/i, "QNED"], [/\bqled\b/i, "QLED"], [/mini[- ]?led/i, "Mini LED"], [/nano\s?cell/i, "NanoCell"], [/\b(d?led)\b/i, "LED"], [/\blcd\b/i, "LCD"]];
const panel: Norm = (v) => { const c = PANEL.find(([re]) => re.test(v)); return c ? { value: c[1] } : null; };

// Οι διαστάσεις διαβάζονται από έναν και μόνο εξαγωγέα (lib/catalog/dimensions.ts) — ίδιος για τα φίλτρα, το AR και τη σύγκριση με το EPREL.
const dimsOf = (p: ProductInput) => extractDims(p.specs, p.typeName);
const cm = (n: number, src?: "spec"): Val => ({ value: `${fmt(n)} εκ.`, num: n, src });

const RAM_SIZES = new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

// ---------- Έννοιες: ποιο φίλτρο διαβάζει ποια χαρακτηριστικά και τι μπορεί να βγει από τον τίτλο ----------

interface Concept { facet: RegExp; spec?: RegExp; norm: Norm; title?: (p: ProductInput) => Val | Val[] | null; multi?: boolean }
const fromTitle = (re: RegExp, norm: Norm) => (p: ProductInput) => { const m = re.exec(p.title); return m ? norm(m[0], p) : null; };
const isScreenType = (p: ProductInput) => /τηλεορασ|οθον|monitor|laptop|tablet|κινητ|smartphone|smartwatch|projector/.test(plain(p.typeName));

const CONCEPTS: Concept[] = [
  { facet: /^(ευροσ|μεγεθοσ|διαγωνιοσ) οθονησ|^διαγωνιοσ/, spec: /^(διαγωνιοσ( οθονησ)?|μεγεθοσ οθονησ|οθονη)$/, norm: inches, title: (p) => { if (!isScreenType(p)) return null; const m = /(\d{1,3}(?:[.,]\d)?)\s?(?:"|″|''|”|ιντσ|inch|in\b)/i.exec(p.title) ?? (/τηλεορασ/.test(plain(p.typeName)) ? /(?:^|[^0-9])(2[2-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-8])(?=[A-Z]{1,4}[0-9])/.exec(p.title) : null); return m ? inches(m[1], p) : null; } },
  { facet: /^τεχνολογια (panel|οθονησ)|^τυποσ οθονησ/, spec: /^(τεχνολογια( panel| οθονησ)?|τυποσ οθονησ|τυποσ panel)$/, norm: panel, title: (p) => panel(p.title, p) },
  { facet: /^αναλυση/, spec: /^αναλυση( οθονησ)?$/, norm: resolution, title: (p) => resolution(p.title, p) },
  { facet: /^ρυθμοσ ανανεωσησ/, spec: /^ρυθμοσ ανανεωσησ/, norm: unit("Hz", 24, 600), title: fromTitle(/\d{2,3}\s?hz/i, unit("Hz", 24, 600)) },
  { facet: /^smart( tv)?$/, spec: /^smart( tv)?$/, norm: (v, p) => yesNo(v, p) ?? (plain(v).length > 1 ? { value: "Ναι" } : null), title: (p) => (/smart|google tv|android tv|web\s?os|tizen|vidaa|fire tv|roku/i.test(p.title) ? { value: "Ναι" } : null) },
  { facet: /^χρωμα/, spec: /^χρωμα/, norm: colour, title: (p) => colour(p.title, p) },
  { facet: /^(μνημη ram|μεγεθοσ μνημησ( ram)?|ram)$/, spec: /^((μνημη )?ram|μνημη)\b/, norm: (v, p) => { const r = bytes(v, p) as Val | null; return r && RAM_SIZES.has(r.num ?? 0) ? r : null; }, title: (p) => { const m = /(?:^|[^0-9])(\d{1,3})\s?(?:GB)?\s?\/\s?(\d{2,4})\s?(?:GB|TB)/i.exec(p.title) ?? /(?:^|[^0-9])(\d{1,3})\s?GB\s?RAM/i.exec(p.title); return m && RAM_SIZES.has(Number(m[1])) ? bytes(`${m[1]} GB`, p) : null; } },
  { facet: /σερβιτσι/, spec: /σερβιτσι|χωρητικοτητα/, norm: unit("σερβίτσια", 4, 20) },
  { facet: /^(προγραμματα|αριθμοσ προγραμματων)/, spec: /^(προγραμματα|αριθμοσ προγραμματων)/, norm: (v) => { const n = numOf(v); return n && n >= 1 && n <= 40 ? { value: String(Math.round(n)), num: Math.round(n) } : null; } },
  { facet: /^(wi ?fi|bluetooth|nfc|airplay|chromecast)/, spec: /^(wi ?fi|bluetooth|nfc|airplay|chromecast|ασυρματη)/, norm: presence, title: (p) => { const t = plain(`${p.title} ${p.summary ?? ""}`); return /wi ?fi|wlan/.test(t) && /wi ?fi/.test(plain(p.typeName + " ")) ? { value: "Ναι" } : null; } },
  { facet: /^(χωρητικοτητα(?! σε σερβ)|αποθηκευτικοσ χωροσ|μνημη αποθηκευσησ)(?!.* 2ου)/, spec: /^(χωρητικοτητα|αποθηκευτικοσ χωροσ|σκληροσ δισκοσ|μνημη rom|συνολικη χωρητικοτητα|χωρητικοτητα πλυσησ|χωρητικοτητα καδου)/, norm: (v, p) => { const t = plain(p.typeName); return /πλυντηρ|στεγνωτηρ/.test(t) ? unit("kg", 1, 25)(v, p) : /ψυγει|καταψυκτ|φουρν|μικροκυμ|θερμοσιφ|βραστηρ|φριτεζ|αφυγραντ/.test(t) ? unit("lt", 0.2, 1500)(v, p) : bytes(v, p); }, title: (p) => { const t = plain(p.typeName); if (/πλυντηρ|στεγνωτηρ/.test(t)) { const m = /(\d{1,2}(?:[.,]\d)?)\s?(?:kg|κιλ)/i.exec(p.title); return m ? unit("kg", 1, 25)(m[1], p) : null; } if (/ψυγει|καταψυκτ|φουρν|μικροκυμ|θερμοσιφ/.test(t)) { const m = /(\d{2,4})\s?(?:lt|ltr|λιτρ|l\b)/i.exec(p.title); return m ? unit("lt", 1, 1500)(m[1], p) : null; } const two = /\d{1,3}\s?(?:GB)?\s?\/\s?(\d{2,4}\s?(?:GB|TB))/i.exec(p.title); const one = /(\d{2,4}\s?(?:GB|TB))/i.exec(p.title); return two ? bytes(two[1], p) : one ? bytes(one[1], p) : null; } },
  { facet: /btu|^ονομαστικη αποδοση/, spec: /ονομαστικη αποδοση|αποδοση.*btu|^btu|ψυκτικη ικανοτητα.*btu/, norm: btu, title: (p) => { const m = /(\d{1,2})[.,]?000\s?BTU/i.exec(p.title) ?? /(?:^|[-\s])(?:[A-Z]{2,6}[- ]?)?(07|09|12|16|18|22|24)(?=[A-Z]|$|[-\s])/.exec(/κλιματιστ/.test(plain(p.typeName)) ? p.title : ""); return m ? btu(`${Number(m[1])}000`, p) : null; } },
  { facet: /^λειτουργικο/, spec: /^λειτουργικο/, norm: os, title: (p) => (/iphone/i.test(p.title) ? { value: "iOS" } : /ipad/i.test(p.title) ? { value: "iPadOS" } : /macbook|imac|mac mini/i.test(p.title) ? { value: "macOS" } : os(p.title, p)) },
  { facet: /^dual sim/, spec: /^dual sim/, norm: (v, p) => yesNo(v, p) ?? (/dual|nano|esim/i.test(v) ? { value: "Ναι" } : /single/i.test(v) ? { value: "Όχι" } : null), title: (p) => (/dual\s?sim|\bDS\b/i.test(p.title) ? { value: "Ναι" } : null) },
  { facet: /^4g 5g|^5g$|^δικτυο/, spec: /^(δικτυο|δικτυα|συνδεσιμοτητα|4g 5g|5g)/, norm: generation, title: (p) => generation(p.title, p) },
  { facet: /^ενεργειακη κλαση ψυξησ/, spec: /ενεργειακ.*(ψυξησ)|σημανση ψυξησ/, norm: energyClass },
  { facet: /^ενεργειακη κλαση θερμανσησ/, spec: /ενεργειακ.*θερμανσησ/, norm: (v, p) => energyClass(v.includes("/") ? v.split("/")[1] : v, p) },
  { facet: /στροφ/, spec: /στροφ|ταχυτητα περιστροφησ|ταχυτητα στυψιματοσ/, norm: unit("σ.α.λ.", 300, 2000), title: fromTitle(/\d{3,4}\s?(?:rpm|στροφ|σ\.?α\.?λ)/i, unit("σ.α.λ.", 300, 2000)) },
  { facet: /θορυβ|^ηχητικη ισχυσ/, spec: /θορυβ|ηχητικη ισχυσ|ηχητικη πιεση/, norm: unit("dB", 10, 120) },
  { facet: /^ισχυσ/, spec: /^(ισχυσ|μεγιστη ισχυσ|ονομαστικη ισχυσ)\b/, norm: watts, title: fromTitle(/\d{2,4}\s?w\b/i, watts) },
  { facet: /^(βασικη|κυρια|πισω) καμερα/, spec: /^(πισω|βασικη|κυρια) καμερα/, norm: unit("MP", 0.3, 300) },
  { facet: /^(πληθοσ|αριθμοσ) πυρηνων/, spec: /πυρην|^επεξεργαστησ$/, norm: cores },
  { facet: /^πλατοσ/, spec: /^πλατοσ/, norm: (v) => { const n = numOf(v); return n ? cm(/mm|χιλ/i.test(v) || n > 400 ? n / 10 : n) : null; }, title: (p) => { const d = dimsOf(p); return d ? cm(d.w, "spec") : null; } },
  { facet: /^υψοσ/, spec: /^υψοσ/, norm: (v) => { const n = numOf(v); return n ? cm(/mm|χιλ/i.test(v) || n > 400 ? n / 10 : n < 3 ? n * 100 : n) : null; }, title: (p) => { const d = dimsOf(p); return d ? cm(d.h, "spec") : null; } },
  { facet: /^(ευροσ )?βαθο[συ]σ?/, spec: /^βαθοσ/, norm: (v) => { const n = numOf(v); return n ? cm(/mm|χιλ/i.test(v) || n > 400 ? n / 10 : n) : null; }, title: (p) => { const d = dimsOf(p); return d ? cm(d.d, "spec") : null; } },
  { facet: /^(συνδεσιμοτητα|συνδεση|συνδεσεισ)$/, spec: /^(συνδεσιμοτητα|συνδεση|συνδεσεισ|ασυρματη συνδεση|δικτυωση)/, norm: connectivity, multi: true, title: (p) => connectivity(`${p.title} ${p.summary ?? ""}`, p) },
];

// ---------- Γενικός κανόνας ----------

/** Ετικέτες που ζητούν τιμή, όχι ναι/όχι — δεν συμπληρώνονται ποτέ από το κείμενο. */
const NOT_BOOLEAN = /^(τυποσ|ευροσ|μεγεθοσ|αριθμοσ|πληθοσ|χωρητικοτητα|σειρα|κατασκευαστησ|χρωμα|ισχυσ|μοντελο|υλικο|διαστασ|βαροσ|ταχυτητ|θεσεισ|προγραμματα|επιπεδα|καταλληλ|ενδεικνυται|συνισταται|ηλικια|σχεδιασμοσ|τεχνολογια|ταση|κατηγορια|φυλο|ειδοσ|μορφη|σχημα|χρηση|τοποθετηση|εγκατασταση|συμβατ|διαμετροσ|μηκοσ|ογκοσ|αποδοση|καταναλωση|κλαση|εταιρ|τροποι|συλλογη|εκπομπη|απορροφηση|λειτουργιεσ|εξαρτηματα|αξεσουαρ|φιλτρ)/;
/** Μονολεκτικά φίλτρα είναι σχεδόν πάντα «τι είδους;» («Μοτέρ», «Διακόπτες», «Σωλήνας») — από το κείμενο συμπληρώνονται μόνο όσα είναι καθαρά δυνατότητες. */
const ONE_WORD_FEATURE = /^(ιονιστησ|πυρολυση|παγομηχανη|αντιβακτηριδιακο|χρονοδιακοπτησ|θερμοστατησ|αυτοκαθαρισμοσ|υγραντηρασ|inverter|nofrost|wifi|bluetooth|nfc)$/;
const NOT_BOOLEAN_ANY = /ισχυσ|χωρητικοτητ|αποδοσ|διαστασ|θερμοκρασι|καταναλωσ|διαρκεια|αυτονομια|εμβελεια|πιεση|παροχη|\bm2\b|τετραγων/;
const clip = (v: string): Val | null => { let t = v.replace(/\s+/g, " ").replace(/\s*\|.*$/, "").replace(/[.;,]+$/, "").trim(); if (/^\d+[.,]0$/.test(t)) t = t.replace(/[.,]0$/, ""); return /[a-zα-ωά-ώ0-9]/i.test(t) && t.length <= 40 ? { value: t, num: /^\d/.test(t) ? numOf(t) : null } : null; };
const generic: Norm = (v, p) => yesNo(v, p) ?? clip(v);

const stem = (w: string) => (w.length >= 8 ? w.slice(0, -3) : w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);

/** Όλες οι ρίζες εμφανίζονται ως αρχή λέξης, μέσα σε παράθυρο 60 χαρακτήρων — «Πρόγραμμα Ατμού» ναι, «πρόγραμμα … (300 χαρακτήρες) … ατμός» όχι. */
function near(text: string, stems: string[]) {
  const first = ` ${stems[0]}`;
  for (let i = text.indexOf(first); i !== -1; i = text.indexOf(first, i + 1)) {
    const win = text.slice(Math.max(0, i - 60), i + 60 + first.length);
    if (stems.every((st) => win.includes(` ${st}`))) return true;
  }
  return false;
}

/** Όλες οι τιμές ενός προϊόντος για τα φίλτρα του τύπου του. */
export function resolveFacets(facets: FacetDef[], p: ProductInput): FacetValue[] {
  const specs = p.specs.map((s) => ({ ...s, k: base(s.key) }));
  let text: string | null = null; // υπολογίζεται μόνο αν χρειαστεί
  const out: FacetValue[] = [];
  for (const f of facets) {
    const label = base(f.label);
    if (!label) continue;
    const concept = CONCEPTS.find((c) => c.facet.test(label));
    let vals: Val[] = [], source: FacetValue["source"] = "spec";
    const take = (r: Val | Val[] | null) => { if (r) vals = Array.isArray(r) ? r : [r]; return vals.length > 0; };

    // 1. Χαρακτηριστικό: ίδιο όνομα → συνώνυμο της έννοιας → όνομα που αρχίζει/τελειώνει με την ετικέτα
    const norm = concept?.norm ?? generic;
    const matches = [...specs.filter((s) => s.k === label), ...(concept?.spec ? specs.filter((s) => s.k !== label && concept.spec!.test(s.k)) : []), ...specs.filter((s) => s.k !== label && (s.k.startsWith(`${label} `) || label.startsWith(`${s.k} `)) && s.k.length >= 4)];
    for (const s of matches) if (take(norm(s.value, p))) break;

    // 2. Τίτλος
    if (!vals.length && concept?.title && take(concept.title(p))) source = vals[0].src ?? "title"; // οι διαστάσεις έρχονται από το χαρακτηριστικό «Διαστάσεις…», όχι από τον τίτλο

    // 3. Κείμενο: μόνο για φίλτρα «υπάρχει / δεν υπάρχει», μόνο «Ναι»
    if (!vals.length && !concept && !NOT_BOOLEAN.test(label) && !NOT_BOOLEAN_ANY.test(label)) {
      const words = label.split(" ").filter((w) => w.length >= 3);
      if (words.length <= 4 && label.length >= 4 && (words.length >= 2 || ONE_WORD_FEATURE.test(label))) {
        text ??= ` ${plain(`${p.title} ${p.summary ?? ""} ${p.description ?? ""} ${p.specs.map((s) => `${s.key} ${s.value}`).join(" ")}`)} `;
        const hit = near(text, words.map(stem));
        if (hit) { vals = [{ value: "Ναι" }]; source = "text"; }
      }
    }

    const seen = new Set<string>();
    for (const v of concept?.multi ? vals : vals.slice(0, 1)) {
      const slug = slugify(v.value) || slugify(v.value.replace(/\+/g, " plus ")) || "x";
      const key = v.value.includes("+") ? `${slug}-${v.value.split("+").length - 1}plus` : slug; // A+ / A++ / A+++ δεν πρέπει να πέφτουν στο ίδιο slug
      if (seen.has(key)) continue; seen.add(key);
      out.push({ facetId: f.id, value: v.value, slug: key, num: v.num ?? null, source });
    }
  }
  return out;
}
