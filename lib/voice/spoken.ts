/**
 * Written → spoken Greek. Latin-script terms (brands, model codes, RAM, SSD,
 * GB, Wi-Fi, OLED, 4K…) are left as they are: the TTS prompt asks for them
 * to be pronounced in English, the way a Greek salesperson says them. Abbreviations, units, symbols and thousand separators
 * are expanded before text-to-speech so «61 εκ.» is read «61 εκατοστά», «1.899 €»
 * «1899 ευρώ», «A+++» «Α τρία συν». Pure and idempotent: runs on the client
 * (before the sentence split) and on the server (cache key), same result.
 */
// JS `\b` is ASCII-only, so Greek abbreviations need explicit letter boundaries.
const w = (pattern: string, flags = "giu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}])`, flags);
const ABBR: [RegExp, string][] = [
  [w("εκ\\."), "εκατοστά"],
  [w("χιλ\\."), "χιλιοστά"],
  [w("τ\\.\\s?μ\\."), "τετραγωνικά μέτρα"],
  [w("κυβ\\.\\s?μ\\."), "κυβικά μέτρα"],
  [w("π\\.\\s?χ\\."), "για παράδειγμα"],
  [w("κ\\.\\s?λ\\.\\s?π\\.|κλπ\\.?"), "και λοιπά"],
  [w("κ\\.\\s?ά\\."), "και άλλα"],
  [w("δηλ\\."), "δηλαδή"],
  [w("βλ\\."), "βλέπε"],
  [w("δευτ\\."), "δευτερόλεπτα"],
  [w("λεπ\\."), "λεπτά"],
  [w("ώρ\\."), "ώρες"],
  [w("ημ\\."), "ημέρες"],
  [w("μην\\."), "μήνες"],
  [w("έτ\\."), "έτη"],
  [w("στρ\\.|rpm"), "στροφές"],
  [w("αρ\\.(?=\\s?\\d)"), "αριθμός"],
  [w("σελ\\."), "σελίδα"],
  [w("τηλ\\."), "τηλέφωνο"],
  [w("Τ\\.\\s?Κ\\.", "gu"), "ταχυδρομικός κώδικας"],
  [w("Α\\.?\\s?Φ\\.?\\s?Μ\\.?", "gu"), "Α Φ Μ"],
  [w("Δ\\.?\\s?Ο\\.?\\s?Υ\\.?", "gu"), "Δ Ο Υ"],
  [w("Α\\.Ε\\.?", "gu"), "Α Ε"],
  [w("Ο\\.Ε\\.?", "gu"), "Ο Ε"],
  [w("Ε\\.Π\\.Ε\\.?", "gu"), "Ε Π Ε"],
  [w("ΑΗΗΕ", "gu"), "ηλεκτρικές συσκευές προς ανακύκλωση"],
  [/\/έτος/gu, " τον χρόνο"],
  [/\/μήνα/gu, " τον μήνα"],
  [/\/ώρα/gu, " την ώρα"],
];

/** Units that follow a number. */
const UNITS: [RegExp, string][] = [
  [/(\d)\s?(″|”|"|'')(?=\s|$|[,.;)])/gu, "$1 ιντσών"],
  [/(\d)\s?ιντσ\.?(?=\s|$)/giu, "$1 ιντσών"],
  [/(\d)\s?kWh(?![\p{L}])/gu, "$1 κιλοβατώρες"],
  [/(\d)\s?Wh(?![\p{L}])/gu, "$1 βατώρες"],
  [/(\d)\s?mAh(?![\p{L}])/gu, "$1 μιλιαμπερώρες"],
  [/(\d)\s?kW(?![\p{L}])/gu, "$1 κιλοβάτ"],
  [/(\d)\s?W(?![\p{L}])/gu, "$1 βατ"],
  [/(\d)\s?kg(?![\p{L}])/giu, "$1 κιλά"],
  [/(\d)\s?g(?![\p{L}])/gu, "$1 γραμμάρια"],
  [/(\d)\s?lt(?![\p{L}])|(\d)\s?λίτρ\.(?=\s|$)/giu, "$1$2 λίτρα"],
  [/(\d)\s?ml(?![\p{L}])/gu, "$1 μιλιλίτρ"],
  [/(\d)\s?cm(?![\p{L}])/gu, "$1 εκατοστά"],
  [/(\d)\s?mm(?![\p{L}])/gu, "$1 χιλιοστά"],
  [/(\d)\s?m²|(\d)\s?τμ(?![\p{L}])/gu, "$1$2 τετραγωνικά μέτρα"],
  [/(\d)\s?m(?![\p{L}²])/gu, "$1 μέτρα"],
  [/(\d)\s?dB(?![\p{L}])/gu, "$1 ντεσιμπέλ"],
  [/(\d)\s?°\s?C(?![\p{L}])|(\d)\s?°/gu, "$1$2 βαθμούς"],
  [/(\d)\s?%/gu, "$1 τοις εκατό"],
  [/(\d)\s?€/gu, "$1 ευρώ"],
  [/€\s?(\d)/gu, "ευρώ $1"],
    [/(\d)\s?λ\.(?=\s|$)/gu, "$1 λεπτά"],
  [/(\d)\s?×\s?(\d)/gu, "$1 επί $2"],
  [/(\d)\s?x\s?(\d)/gu, "$1 επί $2"],
];

const SYMBOLS: [RegExp, string][] = [
  // Brand name: Greek phonetic spelling so the stress lands on «ρό» (Γιουρό-νικς), not the English «YU-ronics».
  [w("euronics\\.gr"), "Γιουρόνικς ντοτ τζι αρ"],
  [w("euronics"), "Γιουρόνικς"],
  [/(?<![\p{L}])[AΑ]\+\+\+/gu, "Α τρία συν"],
  [/(?<![\p{L}])[AΑ]\+\+/gu, "Α δύο συν"],
  [/(?<![\p{L}])[AΑ]\+(?!\+)/gu, "Α συν"],
  [/\s?−\s?(?=\d)/gu, " μείον "],
  [/(?<=\s)-(?=\d)/gu, "μείον "],
  [/\s?→\s?/gu, " προς "],
  [/≥/gu, "τουλάχιστον "],
  [/≤/gu, "έως "],
  [/(?<!\w)~(?=\s?\d)/gu, "περίπου "],
  [/\s&\s/gu, " και "],
  [/\s?·\s?/gu, ", "],
  [/[«»"“”]/gu, ""],
];

export function spokenForm(input: string): string {
  let t = input.replace(/\s+/g, " ").trim();
  // thousand separators: 1.899 → 1899 (but keep decimals like 29,08)
  t = t.replace(/(\d)\.(\d{3})(?=\D|$)/gu, "$1$2");
  // An abbreviation that closes a sentence («…61 εκ. Έλα…») keeps its full stop.
  for (const [re, to] of ABBR) t = t.replace(re, (m: string, ...rest: unknown[]) => { const offset = rest[rest.length - 2] as number; const str = rest[rest.length - 1] as string; return m.endsWith(".") && /^\s+\p{Lu}/u.test(str.slice(offset + m.length)) ? `${to}.` : to; });
  for (const [re, to] of UNITS) t = t.replace(re, to);
  for (const [re, to] of SYMBOLS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").replace(/\s([,.;!?])/g, "$1").trim();
}
