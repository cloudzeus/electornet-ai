/**
 * Βιβλιοθήκη vector σχημάτων για stickers («artwork»). Κάθε σχήμα είναι SVG με θέσεις χρώματος — `{F}` κύριο γέμισμα (ή η
 * διαβάθμιση), `{F2}` δεύτερο χρώμα, `{A}` έμφαση / περίγραμμα, `{W}` ανοιχτό — ώστε τα χρώματα του σχεδιαστή να
 * εφαρμόζονται σε όλα. Το κείμενο του sticker μπαίνει στην περιοχή `text` (μονάδες του viewBox). Χωρίς κείμενο μέσα στο
 * σχήμα: το ίδιο σχήμα γίνεται «−20%», «Νέο», «Δώρο»… Καθαρό δεδομένο, χωρίς εξαρτήσεις — τρέχει σε server και browser.
 */
export interface StickerArt { id: string; name: string; w: number; h: number; body: string; text: { x: number; y: number; w: number; h: number }; recolor: boolean }
export interface ArtPreset { art: StickerArt; palette: { fill: string; fill2: string | null; accent: string; color: string }; lines: [string, string?]; tags: string[] }

const f = (n: number) => n.toFixed(1);
const ring = (cx: number, cy: number, r1: number, r2: number, n: number, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? r2 : r1, a = (Math.PI * i) / n + rot; return `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`; }).join(" ");
const scallop = (cx: number, cy: number, r: number, n: number) => {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n, rr = (Math.PI * r) / n;
    if (!i) d += `M${f(cx + r * Math.cos(a0))},${f(cy + r * Math.sin(a0))}`;
    d += ` A${f(rr)},${f(rr)} 0 0 1 ${f(cx + r * Math.cos(a1))},${f(cy + r * Math.sin(a1))}`;
  }
  return d + " Z";
};
const rays = (cx: number, cy: number, r: number, n: number, width = 0.09) =>
  Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return `<polygon points="${f(cx)},${f(cy)} ${f(cx + r * Math.cos(a - width))},${f(cy + r * Math.sin(a - width))} ${f(cx + r * Math.cos(a + width))},${f(cy + r * Math.sin(a + width))}"/>`; }).join("");
const poly = (cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n + rot; return `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`; }).join(" ");

const A = (id: string, name: string, w: number, h: number, text: StickerArt["text"], body: string): StickerArt => ({ id, name, w, h, text, body, recolor: true });

