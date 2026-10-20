import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyObject, svgThreat, bunnyOutcome, objectPath, underBase, MAX_OBJECTS, SVG_MAX_BYTES, type Flagged } from "./bunny-core";
import { BUNNY_ALLOWED } from "../policy";

test("objectPath: διαδρομή μέσα στη ζώνη από το Path + ObjectName του Bunny", () => {
  assert.equal(objectPath("euronics", { Path: "/euronics/products/a/", ObjectName: "x.jpg" }), "products/a/x.jpg");
  assert.equal(objectPath("euronics", { Path: "/euronics/", ObjectName: "logo.svg" }), "logo.svg");
});

test("classifyObject: εκτελέσιμα / σελίδες / σενάρια / zip → critical — αποφασίζει η ΤΕΛΕΥΤΑΙΑ κατάληξη", () => {
  for (const p of ["a/index.html", "x.htm", "lib/app.js", "shell.php", "setup.exe", "run.ps1", "pack.zip", "photo.jpg.php", "Upd.EXE", "x.hta", "y.bat", "z.vbs", "w.mjs"]) assert.equal(classifyObject(p, 100).kind, "critical", p);
});

test("classifyObject (I-1): «επικίνδυνη» λέξη πριν από την τελευταία κατάληξη δεν είναι critical", () => {
  for (const p of ["manuals/LG-manual.pl.pdf", "img.samsung.com.webp", "x.sh.png", "brand/app.js.jpg"]) assert.equal(classifyObject(p, 100).kind, "ok", p);
  const dbl = classifyObject("uploads/invoice.php.jpg", 100);
  assert.equal(dbl.kind, "warn");
  assert.match(dbl.reason, /διπλή κατάληξη/);
  assert.equal(classifyObject("setup.exe.png", 100).kind, "warn");
});

test("classifyObject: εικόνες, βίντεο, 3D, PDF, γραμματοσειρές → ok· svg → έλεγχος περιεχομένου (ή warn αν > 1 MB)", () => {
  for (const p of ["a.jpg", "b.JPEG", "c.png", "d.webp", "e.avif", "f.gif", "g.mp4", "h.webm", "i.glb", "j.usdz", "k.pdf", "l.woff2", "m.ico"]) assert.equal(classifyObject(p, 100).kind, "ok", p);
  assert.equal(classifyObject("s.svg", 1000).kind, "svg");
  assert.equal(classifyObject("big.svg", SVG_MAX_BYTES + 1).kind, "warn");
});

test("classifyObject: άλλα αρχεία / συμπιεσμένα / χωρίς κατάληξη → warn", () => {
  for (const p of ["a.rar", "b.7z", "notes.txt.bak", "README", "x.docx"]) assert.equal(classifyObject(p, 10).kind, "warn", p);
});

test("svgThreat: script, on…=, javascript:, foreignObject → λόγος· καθαρό SVG → null", () => {
  assert.equal(svgThreat('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>'), null);
  assert.match(svgThreat("<svg><script>alert(1)</script></svg>")!, /script/);
  assert.match(svgThreat('<svg onload="fetch(1)"></svg>')!, /on…=/);
  assert.match(svgThreat('<svg><a xlink:href="javascript:alert(1)">x</a></svg>')!, /javascript:/);
  assert.match(svgThreat("<svg><foreignObject><div/></foreignObject></svg>")!, /foreignObject/);
  assert.equal(svgThreat('<svg><style>.on-sale{fill:red}</style><g data-online="1"/></svg>'), null);
});

test("bunnyOutcome: πλήρης σάρωση χωρίς ευρήματα → ok με πλήθη· όριο αντικειμένων ή μη ελεγμένα SVG → warn «μερική σάρωση»", () => {
  const full = bunnyOutcome({ files: 1200, dirs: 40, truncated: false, svgTotal: 30, svgChecked: 30, findings: [] });
  assert.equal(full.status, "ok");
  assert.match(full.summary, /1\.?200 αρχεία/);
  assert.match(full.summary, /30\/30 SVG/);
  const cut = bunnyOutcome({ files: MAX_OBJECTS, dirs: 10, truncated: true, svgTotal: 5, svgChecked: 5, findings: [] });
  assert.equal(cut.status, "warn");
  assert.match(cut.summary, /μερική σάρωση/);
  assert.equal(cut.complete, false);
  assert.equal(full.complete, true);
  const svgs = bunnyOutcome({ files: 100, dirs: 1, truncated: false, svgTotal: 50, svgChecked: 20, findings: [] });
  assert.equal(svgs.status, "warn");
  assert.match(svgs.summary, /μερική σάρωση/);
  const slow = bunnyOutcome({ files: 100, dirs: 1, truncated: false, listIncomplete: true, svgTotal: 0, svgChecked: 0, findings: [] });
  assert.equal(slow.status, "warn");
  assert.match(slow.summary, /μερική σάρωση.*λίστα δεν ολοκληρώθηκε/);
});

test("bunnyOutcome: warn ανά κατάληξη συγκεντρώνονται σε ένα εύρημα ανά κατάληξη· critical μένουν ανά αρχείο", () => {
  const r = bunnyOutcome({ files: 10, dirs: 1, truncated: false, svgTotal: 0, svgChecked: 0, findings: [], flagged: [
    { path: "a.txt.bak", kind: "warn", reason: "x", group: ".bak" }, { path: "b.txt.bak", kind: "warn", reason: "x", group: ".bak" }, { path: "evil.php", kind: "critical", reason: "y", group: ".php" },
  ] });
  assert.deepEqual(r.findings.map((f) => [f.severity, f.evidence]), [["critical", "evil.php"], ["warn", ".bak"]]);
  assert.match(r.findings[1].detail, /2 αρχεία/);
  assert.equal(r.status, "critical");
});

