import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPhotoSource } from "./enrich-core";

test("νέα αναζήτηση φωτογραφιών: πάντα άλλη πηγή από την προηγούμενη, κυκλικά", () => {
  const all = () => true;
  assert.equal(nextPhotoSource(null, all), "icecat");
  assert.equal(nextPhotoSource("icecat", all), "web");
  assert.equal(nextPhotoSource("web", all), "channel3");
  assert.equal(nextPhotoSource("shop", all), "icecat");
  // χωρίς Channel3 περνά στην επόμενη
  assert.equal(nextPhotoSource("web", (s) => s !== "channel3"), "shop");
  // μόνο μία διαθέσιμη: αναγκαστικά η ίδια
  assert.equal(nextPhotoSource("web", (s) => s === "web"), "web");
});
