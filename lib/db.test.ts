import { test } from "node:test";
import assert from "node:assert/strict";
import { viaPgBouncer } from "./db";

test("viaPgBouncer: θύρα 6432", () => {
  assert.ok(viaPgBouncer("postgresql://u:p@100.70.50.43:6432/euronics?schema=public"));
  assert.ok(viaPgBouncer("postgresql://u:p@127.0.0.1:6432/euronics"));
  assert.ok(!viaPgBouncer("postgresql://u:p@100.70.50.43:5432/euronics?schema=public"));
  assert.ok(!viaPgBouncer("postgresql://u:p@db:5432/x?note=6432"));
  assert.ok(!viaPgBouncer(undefined));
});
