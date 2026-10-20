import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveInside } from "./local-path";

const base = path.resolve("/srv/app/public/uploads");

test("resolveInside: αρχεία μέσα στον φάκελο", () => {
  assert.equal(resolveInside(base, "a/b.webp"), path.join(base, "a/b.webp"));
  assert.equal(resolveInside(base, "/x.png"), path.join(base, "x.png"));
  assert.equal(resolveInside(base, "a/../b.png"), path.join(base, "b.png"));
});

test("resolveInside: έξοδος από τον φάκελο (traversal) → null", () => {
  for (const r of ["../../.env", "/../../.env", "a/../../x", "..", "", "/", ".", "a\0b", "../uploads-other/x"]) assert.equal(resolveInside(base, r), null, `πέρασε: ${JSON.stringify(r)}`);
});
