/**
 * Η αναλυτική περιγραφή του ERP (CCCWREMARKS) είναι ελεύθερο κείμενο, αλλά στο
 * 79 % των ειδών κρύβει δομή: γραμμές «ετικέτα : τιμή» (τεχνικά χαρακτηριστικά)
 * και γραμμές «τίτλος: πρόταση» (πλεονεκτήματα). Εδώ χωρίζονται — χωρίς να
 * χάνεται τίποτα: ό,τι δεν αναγνωριστεί μένει στο κείμενο.
 *
 * Καθαρή συνάρτηση, χωρίς βάση: τρέχει και σε tests / scripts.
 */
export interface ParsedSpec { key: string; value: string }
export interface ParsedDescription { text: string; specs: ParsedSpec[]; highlights: string[] }

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">", deg: "°", euro: "€", middot: "·", bull: "•", ndash: "–", mdash: "—", laquo: "«", raquo: "»" };

/** HTML → απλό κείμενο με παραγράφους. Τα script/style/iframe φεύγουν μαζί με το περιεχόμενό τους. */
export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/ul|\/ol)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (/^#\d+$/.test(e) ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/\r/g, "")
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LINE = /^(?:[•\-–*·]\s*)?([^:\n]{2,60}?)\s*:\s*(\S.*)$/;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const MAX_SPECS = 60, MAX_HIGHLIGHTS = 6;

export function parseDescription(raw: string | null | undefined): ParsedDescription {
  if (!raw?.trim()) return { text: "", specs: [], highlights: [] };
  const specs: ParsedSpec[] = [], highlights: string[] = [], kept: string[] = [];
  const seen = new Set<string>();
  for (const line of toPlainText(raw).split("\n")) {
    const m = LINE.exec(line);
    const label = m?.[1].trim() ?? "", value = m?.[2].trim() ?? "";
    // «https://…», «Σημείωση: …» με ολόκληρη παράγραφο, ώρες «10:30» δεν είναι χαρακτηριστικά
    const looksLikeLabel = !!m && words(label) <= 7 && !/https?$/i.test(label) && !/^\d+$/.test(label) && !value.startsWith("//") && !/[.!;]\s/.test(label);
    // «Iron Assist με ατμό: μειώνει το τσαλάκωμα…» είναι πλεονέκτημα, όχι χαρακτηριστικό: η τιμή είναι πρόταση που ξεκινά με πεζό
    const sentence = /^[a-zα-ωά-ώ]/.test(value) && words(value) >= 4;
    if (looksLikeLabel && !sentence && value.length <= 80 && words(value) <= 10) {
      const k = label.toLowerCase();
      if (!seen.has(k) && specs.length < MAX_SPECS) { seen.add(k); specs.push({ key: label, value: value.replace(/[.;]$/, "") }); continue; } // η γραμμή φεύγει από το κείμενο: θα φανεί στον πίνακα χαρακτηριστικών
    } else if (looksLikeLabel && value.length <= 220 && highlights.length < MAX_HIGHLIGHTS && label !== label.toLocaleUpperCase("el-GR") && (value.match(/,/g)?.length ?? 0) < 3) { // «ΠΡΟΓΡΑΜΜΑΤΑ: α, β, γ…» είναι λίστα, όχι λόγος
      highlights.push(`${label}: ${value}`); // μένει και στο κείμενο — είναι μέρος της αφήγησης
    }
    kept.push(line);
  }
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), specs, highlights };
}

const LATIN: Record<string, string> = { Α: "A", Β: "B", Ε: "E", α: "A", β: "B", ε: "E" };

/** Ενεργειακή κλάση από τα χαρακτηριστικά της περιγραφής: «A», «A+++», «Α++/A+» (ψύξη/θέρμανση → η πρώτη). */
export function energyFromSpecs(specs: ParsedSpec[]): { cls: string; scale: "A-G" | "A+++-D" } | null {
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Στο ERP γράφεται με δέκα τρόπους: «Ενεργειακή κλάση», «Κλάση ενεργειακής απόδοσης», «Κατηγορία…», «Τάξη…», «Σήμανση…», ακόμη και με λατινικό «K»
  for (const s of specs) {
    const k = plain(s.key).replace(/k/g, "κ");
    if (!/ενεργειακ/.test(k) || !/(κλαση|ταξη|κατηγορια|σημανση)/.test(k)) continue;
    const v = s.value.trim().replace(/^[ΑΒΕαβε]/, (c) => LATIN[c]).toUpperCase();
    const m = /^(A\+{1,3}|[A-G])(?![A-ZΑ-Ω0-9])/.exec(v);
    if (m) return { cls: m[1], scale: m[1].includes("+") ? "A+++-D" : "A-G" };
  }
  return null;
}
