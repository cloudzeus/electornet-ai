import { test } from "node:test";
import assert from "node:assert/strict";
import { toCss, sxRule } from "./sx-core";

test("toCss: camelCase → kebab, αριθμοί σε px όπως το React, unitless χωρίς px, custom properties ως έχουν", () => {
  assert.equal(toCss({ width: 120, marginTop: 8 }), "width:120px;margin-top:8px");
  assert.equal(toCss({ opacity: 0.5, zIndex: 3, flexGrow: 1, lineHeight: 1.2, fontWeight: 700 }), "opacity:0.5;z-index:3;flex-grow:1;line-height:1.2;font-weight:700");
  assert.equal(toCss({ "--chars": 13, "--w": "40%" } as Record<string, string | number>), "--chars:13;--w:40%");
  assert.equal(toCss({ WebkitLineClamp: 2, msTransform: "none" }), "-webkit-line-clamp:2;-ms-transform:none");
  assert.equal(toCss({ width: undefined, height: null, top: 0 }), "top:0");
  assert.equal(toCss({ gridTemplateColumns: "repeat(2, 1fr)" }), "grid-template-columns:repeat(2, 1fr)");
});

test("toCss: δεν περνά κώδικας έξω από τη δήλωση (κλείσιμο κανόνα, σχόλια, </style>)", () => {
  const css = toCss({ color: "red;} body{display:none", background: "x</style><script>" });
  assert.ok(!css.includes("}") && !css.includes("<"), css);
});

test("sxRule: σταθερή κλάση ανά περιεχόμενο, ίδια για ίδιο style ανεξαρτήτως σειράς κλειδιών", () => {
  const a = sxRule({ width: 10, color: "red" }), b = sxRule({ color: "red", width: 10 }), c = sxRule({ width: 11 });
  assert.equal(a.className, b.className);
  assert.notEqual(a.className, c.className);
  assert.match(a.className, /^sx-[a-z0-9]+$/);
  assert.equal(a.css, `.${a.className}{color:red;width:10px}`);
  assert.equal(sxRule({}).className, "");
});

test("toCss: url(...) με data URI κρατά τα ; (base64) — αλλά όχι διαφυγή από το url", () => {
  assert.equal(toCss({ backgroundImage: 'url("data:image/png;base64,AAA=")' }), 'background-image:url("data:image/png;base64,AAA=")');
  const evil = toCss({ backgroundImage: 'url(x);} body{display:none' });
  assert.ok(!evil.includes("}") && !evil.includes(";b"), evil);
});
