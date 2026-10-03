import type { Dims } from "@/lib/data/dims";
import { dimsFor } from "@/lib/data/dims";
import type { Product } from "@/lib/data/types";
import { unifyDims } from "@/lib/catalog/dimensions";
import { profileFor, surfaceFor, type Bounds, type Surface } from "./placement";

/**
 * Μία απόφαση ανά προϊόν για το «Δες το στον χώρο σου», κοινή για τη σελίδα προϊόντος, τον server των μοντέλων και τη
 * διαχείριση: αν δείχνουμε AR, με ποιες διαστάσεις (ελεγμένες), σε ποια επιφάνεια, και γιατί όχι όταν δεν δείχνουμε.
 *
 * Κανόνας: ποτέ μοντέλο σε λάθος μέγεθος. Διαστάσεις με λάθος μονάδα ή σειρά διορθώνονται μόνο όταν η διόρθωση είναι
 * μονοσήμαντη (βλ. `unifyDims`)· αλλιώς το κουμπί δεν εμφανίζεται και η διαχείριση βλέπει τον λόγο.
 */
export interface TvSpec {
  /** εκ.: ύψος και πάχος του πάνελ, ύψος και βάθος της βάσης */
  panelH: number; panelD: number; standH: number; standD: number;
}
export interface ArPlan {
  on: boolean;
  /** γιατί δεν υπάρχει AR (για τη διαχείριση) */
  reason?: string;
  /** οι διαστάσεις του μοντέλου (εκ.) — για τηλεόραση: πλάτος, συνολικό ύψος και βάθος ΜΕ τη βάση */
  dims: Dims | null;
  surface: Surface;
  /** δεύτερη επιφάνεια για τον πελάτη (π.χ. τηλεόραση στον τοίχο) */
  alt?: Surface;
  archetype?: "tv";
  tv?: TvSpec;
  hint: string;
  /** τι διορθώθηκε αυτόματα στις διαστάσεις */
  fix?: string;
  custom: boolean;
}
type ArRow = { enabled: boolean; glbUrl: string | null; placement: string | null } | null;

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const AXES = ["w", "h", "d"] as const;

