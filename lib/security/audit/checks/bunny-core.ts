import { worst, type Finding, type Severity } from "../rules";
import { athens } from "../execute";

/**
 * Bunny Storage — καθαρή λογική (τη λίστα τη φέρνει το bunny.ts). Η ζώνη σερβίρεται από το CDN μας: ένα .html/.js/.php
 * εκεί είναι σελίδα ή σενάριο «από εμάς» (phishing, payload ClickFix), ένα .exe/.ps1/.zip είναι αρχείο προς λήψη.
 *   Critical: σελίδες, σενάρια, εκτελέσιμα, .zip που ΠΡΟΣΤΕΘΗΚΑΝ / ΑΛΛΑΞΑΝ στο διάστημα ελέγχου (LastChanged ≥ since, ή
 *             χωρίς ημερομηνία) · οποιοδήποτε αρχείο εκτός του φακέλου της εφαρμογής (basePath) που άλλαξε στο διάστημα ·
 *             SVG με script / on…= / javascript: / foreignObject.
 *   Warn: ΕΝΑ εύρημα για όσα επικίνδυνα αρχεία προϋπήρχαν (πλήθος + τα 10 πρώτα — εκτός όσων είναι στο BUNNY_ALLOWED) ·
 *         άλλοι άγνωστοι τύποι (ανά κατάληξη) · SVG > 1 MB που δεν ελέγχθηκε · μερική σάρωση (μόνο όταν φτάσει πραγματικά ένα όριο: 100.000 αρχεία / 50.000 φάκελοι, ή τελείωσε ο χρόνος).
 * Χωρίς αυτό, ένα παλιό αρχείο θα ήταν «κρίσιμο» σε κάθε έλεγχο για πάντα — και τα νέα θα χάνονταν ανάμεσά τους.
 */

/**
 * Όρια της λίστας: μετράνε ΞΕΧΩΡΙΣΤΑ αρχεία και φακέλους (πριν, ένα κοινό όριο 20.000 «αντικειμένων» έκοβε πάντα τη ζώνη μας
 * των 10.990 αρχείων + 9.010 φακέλων). Το όριο φακέλων είναι ασφάλεια απέναντι σε ατέλειωτη δομή.
 */
export const MAX_FILES = 100_000;
export const MAX_DIRS = 50_000;
export type CapHit = "files" | "dirs";
/** Θα ξεπερνούσε το επόμενο αντικείμενο (φάκελος ή αρχείο) κάποιο όριο; Τα πλήθη είναι όσα έχουν ήδη μετρηθεί. */
export function capHit(files: number, dirs: number, nextIsDir: boolean): CapHit | null {
  if (nextIsDir) return dirs >= MAX_DIRS ? "dirs" : null;
  return files >= MAX_FILES ? "files" : null;
}
export const SVG_MAX_BYTES = 1_000_000;

const CRITICAL_EXT = new Set(["html", "htm", "xhtml", "shtml", "js", "mjs", "cjs", "php", "phtml", "php3", "php4", "php5", "php7", "phar", "asp", "aspx", "jsp", "cgi", "pl", "py", "exe", "com", "scr", "msi", "dll", "ps1", "psm1", "bat", "cmd", "vbs", "vbe", "wsf", "hta", "jar", "sh", "apk", "lnk", "zip"]);
const OK_EXT = new Set([
  "jpg", "jpeg", "jfif", "png", "gif", "webp", "avif", "ico", "bmp", "tif", "tiff", "heic", "heif",
  "mp4", "webm", "mov", "m4v", "ogv", "mp3", "wav", "ogg", "m4a", "aac", "vtt", "srt",
  "glb", "gltf", "usdz", "pdf", "woff", "woff2", "ttf", "otf", "eot",
]);

/**
 * Διπλή κατάληξη (invoice.php.jpg): το CDN τη σερβίρει με τον τύπο της ΤΕΛΕΥΤΑΙΑΣ κατάληξης, άρα δεν εκτελείται — αλλά είναι
 * κλασικό κόλπο ανεβάσματος σε servers που κοιτούν την πρώτη. Warn μόνο για καταλήξεις σεναρίων server / εκτελέσιμων·
 * οι υπόλοιπες λέξεις με τελεία (LG-manual.pl.pdf, img.samsung.com.webp) είναι απλά ονόματα.
 */
const DOUBLE_WARN_EXT = new Set(["php", "phtml", "php3", "php4", "php5", "php7", "phar", "asp", "aspx", "jsp", "exe", "scr", "ps1", "hta", "bat", "cmd", "vbs"]);

const extOf = (p: string) => { const name = p.split("/").pop() ?? p; const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1).toLowerCase() : ""; };
const innerExts = (p: string) => (p.split("/").pop() ?? p).toLowerCase().split(".").slice(1, -1);

export type ObjectClass = { kind: "ok" | "svg" | "warn" | "critical"; reason: string; group: string };

