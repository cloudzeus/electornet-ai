import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, appliesCsp } from "./csp";

const parse = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] as const; }));

test("CSP παραγωγής: scripts μόνο με nonce + strict-dynamic, χωρίς unsafe-inline / eval / http:", () => {
  const p = parse(buildCsp({ nonce: "abc123", dev: false }));
  const script = p.get("script-src")!;
  assert.ok(script.includes("'nonce-abc123'"));
  assert.ok(script.includes("'strict-dynamic'"));
  assert.ok(!script.includes("'unsafe-inline'"));
  // ούτε WebAssembly eval: το OCR (tesseract) τρέχει σε δικό του worker από το δικό μας domain
  assert.ok(!script.some((s) => s.includes("eval")));
  assert.deepEqual(p.get("default-src"), ["'self'"]);
  assert.deepEqual(p.get("object-src"), ["'none'"]);
  assert.deepEqual(p.get("base-uri"), ["'self'"]);
  assert.deepEqual(p.get("frame-ancestors"), ["'self'"]);
  assert.ok(p.has("upgrade-insecure-requests"));
  // καμία πηγή χωρίς κρυπτογράφηση
  for (const [, v] of p) assert.ok(!v.some((s) => s === "http:" || s.startsWith("http://")), v.join(" "));
});

test("CSP παραγωγής: styles μόνο με nonce — κανένα 'unsafe-inline' (ούτε για style attributes)", () => {
  const csp = buildCsp({ nonce: "abc123", dev: false });
  const p = parse(csp);
  assert.ok(p.get("style-src")!.includes("'nonce-abc123'"));
  assert.ok(!csp.includes("'unsafe-inline'"), csp);
  assert.ok(!p.has("style-src-attr"));
});

test("CSP παραγωγής: καμία γενική πηγή «https:» εκτός από εικόνες και φόρμες πληρωμής", () => {
  const p = parse(buildCsp({ nonce: "n", dev: false }));
  for (const [k, v] of p) if (!["img-src", "form-action"].includes(k)) assert.ok(!v.includes("https:"), `${k}: ${v.join(" ")}`);
  assert.ok(p.get("frame-src")!.includes("https://www.youtube-nocookie.com"));
  assert.ok(p.get("media-src")!.includes("https://euronics.b-cdn.net"));
});

test("CSP ανάπτυξης: unsafe-eval (React), inline styles του dev και websocket του HMR", () => {
  const p = parse(buildCsp({ nonce: "n", dev: true }));
  assert.ok(p.get("script-src")!.includes("'unsafe-eval'"));
  assert.ok(p.get("style-src")!.includes("'unsafe-inline'"));
  assert.ok(p.get("connect-src")!.includes("ws:"));
  assert.ok(!p.has("upgrade-insecure-requests"));
});

test("το CSP δεν τρέχει σε στατικά αρχεία, API και στην προβολή newsletter (έχει δικό της CSP)", () => {
  for (const path of ["/", "/proion/x", "/admin/catalog", "/k/klimatistika", "/newsletter"]) assert.ok(appliesCsp(path), path);
  for (const path of ["/api/cart", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/img/logo.png", "/newsletter/v/abc", "/ar/x.glb", "/vendor/tesseract/worker.min.js"]) assert.ok(!appliesCsp(path), path);
});
