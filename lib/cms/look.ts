/**
 * «Εμφάνιση»: τα ίδια πεδία παντού όπου ο διαχειριστής στήνει ζώνες (components της συλλογής, ενότητες της αρχικής,
 * blocks των σελίδων προσφορών). Καθαρές συναρτήσεις: ο πίνακας της διαχείρισης και η βιτρίνα διαβάζουν το ίδιο σχήμα.
 * Ό,τι μείνει κενό ακολουθεί το θέμα της σελίδας.
 */
export type BgFit = "cover" | "width" | "tile";
export type BgPattern = "dots" | "grid" | "diag" | "lines";

export interface LookFields {
  /** χρώμα φόντου σε όλο το πλάτος της ζώνης (#rrggbb)· κενό = το φόντο της σελίδας */
  bg?: string;
  /** εικόνα φόντου· χωρίς χρώμα μπαίνει σκούρο πέπλο και ανοιχτά κείμενα */
  bgImage?: string;
  /** πώς απλώνεται η εικόνα: cover = γεμίζει και κόβεται · width = όλο το πλάτος, χωρίς κόψιμο στα πλάγια · tile = πλακάκια */
  bgFit?: BgFit;
  /** μοτίβο πάνω από το χρώμα (όταν δεν υπάρχει εικόνα) */
  pattern?: BgPattern;
  /** χρώμα γραμμάτων (#rrggbb)· κενό = αυτόματα από το φόντο (λευκά σε σκούρο, σκούρα σε ανοιχτό) */
  ink?: string;
  /** χρώματα ανά στοιχείο: υπέρτιτλος, τίτλος, υπότιτλος (δευτερεύον κείμενο), σύνδεσμοι */
  kickerColor?: string;
  titleColor?: string;
  subColor?: string;
  linkColor?: string;
  /** απόσταση τίτλου → περιεχόμενο και κενό πάνω-κάτω ΜΕΣΑ στη ζώνη: 0 = κολλητά … 3 = μεγάλη· κενό = η κανονική */
  headGap?: number;
  padY?: number;
  /** περιθώρια ΓΥΡΩ από τη ζώνη σε px υπολογιστή (0–160)· στο κινητό μικραίνουν μόνα τους */
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
}

/** Αλλαγές μιας συσκευής πάνω στον υπολογιστή: null = «τίποτα εδώ» (π.χ. χωρίς εικόνα στο κινητό). */
export type LookOverride = { [K in keyof LookFields]?: LookFields[K] | null };
export type LookDevice = "desktop" | "tablet" | "mobile";
/**
 * Τρεις προβολές: ο υπολογιστής (≥ 1024px) είναι η βάση· tablet (768–1023px) και κινητό (< 768px) κρατούν ΜΟΝΟ ό,τι αλλάζει.
 * Ό,τι δεν οριστεί σε μια συσκευή ακολουθεί τον υπολογιστή.
 */
export interface Look extends LookFields { tablet?: LookOverride; mobile?: LookOverride }

/** Οι ρυθμίσεις όπως ισχύουν σε μια συσκευή (βάση + αλλαγές της συσκευής). */
export function lookFor(l: Look, device: LookDevice): LookFields {
  const { tablet, mobile, ...base } = l;
  const over = device === "tablet" ? tablet : device === "mobile" ? mobile : undefined;
  if (!over) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) { if (v == null) delete out[k]; else out[k] = v; }
  return out as LookFields;
}

export const LOOK_KEYS = ["bg", "bgImage", "bgFit", "pattern", "ink", "kickerColor", "titleColor", "subColor", "linkColor", "headGap", "padY", "mt", "mr", "mb", "ml"] as const satisfies readonly (keyof LookFields)[];
export const MARGIN_STEPS = [0, 8, 16, 24, 32, 48, 64, 96];

