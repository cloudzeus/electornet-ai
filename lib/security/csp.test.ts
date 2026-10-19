import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, appliesCsp } from "./csp";

const parse = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] as const; }));

test("CSP παραγωγής: scripts μόνο με nonce + strict-dynamic, χωρίς unsafe-inline / unsafe-eval / http:", () => {
  const p = parse(buildCsp({ nonce: "abc123", dev: false }));
  const script = p.get("script-src")!;
  assert.ok(script.includes("'nonce-abc123'"));
  assert.ok(script.includes("'strict-dynamic'"));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.ok(!script.includes("'unsafe-eval'"));
  // ούτε WebAssembly eval (τα μοντέλα AR είναι δικά μας GLB χωρίς draco/ktx2)
  assert.ok(!script.some((s) => s.includes("eval")));
  assert.deepEqual(p.get("default-src"), ["'self'"]);
  assert.deepEqual(p.get("object-src"), ["'none'"]);
  assert.deepEqual(p.get("base-uri"), ["'self'"]);
  assert.deepEqual(p.get("frame-ancestors"), ["'self'"]);
  assert.ok(p.has("upgrade-insecure-requests"));
  // καμία πηγή χωρίς κρυπτογράφηση
  for (const [, v] of p) assert.ok(!v.some((s) => s === "http:" || s.startsWith("http://")), v.join(" "));
});

test("CSP ανάπτυξης: unsafe-eval (React) και websocket του HMR, χωρίς upgrade-insecure-requests", () => {
  const p = parse(buildCsp({ nonce: "n", dev: true }));
  assert.ok(p.get("script-src")!.includes("'unsafe-eval'"));
  assert.ok(p.get("connect-src")!.includes("ws:"));
  assert.ok(!p.has("upgrade-insecure-requests"));
});

test("το CSP δεν τρέχει σε στατικά αρχεία, API και στην προβολή newsletter (έχει δικό της CSP)", () => {
  for (const path of ["/", "/proion/x", "/admin/catalog", "/k/klimatistika", "/newsletter"]) assert.ok(appliesCsp(path), path);
  for (const path of ["/api/cart", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/img/logo.png", "/newsletter/v/abc", "/ar/x.glb"]) assert.ok(!appliesCsp(path), path);
});
