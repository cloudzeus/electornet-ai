import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLd } from "./json-ld";

test("jsonLd: κείμενο από τη βάση δεν κλείνει το <script> ούτε ανοίγει HTML", () => {
  const obj = { "@type": "Product", name: "TV </script><form action=//evil.com><input name=x>", description: "<!-- x --> & <script>alert(1)</script>" };
  const out = jsonLd(obj);
  assert.ok(!/<|>/.test(out), out);
  assert.ok(!out.includes("&"));
  assert.ok(!/<\/script/i.test(out));
  assert.deepEqual(JSON.parse(out), obj); // ίδιο περιεχόμενο για τις μηχανές αναζήτησης
});

test("jsonLd: U+2028 / U+2029 γίνονται escape (σπάνε το JS σε παλιούς parsers)", () => {
  const obj = { a: "γραμμή\u2028δεύτερη\u2029τρίτη" };
  const out = jsonLd(obj);
  assert.ok(!out.includes("\u2028") && !out.includes("\u2029"));
  assert.ok(out.includes("\\u2028") && out.includes("\\u2029"));
  assert.deepEqual(JSON.parse(out), obj);
});

test("jsonLd: ελληνικά και κανονικό περιεχόμενο μένουν αναγνώσιμα", () => {
  const obj = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ name: "Τηλεοράσεις", item: "https://www.euronics.gr/k/tileoraseis?a=1&b=2" }] };
  assert.deepEqual(JSON.parse(jsonLd(obj)), obj);
  assert.ok(jsonLd(obj).includes("Τηλεοράσεις"));
});