export const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
/** εικόνα φόντου: μόνο δική μας διαδρομή ή https, χωρίς χαρακτήρες που σπάνε το url() */
export const safeImage = (v: unknown) => (typeof v === "string" && /^(\/(?!\/)|https:\/\/)[^"'()\s\\]+$/.test(v) ? v : null);

export function luminance(c: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Αντίθεση WCAG ανάμεσα σε δύο χρώματα (1–21)· από 4,5 και πάνω το κείμενο διαβάζεται άνετα. */
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

/** Το χρώμα πάνω στο οποίο «κάθεται» το κείμενο: το χρώμα φόντου, αλλιώς το σκούρο πέπλο της εικόνας, αλλιώς η σελίδα. */
export const lookBase = (l: LookFields, page = "#ffffff") => hex(l.bg) ?? (safeImage(l.bgImage) ? "#05060f" : page);

const PATTERN: Record<BgPattern, (c: string) => { backgroundImage: string; backgroundSize?: string }> = {
  dots: (c) => ({ backgroundImage: `radial-gradient(circle, ${c} 1.5px, transparent 2px)`, backgroundSize: "1rem 1rem" }),
  grid: (c) => ({ backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: "1.25rem 1.25rem" }),
  diag: (c) => ({ backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px 0.75rem)` }),
  lines: (c) => ({ backgroundImage: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 0.625rem)` }),
};
export const patternCss = (p: BgPattern, color: string) => PATTERN[p](color);

const px = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(160, Math.round(v)) : 0);
const r = (n: number) => +n.toFixed(3);
/** Περιθώριο που ακολουθεί την οθόνη: πλήρες στα 1280px, πάνω-κάτω όχι κάτω από το μισό, πλάγια αναλογικά (96px → 27px στο κινητό). */
const fluidY = (n: number) => `clamp(${r(n / 32)}rem, ${r(n / 12.8)}vw, ${r(n / 16)}rem)`;
const fluidX = (n: number) => `min(${r(n / 16)}rem, ${r(n / 12.8)}vw)`;

const NONE: ReadonlySet<string> = new Set();

/**
 * CSS μιας ζώνης από τις ρυθμίσεις της. null = καμία ρύθμιση (η ζώνη αποδίδεται όπως ήταν).
 * Τα χρώματα κειμένου περνούν ως μεταβλητές --bs-* που διαβάζουν τα components· σε φόντο τα κείμενα ακολουθούν μόνα τους
 * (ανοιχτά σε σκούρο), ώστε να διαβάζονται πάντα.
 */
export function lookStyle(l: LookFields, exact: ReadonlySet<string> = NONE): { style: Record<string, string>; className: string } | null {
  const bg = hex(l.bg), img = safeImage(l.bgImage), ink = hex(l.ink), kicker = hex(l.kickerColor), title = hex(l.titleColor), sub = hex(l.subColor), link = hex(l.linkColor);
  const pattern = !img && l.pattern && l.pattern in PATTERN ? l.pattern : null;
  const step = (v: unknown, map: string[]) => (typeof v === "number" && map[v] != null ? map[v] : null);
  const headGap = step(l.headGap, ["0.25rem", "0.75rem", "1.5rem", "2.5rem"]), padY = step(l.padY, ["0rem", "1rem", "2.5rem", "4.5rem"]);
  const mt = px(l.mt), mr = px(l.mr), mb = px(l.mb), ml = px(l.ml);
  const s: Record<string, string> = {};
  if (kicker) s["--bs-kicker"] = kicker;
  if (title) s["--bs-title"] = title;
  if (link) s["--bs-link"] = link;
  if (headGap) s["--bs-head-gap"] = headGap;
  if (padY) s.paddingBlock = padY;
  // περιθώριο που ορίστηκε ρητά για τη συσκευή μπαίνει όπως είναι· αλλιώς ακολουθεί την οθόνη
  const m = (k: string, n: number, fluid: (n: number) => string) => (exact.has(k) ? `${r(n / 16)}rem` : fluid(n));
  if (mt) s.marginTop = m("mt", mt, fluidY);
  if (mb) s.marginBottom = m("mb", mb, fluidY);
  if (ml) s.marginLeft = m("ml", ml, fluidX);
  if (mr) s.marginRight = m("mr", mr, fluidX);
  const surface = bg || img;
  const base = bg ?? "#05060f";
  const dark = luminance(base) < 0.4;
  if (surface) {
    s["--bs-bg"] = img ? "transparent" : base;
    s["--bs-bg2"] = img ? (dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.06)") : `color-mix(in srgb, ${base} 88%, ${dark ? "white" : "black"})`;
    if (dark) { s["--bs-accent"] = "#f1c400"; s["--bs-accent-ink"] = "#122a58"; }
    // ενότητες με δικά τους χρώματα (αρχική, σελίδες προσφορών — κλάση .eu-look στο globals.css): το δικό τους φόντο
    // υποχωρεί και ο υπέρτιτλος παίρνει τόνο που διαβάζεται πάνω στο νέο
    s["--look-surface"] = "transparent";
    s["--look-accent"] = dark ? "#f1c400" : "#122a58";
    s.backgroundColor = base;
  }
  // ρητό χρώμα γραμμάτων κερδίζει το αυτόματο· το δευτερεύον κείμενο είναι το ίδιο χρώμα πιο αχνό, εκτός αν οριστεί υπότιτλος
  const inkNow = ink ?? (surface ? (dark ? "#ffffff" : "#1a1a1a") : null);
  if (inkNow) { s["--bs-ink"] = inkNow; s["--bs-muted"] = ink ? `color-mix(in srgb, ${ink} 72%, transparent)` : dark ? "rgba(255,255,255,.78)" : "#595959"; }
  if (sub) s["--bs-muted"] = sub;
  if (img) {
    // εικόνα χωρίς χρώμα → σκούρο πέπλο, για να διαβάζονται τα κείμενα
    const fit = l.bgFit === "width" || l.bgFit === "tile" ? l.bgFit : "cover";
    s.backgroundImage = `${bg ? "" : "linear-gradient(rgba(5,6,15,.55),rgba(5,6,15,.55)), "}url("${img}")`;
    s.backgroundSize = fit === "cover" ? "cover" : fit === "width" ? "100% auto" : "auto";
    s.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    s.backgroundPosition = fit === "cover" ? "center" : "top center";
  } else if (pattern) {
    Object.assign(s, patternCss(pattern, `color-mix(in srgb, ${inkNow ?? "#122a58"} 14%, transparent)`));
  }
  if (!Object.keys(s).length) return null;
  return { style: s, className: `${inkNow ? "text-[var(--bs-ink)]" : ""} ${title ? "eu-bs-title" : ""}`.trim() };
}

const MEDIA: Record<Exclude<LookDevice, "desktop">, string> = { tablet: "(min-width:768px) and (max-width:1023.98px)", mobile: "(max-width:767.98px)" };

/**
 * Οι τρεις προβολές ως CSS: `base` ισχύει παντού, `tablet` / `mobile` μόνο όσα διαφέρουν από τη βάση (με το media query τους).
 * Ό,τι υπάρχει στη βάση αλλά όχι στη συσκευή γίνεται `initial` — οι μεταβλητές --bs-* ξαναπέφτουν έτσι στο θέμα της σελίδας.
 */
export function lookRules(l: Look): { base: Record<string, string>; devices: { media: string; style: Record<string, string> }[]; className: string } | null {
  const b = lookStyle(lookFor(l, "desktop"));
  const base = b?.style ?? {};
  const classes = new Set((b?.className ?? "").split(" ").filter(Boolean));
  const devices: { media: string; style: Record<string, string> }[] = [];
  for (const d of ["tablet", "mobile"] as const) {
    const over = l[d];
    if (!over || !Object.keys(over).length) continue;
    const x = lookStyle(lookFor(l, d), new Set(Object.keys(over)));
    const now = x?.style ?? {};
    const diff: Record<string, string> = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) if (now[k] !== base[k]) diff[k] = now[k] ?? "initial";
    (x?.className ?? "").split(" ").filter(Boolean).forEach((c) => classes.add(c));
    if (Object.keys(diff).length) devices.push({ media: MEDIA[d], style: diff });
  }
  if (!Object.keys(base).length && !devices.length) return null;
  return { base, devices, className: [...classes].join(" ") };
}