test("classifyObject: ομάδα για τη σύνοψη των warn (κατάληξη ή διπλή κατάληξη)", () => {
  assert.equal(classifyObject("a.rar", 1).group, ".rar");
  assert.equal(classifyObject("README", 1).group, "(χωρίς κατάληξη)");
  assert.equal(classifyObject("x.php.jpg", 1).group, "διπλή κατάληξη .php");
  assert.equal(classifyObject("big.svg", SVG_MAX_BYTES + 1).group, "SVG > 1 MB");
});

test("bunnyOutcome (M-2): φάκελοι / SVG που απέτυχαν να διαβαστούν → μερική σάρωση (warn), όχι error", () => {
  const r = bunnyOutcome({ files: 50, dirs: 5, truncated: false, failedDirs: ["a/b", "c"], svgTotal: 10, svgChecked: 8, svgFailed: 2, findings: [] });
  assert.equal(r.status, "warn");
  assert.match(r.summary, /μερική σάρωση/);
  assert.ok(r.findings.some((f) => /2 φάκελοι/.test(f.detail) && /a\/b/.test(f.detail)));
  assert.ok(r.findings.some((f) => /2 SVG.*σφάλμα/.test(f.detail)));
});

// ── F-3: μόνο τα νέα/αλλαγμένα του διαστήματος είναι κρίσιμα ──────────────────────────────────────────────────────────
const since = new Date("2026-10-19T04:00:00Z");
const before = new Date("2026-03-01T10:00:00Z"), inWin = new Date("2026-10-19T12:00:00Z");
const risky = (path: string, changedAt: Date | null): Flagged => ({ path, kind: "critical", reason: "αρχείο .js", group: ".js", changedAt });
const base = { files: 100, dirs: 3, truncated: false, svgTotal: 0, svgChecked: 0, findings: [], since };

test("bunnyOutcome (F-3): επικίνδυνο αρχείο που άλλαξε στο διάστημα → critical· παλαιότερο → ΕΝΑ warn με πλήθος + τα 10 πρώτα", () => {
  const old = Array.from({ length: 12 }, (_, i) => risky(`legacy/p${String(i).padStart(2, "0")}.html`, before));
  const r = bunnyOutcome({ ...base, flagged: [risky("media/new.js", inWin), ...old] });
  assert.deepEqual(r.findings.map((f) => [f.severity, f.evidence]), [["critical", "media/new.js"], ["warn", "bunny: παλαιότερα επικίνδυνα αρχεία"]]);
  const w = r.findings[1];
  assert.match(w.detail, /12 αρχεία/);
  assert.match(w.detail, /legacy\/p00\.html/);
  assert.match(w.detail, /legacy\/p09\.html/);
  assert.doesNotMatch(w.detail, /legacy\/p10\.html/);
  assert.match(w.detail, /BUNNY_ALLOWED/);
  assert.equal(r.status, "critical");
  // μόνο παλαιότερα → warn, όχι critical
  assert.equal(bunnyOutcome({ ...base, flagged: old }).status, "warn");
});

test("bunnyOutcome (F-3): χωρίς ημερομηνία αλλαγής → critical (δεν αποδεικνύεται ότι προϋπήρχε)", () => {
  assert.deepEqual(bunnyOutcome({ ...base, flagged: [risky("x.php", null)] }).findings.map((f) => f.severity), ["critical"]);
});

test("bunnyOutcome (F-3): BUNNY_ALLOWED (ακριβείς διαδρομές) σωπαίνει τα παλαιότερα — όχι αν το αρχείο άλλαξε στο διάστημα", () => {
  const r = bunnyOutcome({ ...base, allowed: ["/legacy/old.html"], flagged: [risky("legacy/old.html", before)] });
  assert.equal(r.status, "ok");
  assert.match(r.summary, /1 εγκεκριμέν/);
  const changed = bunnyOutcome({ ...base, allowed: ["legacy/old.html"], flagged: [risky("legacy/old.html", inWin)] });
  assert.deepEqual(changed.findings.map((f) => f.severity), ["critical"]);
  assert.deepEqual(BUNNY_ALLOWED, []);
});

test("bunnyOutcome (F-3): οποιοδήποτε αρχείο εκτός του φακέλου της εφαρμογής (basePath) που άλλαξε στο διάστημα → ΕΝΑ critical", () => {
  const r = bunnyOutcome({ ...base, outsideChanged: [{ path: "x/a.jpg", changedAt: inWin }, { path: "b.png", changedAt: inWin }] });
  assert.deepEqual(r.findings.map((f) => f.severity), ["critical"]);
  assert.match(r.findings[0].title, /εκτός του φακέλου της εφαρμογής/);
  assert.match(r.findings[0].detail, /2 αρχεία/);
  assert.equal(r.findings[0].evidence, "b.png, x/a.jpg");
});

test("underBase (F-3): διαδρομή μέσα στα basePath της εφαρμογής· χωρίς basePath → όλα «μέσα»", () => {
  assert.ok(underBase("media/a.jpg", ["/media"]));
  assert.ok(underBase("media/x/y.js", ["media/"]));
  assert.ok(!underBase("mediax/a.jpg", ["/media"]));
  assert.ok(!underBase("a.jpg", ["/media"]));
  assert.ok(underBase("anything.jpg", []));
  assert.ok(underBase("anything.jpg", [""]));
});
