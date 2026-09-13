/**
 * Sticker designer model. `StickerParams` is what the CMS stores (JSON) and
 * what <StickerSvg> renders — the same renderer runs in the admin designer,
 * the storefront product card and the export (SVG/PNG to the media library).
 */
export type StickerShape = "circle" | "burst" | "seal" | "badge" | "pill" | "ribbon" | "tag" | "hex";
export type StickerIcon = "none" | "gift" | "percent" | "star" | "zap" | "trophy" | "tag" | "heart" | "truck";
export type StickerPosition = "tl" | "tr" | "bl" | "br" | "center";
export type StickerAnimation = "none" | "shimmer" | "breathe" | "wiggle" | "bump";

export interface StickerLine {
  text: string;
  /** 0 = auto-fit */
  size: number;
  weight: 700 | 800 | 900;
  upper: boolean;
  spacing: number;
}

export interface StickerParams {
  shape: StickerShape;
  /** rendered width on the product card, px */
  size: number;
  fill: string;
  fill2: string | null;
  color: string;
  border: string | null;
  borderWidth: number;
  shadow: boolean;
  rotate: number;
  /** burst points (12–28) / seal scallops (10–24) */
  points: number;
  lines: StickerLine[];
  icon: StickerIcon;
  position: StickerPosition;
  animation: StickerAnimation;
}

export const BRAND_COLORS: { label: string; value: string }[] = [
  { label: "Navy", value: "#122A58" },
  { label: "Blue", value: "#1D428A" },
  { label: "Yellow", value: "#F1C400" },
  { label: "Red (εκπτώσεις)", value: "#D62828" },
  { label: "Green", value: "#1E7B3C" },
  { label: "White", value: "#FFFFFF" },
  { label: "Ink", value: "#1A1A1A" },
];

const line = (text: string, o: Partial<StickerLine> = {}): StickerLine => ({ text, size: 0, weight: 800, upper: false, spacing: 0, ...o });

export const DEFAULT_STICKER: StickerParams = {
  shape: "burst",
  size: 96,
  fill: "#F1C400",
  fill2: null,
  color: "#122A58",
  border: null,
  borderWidth: 0,
  shadow: true,
  rotate: -8,
  points: 20,
  lines: [line("1+1", { weight: 900 }), line("δώρο", { weight: 700 })],
  icon: "none",
  position: "br",
  animation: "shimmer",
};

/** Ready-made brand templates — starting points in the designer. */
export const STICKER_PRESETS: { key: string; name: string; params: StickerParams }[] = [
  { key: "bogo", name: "1+1 δώρο", params: { ...DEFAULT_STICKER } },
  { key: "discount", name: "Έκπτωση −20%", params: { ...DEFAULT_STICKER, shape: "circle", fill: "#D62828", color: "#FFFFFF", rotate: -6, lines: [line("−20%", { weight: 900 }), line("έως 31/10", { weight: 700 })], animation: "breathe" } },
  { key: "gift", name: "Δώρο μαζί", params: { ...DEFAULT_STICKER, shape: "ribbon", size: 150, fill: "#F1C400", color: "#122A58", rotate: 0, position: "tr", icon: "gift", lines: [line("Δώρο μαζί", { weight: 800 })], animation: "shimmer" } },
  { key: "new", name: "Νέο", params: { ...DEFAULT_STICKER, shape: "badge", size: 72, fill: "#122A58", color: "#FFFFFF", rotate: 0, position: "tl", lines: [line("Νέο", { weight: 800, upper: true, spacing: 1 })], animation: "none", shadow: false } },
  { key: "contest", name: "Διαγωνισμός", params: { ...DEFAULT_STICKER, shape: "pill", size: 150, fill: "#122A58", color: "#F1C400", rotate: 0, position: "tl", icon: "star", lines: [line("Διαγωνισμός", { weight: 800 })], animation: "shimmer", shadow: true } },
  { key: "cashback", name: "Cashback", params: { ...DEFAULT_STICKER, shape: "seal", fill: "#1E7B3C", color: "#FFFFFF", rotate: 6, points: 16, lines: [line("−50 €", { weight: 900 }), line("cashback", { weight: 700 })], animation: "bump" } },
  { key: "pick", name: "Επιλογή καταστήματος", params: { ...DEFAULT_STICKER, shape: "tag", size: 160, fill: "#122A58", color: "#FFFFFF", rotate: -4, position: "bl", icon: "heart", lines: [line("Επιλογή", { weight: 800 }), line("καταστήματος", { weight: 700 })], animation: "none" } },
  { key: "flash", name: "Flash deal", params: { ...DEFAULT_STICKER, shape: "hex", fill: "#1D428A", fill2: "#122A58", color: "#F1C400", border: "#F1C400", borderWidth: 4, rotate: 0, icon: "zap", lines: [line("Flash", { weight: 900, upper: true, spacing: 1 }), line("48 ώρες", { weight: 700 })], animation: "breathe" } },
];

export const stickerKeyFromName = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
