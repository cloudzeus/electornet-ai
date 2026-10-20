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

const extOf = (p: string) => { const name = p.split("/").pop() ?? p; const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1).toLowerCase() : ""; };
const extsOf = (p: string) => (p.split("/").pop() ?? p).toLowerCase().split(".").slice(1);

export type ObjectClass = { kind: "ok" | "svg" | "warn" | "critical"; reason: string };

export function classifyObject(path: string, size: number): ObjectClass {
  const ext = extOf(path);
  const bad = extsOf(path).find((e) => CRITICAL_EXT.has(e));
  if (bad) return { kind: "critical", reason: `αρχείο .${bad} (σελίδα, σενάριο, εκτελέσιμο ή συμπιεσμένο) στο CDN` };
  if (ext === "svg") return size > SVG_MAX_BYTES ? { kind: "warn", reason: "SVG μεγαλύτερο από 1 MB — δεν ελέγχθηκε το περιεχόμενό του" } : { kind: "svg", reason: "" };
  if (OK_EXT.has(ext)) return { kind: "ok", reason: "" };
  return { kind: "warn", reason: ext ? `άγνωστος τύπος αρχείου .${ext}` : "αρχείο χωρίς κατάληξη" };
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

export type Flagged = { path: string; kind: "warn" | "critical"; reason: string };
const n = (x: number) => x.toLocaleString("el-GR");

export function bunnyOutcome(input: { files: number; dirs: number; truncated: boolean; listIncomplete?: boolean; svgTotal: number; svgChecked: number; findings: Finding[]; flagged?: Flagged[] }): { status: Severity; summary: string; findings: Finding[] } {
  const findings: Finding[] = [];
  const flagged = input.flagged ?? [];
  for (const f of flagged.filter((x) => x.kind === "critical")) findings.push({ severity: "critical", title: "Επικίνδυνο αρχείο στο Bunny Storage", detail: `${f.path}: ${f.reason}. Δεν πρέπει να υπάρχει στο CDN — ελέγξτε ποιος το ανέβασε και πότε.`, evidence: f.path });
  const byExt = new Map<string, Flagged[]>();
  for (const f of flagged.filter((x) => x.kind === "warn")) { const e = extOf(f.path); const k = e ? `.${e}` : "(χωρίς κατάληξη)"; if (!byExt.has(k)) byExt.set(k, []); byExt.get(k)!.push(f); }
  for (const [ext, rows] of byExt) findings.push({ severity: "warn", title: "Αρχεία ασυνήθιστου τύπου στο Bunny Storage", detail: `${rows.length} αρχεία ${ext} (${rows[0].reason}): ${rows.slice(0, 5).map((r) => r.path).join(", ")}${rows.length > 5 ? "…" : ""}.`, evidence: ext });
  findings.push(...input.findings);
  const partial = input.truncated || !!input.listIncomplete || input.svgChecked < input.svgTotal;
  if (input.listIncomplete) findings.push({ severity: "warn", title: "Μερική σάρωση του Bunny Storage", detail: "Τελείωσε ο χρόνος πριν ολοκληρωθεί η λίστα των φακέλων — όσοι δεν διαβάστηκαν δεν ελέγχθηκαν." });
  else if (input.truncated) findings.push({ severity: "warn", title: "Μερική σάρωση του Bunny Storage", detail: `Η λίστα σταμάτησε στο όριο των ${n(MAX_OBJECTS)} αντικειμένων — τα υπόλοιπα δεν ελέγχθηκαν.` });
  else if (input.svgChecked < input.svgTotal) findings.push({ severity: "warn", title: "Μερική σάρωση του Bunny Storage", detail: `Ελέγχθηκε το περιεχόμενο ${n(input.svgChecked)} από ${n(input.svgTotal)} SVG (τελείωσε ο χρόνος).` });
  const summary = `${partial ? "μερική σάρωση — " : ""}${n(input.files)} αρχεία σε ${n(input.dirs)} φακέλους${input.listIncomplete ? " (η λίστα δεν ολοκληρώθηκε)" : input.truncated ? ` (όριο ${n(MAX_OBJECTS)} αντικειμένων)` : ""} · περιεχόμενο ${n(input.svgChecked)}/${n(input.svgTotal)} SVG ελέγχθηκε για script`;
  return { status: worst(findings.map((f) => f.severity)), summary, findings };
}
