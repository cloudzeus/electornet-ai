import { test } from "node:test";
import assert from "node:assert/strict";
import { inForce, textKeyForTopic } from "./topics";

test("θέμα → κείμενο συναίνεσης", () => {
  assert.equal(textKeyForTopic("price-drop"), "offers");
  assert.equal(textKeyForTopic("cookies-marketing"), "cookies");
  assert.equal(textKeyForTopic("profiling"), null);
});

test("σε ισχύ = η πιο πρόσφατη ενεργή που έχει ήδη ξεκινήσει", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const v = (version: string, from: string, active = true) => ({ version, effectiveFrom: new Date(from), active });
  assert.equal(inForce([v("2026-09", "2026-09-13"), v("2026-11", "2026-11-20")], now)?.version, "2026-11");
  assert.equal(inForce([v("2026-09", "2026-09-13"), v("2026-12", "2026-12-01")], now)?.version, "2026-09", "η μελλοντική περιμένει");
  assert.equal(inForce([v("2026-09", "2026-09-13"), v("2026-11", "2026-11-20", false)], now)?.version, "2026-09", "η ανενεργή δεν μετράει");
  assert.equal(inForce([v("2026-12", "2026-12-01")], now), null);
});