/** Διαγώνιος τηλεόρασης από τον τίτλο: 55", 55'', 55 ιντσών, QE55…, OLED65…, 43LF…, «TV 50». */
export function inchesOf(title: string): number | null {
  const pats = [
    /(\d{2,3})(?:[.,]\d)?\s*(?:"|''|″|”|“|΄΄|ιντσ|inch|in\b)/gi,
    /\b(?:QE|UE|GQ|TQ|KD|XR|KDL|OLED|NANO)[-\s]?(\d{2,3})/gi,
    /^(\d{2,3})(?=[A-Z])/g,
    /\b(\d{2,3})(?=(?:UR|UQ|UP|UN|UM|UT|NANO|QNED|LF|LB|LQ|LR|LX|UA|NU|MUC|PUS|PFS|PHS|OLED|Q\d|U\d|A\d|E\d|S\d|C\d|G\d|B\d))/g,
    /\bTV\s*(\d{2,3})\b/gi,
  ];
  for (const re of pats) for (const m of title.matchAll(re)) { const n = Number(m[1]); if (n >= 19 && n <= 120) return n; }
  return null;
}

/**
 * Τηλεόραση: πλάτος από τις διαστάσεις όταν συμφωνεί με τη διαγώνιο (αλλιώς από τη διαγώνιο, 16:9). Το πάνελ έχει λόγο
 * ~1,73 (16:9 με πλαίσιο)· ό,τι ύψος περισσεύει είναι η βάση. Βάθος > 10 εκ. σημαίνει «με βάση».
 */
function tvFrom(title: string, d: Dims | null): { dims: Dims; tv: TvSpec; fix?: string } | null {
  const inch = inchesOf(title);
  const W = inch ? inch * 2.54 * 0.8716 + 2 : null;
  const fitsW = (x: number) => (W ? x >= W * 0.9 && x <= W * 1.12 : x >= 45 && x <= 235);
  let w: number | null = null, givenH: number | null = null, fix: string | undefined;
  if (d) {
    // πρώτα η δηλωμένη σειρά: μια TV σε ψηλό καβαλέτο είναι πιο ψηλή από φαρδιά, χωρίς να είναι ανάποδα
    if (fitsW(d.w)) { w = d.w; givenH = d.h; }
    else if (fitsW(d.h) && d.w < d.h) { w = d.h; givenH = d.w; fix = "πλάτος και ύψος ήταν ανάποδα"; }
  }
  let fromDiag = false;
  if (!w) {
    if (!W) return null;
    w = Math.round(W); fromDiag = true;
    // το ύψος κρατιέται μόνο αν ταιριάζει με το πάνελ (μόνο του ή με βάση)
    const ph = w / 1.73;
    givenH = d && d.h >= ph * 0.95 && d.h <= ph * 1.6 ? d.h : null;
    fix = `πλάτος από τη διαγώνιο ${inch}" — οι δηλωμένες διαστάσεις δεν ταίριαζαν`;
  }
  if (!inch && givenH && (w / givenH < 1.2 || w / givenH > 1.9)) return null;
  const panelH = r1(w / 1.73);
  const standH = r1(givenH && givenH > panelH * 1.06 ? clamp(givenH - panelH, 3, 60) : clamp(w * 0.06, 5, 9));
  const dd = d && (!fromDiag || (d.d >= 0.8 && d.d <= 55)) ? d.d : null;
  const panelD = r1(dd && dd <= 10 ? Math.max(dd, 0.8) : /oled/i.test(title) ? 4.5 : 7);
  const standD = r1(dd && dd > 10 && dd <= 55 ? dd : clamp(w * 0.22, 18, 32));
  return { dims: { w: r1(w), h: r1(panelH + standH), d: standD, source: d?.source ?? "specs" }, tv: { panelH, panelD, standH, standD }, fix };
}

const GENERIC: Bounds = { w: [1, 250], h: [1, 250], d: [0.5, 250] };
const within = (x: { w: number; h: number; d: number }, b: Bounds) => AXES.every((a) => x[a] >= b[a][0] && x[a] <= b[a][1]);

/** Ελεγμένες διαστάσεις: όπως είναι, ή με μονοσήμαντη διόρθωση μονάδας/σειράς, ή τίποτα. */
function sane(d: Dims, bounds?: Bounds): { dims: Dims; fix?: string } | null {
  if (within(d, GENERIC) && (!bounds || within(d, bounds))) return { dims: d };
  if (bounds) {
    const u = unifyDims(d, { strict: true, ...bounds });
    if (u.fix && within(u.dims, bounds)) return { dims: { ...u.dims, source: d.source }, fix: u.fix.replace(/^Διορθώθηκε αυτόματα: /, "") };
    return null;
  }
  const m = Math.max(d.w, d.h, d.d);
  const f = m > 250 ? 0.1 : m < 3 ? 100 : null;
  if (f) { const x = { w: r1(d.w * f), h: r1(d.h * f), d: r1(d.d * f), source: d.source }; if (within(x, GENERIC)) return { dims: x, fix: f === 0.1 ? "ήταν σε χιλιοστά" : "ήταν σε μέτρα" }; }
  return null;
}

export function arPlan(p: Product, ar: ArRow): ArPlan {
  const prof = profileFor(p);
  const custom = !!ar?.glbUrl;
  const surface = surfaceFor(p, ar?.placement);
  const alt = prof.alt && prof.alt !== surface ? prof.alt : surface !== prof.surface && !prof.none ? prof.surface : undefined;
  const base = { surface, alt, hint: prof.hint, custom };
  const off = (reason: string): ArPlan => ({ ...base, on: false, reason, dims: null });
  if (ar && !ar.enabled) return off("Κλειστό από τη διαχείριση.");
  if (!ar && prof.none) return off("Μικρή ή προσωπική συσκευή/αξεσουάρ: χωρίς αυτόματο AR (ανοίγει ρητά από εδώ).");
  const raw = dimsFor(p);
  if (prof.archetype === "tv" && !custom) {
    const t = tvFrom(p.title, raw && raw.source !== "category" ? raw : null);
    if (t) return { ...base, on: true, dims: t.dims, archetype: "tv", tv: t.tv, fix: t.fix };
    if (!ar) return off("Δεν βρέθηκαν ούτε διαστάσεις ούτε διαγώνιος τηλεόρασης στον τίτλο.");
  }
  if (!raw) return off("Χωρίς διαστάσεις.");
  if (raw.source === "category" && !ar) return off("Μόνο τυπικές διαστάσεις της κατηγορίας — όχι του προϊόντος.");
  const s = sane(raw, prof.bounds);
  if (!s) return off(`Διαστάσεις εκτός λογικών ορίων (${raw.w} × ${raw.h} × ${raw.d} εκ.) — διόρθωσέ τες στις Διαστάσεις του καταλόγου.`);
  if (!custom && !p.image) return off("Χωρίς φωτογραφία για την πρόσοψη.");
  return { ...base, on: true, dims: s.dims, fix: s.fix };
}

/**
 * Τα αρχεία που θα ζητήσει ο πελάτης για αυτό το προϊόν, ώστε να χτιστούν πριν από το κλικ: για κάθε επιφάνεια
 * (κύρια + εναλλακτική) η προεπισκόπηση χωρίς ψημένες ετικέτες και το μοντέλο AR με ετικέτες (GLB + USDZ).
 */
export function arVariants(plan: ArPlan): { labels: boolean; wall: boolean }[] {
  const out = new Map<string, { labels: boolean; wall: boolean }>();
  for (const sf of [plan.surface, ...(plan.alt ? [plan.alt] : [])]) {
    const wall = sf === "wall";
    const tvWall = plan.archetype === "tv" && wall;
    for (const v of [{ labels: false, wall: tvWall }, { labels: true, wall: tvWall }, { labels: true, wall }]) out.set(`${v.labels}-${v.wall}`, v);
  }
  return [...out.values()];
}