export const ART: StickerArt[] = [
  A("burst-double", "Διπλή έκρηξη", 200, 200, { x: 50, y: 50, w: 100, h: 100 },
    `<polygon points="${ring(100, 100, 98, 82, 22)}" fill="{F2}"/><polygon points="${ring(100, 100, 86, 72, 22, -Math.PI / 2 + Math.PI / 22)}" fill="{F}"/><circle cx="100" cy="100" r="62" fill="none" stroke="{A}" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>`),
  A("rosette", "Ροζέτα με κορδέλες", 200, 240, { x: 50, y: 46, w: 100, h: 92 },
    `<path d="M62 150 L40 236 L72 218 L92 238 L104 160 Z" fill="{F2}"/><path d="M138 150 L160 236 L128 218 L108 238 L96 160 Z" fill="{F2}"/><path d="${scallop(100, 92, 84, 18)}" fill="{F}"/><circle cx="100" cy="92" r="64" fill="none" stroke="{A}" stroke-width="4"/>`),
  A("speech", "Συννεφάκι ομιλίας", 220, 170, { x: 22, y: 18, w: 176, h: 96 },
    `<path d="M24 8 H196 a20 20 0 0 1 20 20 V112 a20 20 0 0 1 -20 20 H92 L52 164 L58 132 H24 a20 20 0 0 1 -20 -20 V28 a20 20 0 0 1 20 -20 Z" fill="{F}"/><path d="M24 8 H196 a20 20 0 0 1 20 20 V40 H4 V28 a20 20 0 0 1 20 -20 Z" fill="{W}" fill-opacity="0.14"/>`),
  A("shield", "Ασπίδα", 200, 226, { x: 40, y: 50, w: 120, h: 110 },
    `<path d="M100 4 L190 34 V104 C190 162 150 204 100 222 C50 204 10 162 10 104 V34 Z" fill="{F}"/><path d="M100 22 L174 46 V104 C174 152 142 186 100 202 C58 186 26 152 26 104 V46 Z" fill="none" stroke="{A}" stroke-width="4"/>`),
  A("hang-tag", "Ετικέτα κρεμαστή", 150, 230, { x: 20, y: 70, w: 110, h: 140 },
    `<path d="M40 6 H110 L144 46 V214 a12 12 0 0 1 -12 12 H18 a12 12 0 0 1 -12 -12 V46 Z" fill="{F}"/><circle cx="75" cy="40" r="11" fill="{W}"/><circle cx="75" cy="40" r="11" fill="none" stroke="{A}" stroke-width="3"/><path d="M75 29 C75 10 95 0 118 2" fill="none" stroke="{A}" stroke-width="3" stroke-linecap="round"/>`),
  A("ticket", "Κουπόνι", 240, 120, { x: 30, y: 14, w: 180, h: 92 },
    `<path d="M14 6 H226 a8 8 0 0 1 8 8 V44 a16 16 0 0 0 0 32 V106 a8 8 0 0 1 -8 8 H14 a8 8 0 0 1 -8 -8 V76 a16 16 0 0 0 0 -32 V14 a8 8 0 0 1 8 -8 Z" fill="{F}"/><path d="M22 18 H218 V102 H22 Z" fill="none" stroke="{A}" stroke-width="3" stroke-dasharray="8 6"/>`),
  A("banner-fold", "Πανό με διπλώσεις", 260, 104, { x: 42, y: 10, w: 176, h: 68 },
    `<path d="M4 30 H46 V96 H4 L20 63 Z" fill="{F2}"/><path d="M256 30 H214 V96 H256 L240 63 Z" fill="{F2}"/><path d="M34 82 L46 96 V82 Z" fill="{A}"/><path d="M226 82 L214 96 V82 Z" fill="{A}"/><rect x="34" y="6" width="192" height="76" rx="6" fill="{F}"/>`),
  A("arrow", "Βέλος", 240, 100, { x: 18, y: 10, w: 168, h: 80 },
    `<path d="M10 8 H188 L232 50 L188 92 H10 a6 6 0 0 1 -6 -6 V14 a6 6 0 0 1 6 -6 Z" fill="{F}"/><path d="M196 24 L222 50 L196 76" fill="none" stroke="{A}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  A("stamp", "Σφραγίδα μελανιού", 200, 200, { x: 46, y: 50, w: 108, h: 100 },
    `<circle cx="100" cy="100" r="94" fill="{F}"/><circle cx="100" cy="100" r="84" fill="none" stroke="{W}" stroke-width="3"/><circle cx="100" cy="100" r="74" fill="none" stroke="{W}" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/><polygon points="${ring(100, 22, 7, 3, 5)}" fill="{W}"/><polygon points="${ring(100, 178, 7, 3, 5)}" fill="{W}"/>`),
  A("heart", "Καρδιά", 200, 184, { x: 40, y: 34, w: 120, h: 92 },
    `<path d="M100 180 C42 140 4 104 4 60 C4 26 30 4 60 4 C80 4 94 14 100 28 C106 14 120 4 140 4 C170 4 196 26 196 60 C196 104 158 140 100 180 Z" fill="{F}"/><path d="M38 42 C44 28 58 22 70 24" fill="none" stroke="{W}" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>`),
  A("stripes", "Ριγέ πλακίδιο", 200, 200, { x: 30, y: 58, w: 140, h: 84 },
    `<defs><clipPath id="stc"><rect x="6" y="6" width="188" height="188" rx="30"/></clipPath></defs><rect x="6" y="6" width="188" height="188" rx="30" fill="{F}"/><g clip-path="url(#stc)" fill="{F2}">${Array.from({ length: 12 }, (_, i) => `<polygon points="${-200 + i * 36},200 ${-182 + i * 36},200 ${18 + i * 36},0 ${i * 36},0"/>`).join("")}</g><rect x="22" y="50" width="156" height="100" rx="14" fill="{W}"/><rect x="22" y="50" width="156" height="100" rx="14" fill="none" stroke="{A}" stroke-width="3"/>`),
  A("blob", "Οργανικό σχήμα", 210, 190, { x: 40, y: 40, w: 130, h: 110 },
    `<path d="M104 6 C150 2 196 30 204 78 C212 128 178 176 120 184 C62 192 14 166 6 116 C-2 66 40 10 104 6 Z" fill="{F}"/><path d="M160 30 C178 40 190 56 194 72" fill="none" stroke="{W}" stroke-opacity="0.5" stroke-width="6" stroke-linecap="round"/>`),
  A("octagon", "Οκτάγωνο", 200, 200, { x: 40, y: 46, w: 120, h: 108 },
    `<polygon points="${poly(100, 100, 96, 8, -Math.PI / 2 + Math.PI / 8)}" fill="{F}"/><polygon points="${poly(100, 100, 82, 8, -Math.PI / 2 + Math.PI / 8)}" fill="none" stroke="{W}" stroke-width="4"/>`),
  A("diamond", "Ρόμβος", 200, 200, { x: 52, y: 62, w: 96, h: 76 },
    `<rect x="36" y="36" width="128" height="128" rx="18" transform="rotate(45 100 100)" fill="{F}"/><rect x="50" y="50" width="100" height="100" rx="12" transform="rotate(45 100 100)" fill="none" stroke="{A}" stroke-width="4"/>`),
  A("medal", "Μετάλλιο", 200, 240, { x: 52, y: 108, w: 96, h: 92 },
    `<path d="M50 4 H86 L112 84 L84 96 Z" fill="{F2}"/><path d="M150 4 H114 L88 84 L116 96 Z" fill="{F2}"/><circle cx="100" cy="154" r="82" fill="{A}"/><circle cx="100" cy="154" r="70" fill="{F}"/><circle cx="100" cy="154" r="62" fill="none" stroke="{W}" stroke-opacity="0.6" stroke-width="2"/>`),
  A("star", "Αστέρι", 200, 192, { x: 58, y: 70, w: 84, h: 70 },
    `<polygon points="${ring(100, 104, 96, 44, 5)}" fill="{F}" stroke="{F}" stroke-width="14" stroke-linejoin="round"/><polygon points="${ring(100, 104, 74, 34, 5)}" fill="none" stroke="{A}" stroke-width="3" stroke-linejoin="round"/>`),
  A("pennant", "Σημαιάκι", 240, 120, { x: 26, y: 18, w: 140, h: 84 },
    `<path d="M10 6 L232 60 L10 114 Z" fill="{F}"/><rect x="2" y="2" width="10" height="116" rx="5" fill="{A}"/>`),
  A("fishtail", "Ταινία με ουρές", 260, 90, { x: 30, y: 8, w: 200, h: 74 },
    `<path d="M4 6 H256 L238 45 L256 84 H4 L22 45 Z" fill="{F}"/><path d="M22 16 H238 M22 74 H238" stroke="{A}" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round"/>`),
  A("gift-box", "Κουτί δώρου", 200, 216, { x: 26, y: 112, w: 148, h: 90 },
    `<rect x="10" y="62" width="180" height="40" rx="6" fill="{F2}"/><rect x="20" y="100" width="160" height="112" rx="6" fill="{F}"/><rect x="88" y="62" width="24" height="150" fill="{A}"/><path d="M100 62 C76 22 44 30 52 50 C58 64 84 62 100 62 Z M100 62 C124 22 156 30 148 50 C142 64 116 62 100 62 Z" fill="{A}"/>`),
  A("bag", "Τσάντα αγορών", 200, 224, { x: 28, y: 92, w: 144, h: 110 },
    `<path d="M66 70 V48 a34 34 0 0 1 68 0 V70" fill="none" stroke="{A}" stroke-width="9" stroke-linecap="round"/><path d="M22 64 H178 L190 214 a8 8 0 0 1 -8 8 H18 a8 8 0 0 1 -8 -8 Z" fill="{F}"/><circle cx="66" cy="84" r="6" fill="{F2}"/><circle cx="134" cy="84" r="6" fill="{F2}"/>`),
  A("coin", "Νόμισμα", 200, 200, { x: 46, y: 50, w: 108, h: 100 },
    `<circle cx="100" cy="104" r="92" fill="{F2}"/><circle cx="100" cy="96" r="92" fill="{F}"/><circle cx="100" cy="96" r="74" fill="none" stroke="{A}" stroke-width="4"/>${Array.from({ length: 36 }, (_, i) => { const a = (2 * Math.PI * i) / 36; return `<line x1="${f(100 + 84 * Math.cos(a))}" y1="${f(96 + 84 * Math.sin(a))}" x2="${f(100 + 90 * Math.cos(a))}" y2="${f(96 + 90 * Math.sin(a))}" stroke="{A}" stroke-width="2"/>`; }).join("")}`),
  A("peel", "Αυτοκόλλητο με γύρισμα", 200, 200, { x: 40, y: 44, w: 112, h: 104 },
    `<path d="M100 6 A94 94 0 1 0 172 160 L150 136 C162 120 160 104 164 92 Z" fill="{F}"/><path d="M164 92 C160 104 162 120 150 136 L172 160 C186 140 194 116 194 100 Z" fill="{F2}"/><path d="M150 136 L172 160 C160 150 154 146 150 136 Z" fill="{W}" fill-opacity="0.6"/>`),
  A("sunburst", "Ήλιος με ακτίνες", 200, 200, { x: 48, y: 52, w: 104, h: 96 },
    `<g fill="{F2}">${rays(100, 100, 98, 24, 0.07)}</g><circle cx="100" cy="100" r="66" fill="{F}"/><circle cx="100" cy="100" r="58" fill="none" stroke="{A}" stroke-width="3"/>`),
  A("split-pill", "Pill δύο χρωμάτων", 260, 84, { x: 92, y: 8, w: 156, h: 68 },
    `<rect x="4" y="4" width="252" height="76" rx="38" fill="{F}"/><path d="M42 4 H90 V80 H42 a38 38 0 0 1 0 -76 Z" fill="{F2}"/><polygon points="${ring(56, 42, 18, 8, 5)}" fill="{A}"/>`),
  A("comic", "Κόμικ «ΠΑΟΥ»", 220, 200, { x: 56, y: 56, w: 108, h: 88 },
    `<polygon points="110,4 128,52 172,18 160,68 216,62 176,100 214,138 160,134 172,190 128,152 104,198 88,150 34,180 54,130 4,118 46,92 10,54 64,64 56,10 96,50" fill="{F2}"/><polygon points="110,26 124,64 160,40 150,80 194,76 160,102 190,130 148,126 156,170 122,140 104,176 92,138 50,160 66,124 28,112 62,94 34,64 74,72 70,32 100,64" fill="{F}"/>`),
  A("circle-ribbon", "Κύκλος με ταινία", 220, 200, { x: 18, y: 80, w: 184, h: 48 },
    `<circle cx="110" cy="100" r="92" fill="{F}"/><path d="M4 74 H216 L204 104 L216 134 H4 L16 104 Z" fill="{F2}"/><circle cx="110" cy="100" r="82" fill="none" stroke="{A}" stroke-width="3"/>`),
];

const P = (id: string, fill: string, fill2: string | null, accent: string, color: string, lines: [string, string?], tags: string[]): ArtPreset => ({ art: ART.find((a) => a.id === id)!, palette: { fill, fill2, accent, color }, lines, tags });

/** Έτοιμοι συνδυασμοί σχήματος + αποχρώσεων (κόκκινο μόνο για εκπτώσεις — κανόνας brand). */
export const ART_PRESETS: ArtPreset[] = [
  P("burst-double", "#F1C400", null, "#122A58", "#122A58", ["1+1", "δώρο"], ["προσφορά"]),
  P("burst-double", "#D62828", null, "#FFFFFF", "#FFFFFF", ["−30%", "τώρα"], ["έκπτωση"]),
  P("rosette", "#1D428A", "#122A58", "#F1C400", "#FFFFFF", ["Top", "επιλογή"], ["ποιότητα"]),
  P("speech", "#122A58", null, "#F1C400", "#FFFFFF", ["Ρώτα μας!"], ["επικοινωνία"]),
  P("shield", "#1E7B3C", null, "#FFFFFF", "#FFFFFF", ["+2 έτη", "εγγύηση"], ["εγγύηση"]),
  P("hang-tag", "#F1C400", null, "#122A58", "#122A58", ["Νέα", "τιμή"], ["τιμή"]),
  P("ticket", "#7C3AED", null, "#FFFFFF", "#FFFFFF", ["Κουπόνι", "−15 €"], ["κουπόνι"]),
  P("banner-fold", "#0F766E", "#115E59", "#0B3F3B", "#FFFFFF", ["Δωρεάν αποστολή"], ["αποστολή"]),
  P("arrow", "#EA580C", null, "#FFFFFF", "#FFFFFF", ["Μόνο online"], ["online"]),
  P("stamp", "#122A58", null, "#FFFFFF", "#FFFFFF", ["Εγγυημένο", "original"], ["ποιότητα"]),
  P("heart", "#DB2777", null, "#FFFFFF", "#FFFFFF", ["Αγαπημένο"], ["δημοφιλές"]),
  P("stripes", "#F1C400", "#E0B200", "#122A58", "#122A58", ["Black", "Friday"], ["εποχικό"]),
  P("blob", "#0EA5E9", null, "#FFFFFF", "#FFFFFF", ["Eco", "επιλογή"], ["οικολογικό"]),
  P("octagon", "#111827", null, "#F1C400", "#F1C400", ["STOP", "τιμή"], ["τιμή"]),
  P("diamond", "#1D428A", "#3B82F6", "#FFFFFF", "#FFFFFF", ["Premium"], ["premium"]),
  P("medal", "#F1C400", "#D62828", "#B8860B", "#122A58", ["No1", "σε πωλήσεις"], ["δημοφιλές"]),
  P("star", "#F59E0B", null, "#FFFFFF", "#122A58", ["4,8★"], ["αξιολόγηση"]),
  P("pennant", "#1E7B3C", null, "#122A58", "#FFFFFF", ["Νέο"], ["νέο"]),
  P("fishtail", "#122A58", null, "#F1C400", "#F1C400", ["Αποκλειστικά Euronics"], ["αποκλειστικό"]),
  P("gift-box", "#7C3AED", "#5B21B6", "#F1C400", "#FFFFFF", ["Δώρο", "μαζί"], ["δώρο"]),
  P("bag", "#0F766E", "#134E4A", "#F1C400", "#FFFFFF", ["Click", "& collect"], ["παραλαβή"]),
  P("coin", "#F1C400", "#C99A00", "#B8860B", "#122A58", ["−50 €", "cashback"], ["cashback"]),
  P("peel", "#22C55E", "#15803D", "#FFFFFF", "#FFFFFF", ["Σε", "απόθεμα"], ["διαθεσιμότητα"]),
  P("sunburst", "#F97316", "#FDBA74", "#FFFFFF", "#FFFFFF", ["Καλοκαίρι"], ["εποχικό"]),
  P("split-pill", "#122A58", "#F1C400", "#122A58", "#FFFFFF", ["Flash 48 ώρες"], ["flash"]),
  P("comic", "#F1C400", "#D62828", "#122A58", "#122A58", ["WOW", "τιμή!"], ["προσφορά"]),
  P("circle-ribbon", "#1D428A", "#F1C400", "#FFFFFF", "#122A58", ["Νέα σειρά 2026"], ["νέο"]),
  P("burst-double", "#14B8A6", "#0F766E", "#FFFFFF", "#FFFFFF", ["Smart", "home"], ["κατηγορία"]),
  P("ticket", "#E11D48", null, "#FFFFFF", "#FFFFFF", ["−10%", "με κωδικό"], ["έκπτωση"]),
  P("hang-tag", "#111827", null, "#F1C400", "#F1C400", ["Outlet"], ["outlet"]),
];

export const artById = (id: string) => ART.find((a) => a.id === id) ?? null;

/** Πλάτος (px) ώστε το σχήμα να χωρά σε κουτί `box`: τα φαρδιά πιο πλατιά, τα ψηλά με βάση το ύψος τους. */
export const fitWidth = (art: Pick<StickerArt, "w" | "h">, box: number) => (art.w / art.h > 1.6 ? Math.round(box * 1.35) : art.h > art.w * 1.08 ? Math.round((box * art.w) / art.h) : box);
