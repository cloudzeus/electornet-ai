import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyObject, svgThreat, bunnyOutcome, objectPath, MAX_OBJECTS, SVG_MAX_BYTES } from "./bunny-core";

test("objectPath: διαδρομή μέσα στη ζώνη από το Path + ObjectName του Bunny", () => {
  assert.equal(objectPath("euronics", { Path: "/euronics/products/a/", ObjectName: "x.jpg" }), "products/a/x.jpg");
  assert.equal(objectPath("euronics", { Path: "/euronics/", ObjectName: "logo.svg" }), "logo.svg");
});

test("classifyObject: εκτελέσιμα / σελίδες / σενάρια / zip → critical (και με διπλή κατάληξη)", () => {
  for (const p of ["a/index.html", "x.htm", "lib/app.js", "shell.php", "setup.exe", "run.ps1", "pack.zip", "photo.jpg.php", "Upd.EXE", "x.hta", "y.bat", "z.vbs", "w.mjs"]) assert.equal(classifyObject(p, 100).kind, "critical", p);
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
  const svgs = bunnyOutcome({ files: 100, dirs: 1, truncated: false, svgTotal: 50, svgChecked: 20, findings: [] });
  assert.equal(svgs.status, "warn");
  assert.match(svgs.summary, /μερική σάρωση/);
  const slow = bunnyOutcome({ files: 100, dirs: 1, truncated: false, listIncomplete: true, svgTotal: 0, svgChecked: 0, findings: [] });
  assert.equal(slow.status, "warn");
  assert.match(slow.summary, /μερική σάρωση.*λίστα δεν ολοκληρώθηκε/);
});

test("bunnyOutcome: warn ανά κατάληξη συγκεντρώνονται σε ένα εύρημα ανά κατάληξη· critical μένουν ανά αρχείο", () => {
  const r = bunnyOutcome({ files: 10, dirs: 1, truncated: false, svgTotal: 0, svgChecked: 0, findings: [], flagged: [
    { path: "a.txt.bak", kind: "warn", reason: "x" }, { path: "b.txt.bak", kind: "warn", reason: "x" }, { path: "evil.php", kind: "critical", reason: "y" },
  ] });
  assert.deepEqual(r.findings.map((f) => [f.severity, f.evidence]), [["critical", "evil.php"], ["warn", ".bak"]]);
  assert.match(r.findings[1].detail, /2 αρχεία/);
  assert.equal(r.status, "critical");
});