export function classifyObject(path: string, size: number): ObjectClass {
  const ext = extOf(path);
  const g = ext ? `.${ext}` : "(χωρίς κατάληξη)";
  if (CRITICAL_EXT.has(ext)) return { kind: "critical", reason: `αρχείο .${ext} (σελίδα, σενάριο, εκτελέσιμο ή συμπιεσμένο) στο CDN`, group: g };
  const dbl = innerExts(path).find((e) => DOUBLE_WARN_EXT.has(e));
  if (dbl) return { kind: "warn", reason: `διπλή κατάληξη .${dbl}.${ext} — σερβίρεται ως .${ext}, αλλά είναι κόλπο ανεβάσματος· ελέγξτε την προέλευση`, group: `διπλή κατάληξη .${dbl}` };
  if (ext === "svg") return size > SVG_MAX_BYTES ? { kind: "warn", reason: "SVG μεγαλύτερο από 1 MB — δεν ελέγχθηκε το περιεχόμενό του", group: "SVG > 1 MB" } : { kind: "svg", reason: "", group: g };
  if (OK_EXT.has(ext)) return { kind: "ok", reason: "", group: g };
  return { kind: "warn", reason: ext ? `άγνωστος τύπος αρχείου .${ext}` : "αρχείο χωρίς κατάληξη", group: g };
}

