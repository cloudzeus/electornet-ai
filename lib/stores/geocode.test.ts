import { test } from "node:test";
import assert from "node:assert/strict";
import { zipExists } from "./geocode";

test("zipExists: υπαρκτός, ανύπαρκτος, σφάλμα δικτύου", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls++;
    if (String(url).includes("postalcode=13231")) return new Response(JSON.stringify([{ lat: "38.04", lon: "23.68" }]));
    if (String(url).includes("postalcode=13299")) return new Response("[]");
    throw new Error("network");
  }) as typeof fetch;
  try {
    assert.equal(await zipExists("13231"), true);
    assert.equal(await zipExists("132 99"), false);
    assert.equal(await zipExists("13299"), false); // από τη μνήμη
    assert.equal(calls, 2);
    assert.equal(await zipExists("54622"), undefined); // δίκτυο: όχι «λάθος Τ.Κ.»
    assert.equal(await zipExists("54622"), undefined);
    assert.equal(calls, 4); // το σφάλμα δεν κρατιέται
  } finally { globalThis.fetch = real; }
});
