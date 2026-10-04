import { stickerXY, type StickerParams } from "./model";

/**
 * Διάταξη πολλών stickers σε μία κάρτα. Η φωτογραφία χωρίζεται σε 9 ζώνες (3×3)· κάθε sticker θέλει τη ζώνη της θέσης
 * του. Κανόνες:
 * - με σειρά προτεραιότητας (μικρότερος αριθμός πρώτα): έκπτωση/προσφορά → χειροκίνητα → ετικέτες·
 * - ζώνες που πιάνουν τα σταθερά στοιχεία της κάρτας (καρδιά, γρήγορη προβολή, σήμα έκπτωσης, χρώματα) είναι κλειστές·
 * - αν η ζώνη είναι πιασμένη, το sticker πάει στην πλησιέστερη ελεύθερη — ποτέ δύο στην ίδια, ποτέ επικάλυψη·
 * - το κέντρο (πάνω στο προϊόν) μόνο όταν το sticker είναι το μοναδικό·
 * - έως `max` ορατά· όσα περισσεύουν εναλλάσσονται στην τελευταία θέση (η σελίδα προϊόντος τα δείχνει όλα).
 */
export type Zone = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export interface CardSticker { key: string; params: StickerParams; priority: number; source: "promo" | "manual" | "tag" }
export interface Placed { s: CardSticker; x: number; y: number }
export interface Layout { placed: Placed[]; rotating: Placed[] }

const COL = (x: number) => (x < 34 ? 0 : x > 66 ? 2 : 1), ROW = (y: number) => (y < 34 ? 0 : y > 66 ? 2 : 1);
const ZONES: Zone[][] = [["tl", "tc", "tr"], ["ml", "mc", "mr"], ["bl", "bc", "br"]];
const XY: Record<Zone, [number, number]> = { tl: [0, 0], tc: [50, 0], tr: [100, 0], ml: [0, 50], mc: [50, 50], mr: [100, 50], bl: [0, 100], bc: [50, 100], br: [100, 100] };
export const zoneOf = (x: number, y: number): Zone => ZONES[ROW(y)][COL(x)];

export function layoutStickers(list: CardSticker[], opts: { max: number; reserved: Partial<Record<Zone, boolean>> }): Layout {
  const sorted = [...list].sort((a, b) => a.priority - b.priority);
  const taken = new Set<Zone>(Object.entries(opts.reserved).filter(([, v]) => v).map(([k]) => k as Zone));
  const single = sorted.length === 1;
  const free = (z: Zone) => !taken.has(z) && (z !== "mc" || single);
  const place = (s: CardSticker): Placed | null => {
    const [x, y] = stickerXY(s.params);
    const want = zoneOf(x, y);
    if (free(want)) { taken.add(want); return { s, x, y }; }
    // πλησιέστερη ελεύθερη ζώνη (απόσταση στο πλέγμα), προτιμώντας άκρες και γωνίες
    const [r0, c0] = [ROW(y), COL(x)];
    const options = ZONES.flat().filter(free).sort((a, b) => {
      const d = (z: Zone) => { const r = ZONES.findIndex((row) => row.includes(z)), c = ZONES[r].indexOf(z); return Math.abs(r - r0) + Math.abs(c - c0) + (z === "mc" ? 5 : 0); };
      return d(a) - d(b);
    });
    const z = options[0]; if (!z) return null;
    taken.add(z);
    return { s, x: XY[z][0], y: XY[z][1] };
  };
  const max = Math.max(1, opts.max);
  const placed: Placed[] = [];
  let i = 0;
  for (; i < sorted.length && placed.length < max - 1; i++) { const p = place(sorted[i]); if (p) placed.push(p); }
  // τελευταία θέση: ένα sticker ή εναλλαγή όσων περισσεύουν, στη θέση του πρώτου από αυτά
  const rest = sorted.slice(i);
  if (!rest.length) return { placed, rotating: [] };
  const slot = place(rest[0]);
  if (!slot) return { placed, rotating: [] };
  if (rest.length === 1) return { placed: [...placed, slot], rotating: [] };
  return { placed, rotating: rest.map((s) => ({ s, x: slot.x, y: slot.y })) };
}