/** Διαδρομή μέσα στη ζώνη από ένα στοιχείο της λίστας του Bunny (Path = «/ζώνη/φάκελος/»). */
export function objectPath(zone: string, o: { Path: string; ObjectName: string }): string {
  const dir = o.Path.replace(new RegExp(`^/?${zone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "").replace(/^\/+/, "");
  return `${dir}${o.ObjectName}`;
}

/** Λόγος που ένα SVG είναι επικίνδυνο, ή null. */
export function svgThreat(svg: string): string | null {
  if (/<\s*script\b/i.test(svg)) return "<script> μέσα στο SVG";
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(svg)) return "χειριστής συμβάντος (on…=) μέσα στο SVG";
  if (/(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i.test(svg)) return "javascript: / data:text/html σε σύνδεσμο του SVG";
  if (/<\s*foreignObject\b/i.test(svg)) return "<foreignObject> (ενσωματωμένο HTML) μέσα στο SVG";
  return null;
}

export type Flagged = { path: string; kind: "warn" | "critical"; reason: string; group: string; /** LastChanged του Bunny (null = άγνωστη) */ changedAt?: Date | null };
const n = (x: number) => x.toLocaleString("el-GR");
const trimSlashes = (p: string) => p.replace(/^\/+|\/+$/g, "");
/** Η διαδρομή είναι μέσα σε έναν από τους φακέλους της εφαρμογής (basePath)· χωρίς ρυθμισμένο basePath → όλα «μέσα». */
export function underBase(path: string, basePaths: string[]): boolean {
  const bases = basePaths.map(trimSlashes).filter(Boolean);
  const p = trimSlashes(path);
  return !bases.length || bases.some((b) => p === b || p.startsWith(`${b}/`));
}
const PRE = 10;
const capText = (by?: CapHit) => (by === "dirs" ? `${n(MAX_DIRS)} φακέλων` : `${n(MAX_FILES)} αρχείων`);

export function bunnyOutcome(input: {
  files: number; dirs: number; truncated: boolean; /** ποιο όριο έφτασε */ truncatedBy?: CapHit; listIncomplete?: boolean; failedDirs?: string[]; svgTotal: number; svgChecked: number; svgFailed?: number; findings: Finding[]; flagged?: Flagged[];
  /** αρχή του διαστήματος ελέγχου — χωρίς αυτό κάθε επικίνδυνο αρχείο είναι critical */ since?: Date;
  /** BUNNY_ALLOWED (ακριβείς διαδρομές) */ allowed?: readonly string[];
  /** αρχεία εκτός basePath που άλλαξαν στο διάστημα (οποιουδήποτε τύπου) */ outsideChanged?: { path: string; changedAt: Date }[];
}): { status: Severity; summary: string; findings: Finding[]; complete: boolean } {
  const findings: Finding[] = [];
  const flagged = input.flagged ?? [];
  const allowed = new Set((input.allowed ?? []).map(trimSlashes));
  const fresh = (f: Flagged) => !input.since || !f.changedAt || f.changedAt.getTime() >= input.since.getTime();
  const pre: Flagged[] = [];
  let allowedCount = 0;
  for (const f of flagged.filter((x) => x.kind === "critical")) {
    if (fresh(f)) findings.push({ severity: "critical", title: "Επικίνδυνο αρχείο στο Bunny Storage", detail: `${f.path}: ${f.reason}. ${input.since ? `Νέο ή αλλαγμένο από ${athens(input.since)} — δ` : "Δ"}εν πρέπει να υπάρχει στο CDN — ελέγξτε ποιος το ανέβασε και πότε.`, evidence: f.path });
    else if (allowed.has(trimSlashes(f.path))) allowedCount++;
    else pre.push(f);
  }
  if (pre.length) {
    const paths = pre.map((f) => f.path).sort();
    findings.push({ severity: "warn", title: "Παλαιότερα επικίνδυνα αρχεία στο Bunny Storage", detail: `${n(paths.length)} αρχεία σελίδων / σεναρίων / εκτελέσιμων / .zip που δεν άλλαξαν από ${athens(input.since!)} — δεν είναι νέα, αλλά τέτοια αρχεία δεν θα έπρεπε να σερβίρει το CDN: ${paths.slice(0, PRE).join(", ")}${paths.length > PRE ? ` … (+${n(paths.length - PRE)})` : ""}. Ελέγξτε τα· όσα είναι νόμιμα μπαίνουν στο BUNNY_ALLOWED (lib/security/audit/policy.ts), τα υπόλοιπα διαγράφονται.`, evidence: "bunny: παλαιότερα επικίνδυνα αρχεία" });
  }
  const outside = [...(input.outsideChanged ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  if (outside.length) {
    const paths = outside.map((o) => o.path);
    findings.push({ severity: "critical", title: "Νέα αρχεία στο Bunny Storage εκτός του φακέλου της εφαρμογής", detail: `${n(paths.length)} αρχεία άλλαξαν${input.since ? ` από ${athens(input.since)}` : ""} έξω από τον φάκελο (basePath) όπου γράφει η εφαρμογή: ${outside.slice(0, PRE).map((o) => `${o.path} (${athens(o.changedAt)})`).join(", ")}${paths.length > PRE ? ` … (+${n(paths.length - PRE)})` : ""}. Η εφαρμογή δεν ανεβάζει τίποτα εκεί — ελέγξτε ποιος έχει τον κωδικό της ζώνης.`, evidence: paths.slice(0, 20).join(", ") });
  }
  const byExt = new Map<string, Flagged[]>();
  for (const f of flagged.filter((x) => x.kind === "warn")) { if (!byExt.has(f.group)) byExt.set(f.group, []); byExt.get(f.group)!.push(f); }
  for (const [ext, rows] of byExt) findings.push({ severity: "warn", title: "Αρχεία ασυνήθιστου τύπου στο Bunny Storage", detail: `${rows.length} αρχεία — ${ext} (${rows[0].reason}): ${rows.slice(0, 5).map((r) => r.path).join(", ")}${rows.length > 5 ? "…" : ""}.`, evidence: ext });
  findings.push(...input.findings);
  const failedDirs = input.failedDirs ?? [];
  const svgFailed = input.svgFailed ?? 0;
  const partial = input.truncated || !!input.listIncomplete || failedDirs.length > 0 || input.svgChecked < input.svgTotal;
  const P = "Μερική σάρωση του Bunny Storage";
  if (input.listIncomplete) findings.push({ severity: "warn", title: P, detail: "Τελείωσε ο χρόνος πριν ολοκληρωθεί η λίστα των φακέλων — όσοι δεν διαβάστηκαν δεν ελέγχθηκαν." });
  else if (input.truncated) findings.push({ severity: "warn", title: P, detail: `Η λίστα σταμάτησε στο όριο των ${capText(input.truncatedBy)} — τα υπόλοιπα δεν ελέγχθηκαν.` });
  if (failedDirs.length) findings.push({ severity: "warn", title: P, detail: `${failedDirs.length} φάκελοι δεν διαβάστηκαν (σφάλμα του Bunny) και δεν ελέγχθηκαν: ${failedDirs.slice(0, 5).map((d) => `/${d}`).join(", ")}${failedDirs.length > 5 ? "…" : ""}.` });
  if (input.svgChecked < input.svgTotal) {
    const timedOut = input.svgTotal - input.svgChecked - svgFailed;
    findings.push({ severity: "warn", title: P, detail: `Ελέγχθηκε το περιεχόμενο ${n(input.svgChecked)} από ${n(input.svgTotal)} SVG${svgFailed ? ` · ${n(svgFailed)} SVG δεν διαβάστηκαν (σφάλμα)` : ""}${timedOut > 0 ? ` · ${n(timedOut)} δεν πρόλαβαν (τελείωσε ο χρόνος)` : ""}.` });
  }
  const risky = flagged.filter((x) => x.kind === "critical").length;
  const summary = `${partial ? "μερική σάρωση — " : ""}${n(input.files)} αρχεία σε ${n(input.dirs)} φακέλους${input.listIncomplete ? " (η λίστα δεν ολοκληρώθηκε)" : input.truncated ? ` (όριο ${capText(input.truncatedBy)})` : ""}${failedDirs.length ? ` (${failedDirs.length} φάκελοι δεν διαβάστηκαν)` : ""} · περιεχόμενο ${n(input.svgChecked)}/${n(input.svgTotal)} SVG ελέγχθηκε για script${risky ? ` · επικίνδυνου τύπου: ${n(risky - pre.length - allowedCount)} νέα/αλλαγμένα${input.since ? ` από ${athens(input.since)}` : ""}, ${n(pre.length)} παλαιότερα${allowedCount ? `, ${n(allowedCount)} εγκεκριμένα (BUNNY_ALLOWED)` : ""}` : ""}${input.outsideChanged ? ` · εκτός του φακέλου της εφαρμογής: ${n(outside.length)} αλλαγές στο διάστημα` : ""}`;
  return { status: worst(findings.map((f) => f.severity)), summary, findings, complete: !partial };
}