/** Αντικαθιστά τα πεδία εμφάνισης ενός αντικειμένου (component / ενότητα / block) με τα νέα· ό,τι άλλο έχει μένει. */
export function withLook<T extends object>(o: T, l: Look): T {
  const out = { ...o } as Record<string, unknown>;
  for (const k of [...LOOK_KEYS, "tablet", "mobile"]) delete out[k];
  return { ...out, ...l } as T;
}
/** Μόνο τα πεδία εμφάνισης ενός αντικειμένου (με τις αλλαγές ανά συσκευή). */
export function lookOf(o: object): Look {
  const src = o as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k of [...LOOK_KEYS, "tablet", "mobile"]) if (src[k] != null) out[k] = src[k];
  return out as Look;
}
/** Πόσες ρυθμίσεις έχει ορίσει ο διαχειριστής σε μια συσκευή (υπολογιστής = η βάση)· τα τέσσερα περιθώρια μετρούν ως μία. */
export function lookCount(l: Look, d: LookDevice) {
  const keys = d === "desktop" ? LOOK_KEYS.filter((k) => l[k] != null) : Object.keys(l[d] ?? {});
  const margins = keys.filter((k) => /^m[trbl]$/.test(k)).length;
  return keys.length - margins + (margins ? 1 : 0);
}
