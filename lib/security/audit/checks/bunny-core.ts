import { worst, type Finding, type Severity } from "../rules";

/**
 * Bunny Storage — καθαρή λογική (τη λίστα τη φέρνει το bunny.ts). Η ζώνη σερβίρεται από το CDN μας: ένα .html/.js/.php
 * εκεί είναι σελίδα ή σενάριο «από εμάς» (phishing, payload ClickFix), ένα .exe/.ps1/.zip είναι αρχείο προς λήψη.
 *   Critical: σελίδες, σενάρια, εκτελέσιμα, .zip · SVG με script / on…= / javascript: / foreignObject.
 *   Warn: άλλοι άγνωστοι τύποι (ανά κατάληξη) · SVG > 1 MB που δεν ελέγχθηκε · μερική σάρωση (όριο 20.000 αντικειμένων).
 */

export const MAX_OBJECTS = 20_000;
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

export type Flagged = { path: string; kind: "warn" | "critical"; reason: string; group: string };
const n = (x: number) => x.toLocaleString("el-GR");

export function bunnyOutcome(input: { files: number; dirs: number; truncated: boolean; listIncomplete?: boolean; failedDirs?: string[]; svgTotal: number; svgChecked: number; svgFailed?: number; findings: Finding[]; flagged?: Flagged[] }): { status: Severity; summary: string; findings: Finding[] } {
  const findings: Finding[] = [];
  const flagged = input.flagged ?? [];
  for (const f of flagged.filter((x) => x.kind === "critical")) findings.push({ severity: "critical", title: "Επικίνδυνο αρχείο στο Bunny Storage", detail: `${f.path}: ${f.reason}. Δεν πρέπει να υπάρχει στο CDN — ελέγξτε ποιος το ανέβασε και πότε.`, evidence: f.path });
  const byExt = new Map<string, Flagged[]>();
  for (const f of flagged.filter((x) => x.kind === "warn")) { if (!byExt.has(f.group)) byExt.set(f.group, []); byExt.get(f.group)!.push(f); }
  for (const [ext, rows] of byExt) findings.push({ severity: "warn", title: "Αρχεία ασυνήθιστου τύπου στο Bunny Storage", detail: `${rows.length} αρχεία — ${ext} (${rows[0].reason}): ${rows.slice(0, 5).map((r) => r.path).join(", ")}${rows.length > 5 ? "…" : ""}.`, evidence: ext });
  findings.push(...input.findings);
  const failedDirs = input.failedDirs ?? [];
  const svgFailed = input.svgFailed ?? 0;
  const partial = input.truncated || !!input.listIncomplete || failedDirs.length > 0 || input.svgChecked < input.svgTotal;
  const P = "Μερική σάρωση του Bunny Storage";
  if (input.listIncomplete) findings.push({ severity: "warn", title: P, detail: "Τελείωσε ο χρόνος πριν ολοκληρωθεί η λίστα των φακέλων — όσοι δεν διαβάστηκαν δεν ελέγχθηκαν." });
  else if (input.truncated) findings.push({ severity: "warn", title: P, detail: `Η λίστα σταμάτησε στο όριο των ${n(MAX_OBJECTS)} αντικειμένων — τα υπόλοιπα δεν ελέγχθηκαν.` });
  if (failedDirs.length) findings.push({ severity: "warn", title: P, detail: `${failedDirs.length} φάκελοι δεν διαβάστηκαν (σφάλμα του Bunny) και δεν ελέγχθηκαν: ${failedDirs.slice(0, 5).map((d) => `/${d}`).join(", ")}${failedDirs.length > 5 ? "…" : ""}.` });
  if (input.svgChecked < input.svgTotal) {
    const timedOut = input.svgTotal - input.svgChecked - svgFailed;
    findings.push({ severity: "warn", title: P, detail: `Ελέγχθηκε το περιεχόμενο ${n(input.svgChecked)} από ${n(input.svgTotal)} SVG${svgFailed ? ` · ${n(svgFailed)} SVG δεν διαβάστηκαν (σφάλμα)` : ""}${timedOut > 0 ? ` · ${n(timedOut)} δεν πρόλαβαν (τελείωσε ο χρόνος)` : ""}.` });
  }
  const summary = `${partial ? "μερική σάρωση — " : ""}${n(input.files)} αρχεία σε ${n(input.dirs)} φακέλους${input.listIncomplete ? " (η λίστα δεν ολοκληρώθηκε)" : input.truncated ? ` (όριο ${n(MAX_OBJECTS)} αντικειμένων)` : ""}${failedDirs.length ? ` (${failedDirs.length} φάκελοι δεν διαβάστηκαν)` : ""} · περιεχόμενο ${n(input.svgChecked)}/${n(input.svgTotal)} SVG ελέγχθηκε για script`;
  return { status: worst(findings.map((f) => f.severity)), summary, findings };
}
