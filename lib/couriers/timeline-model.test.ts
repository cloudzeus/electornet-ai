import { test } from "node:test";
import assert from "node:assert/strict";
import { stepsOf, trackUrl } from "./timeline-model";

const st = (s: string) => stepsOf(s).map((x) => x.state).join(",");
test("stepsOf: πορεία", () => {
  assert.equal(st("created"), "current,todo,todo,todo");
  assert.equal(st("in-transit"), "done,current,todo,todo");
  assert.equal(st("out-for-delivery"), "done,done,current,todo");
  assert.equal(st("delivered"), "done,done,done,done");
});
test("stepsOf: προβλήματα και επιστροφή", () => {
  assert.equal(st("attempted"), "done,done,problem,todo");
  assert.equal(st("returned"), "done,done,problem,problem");
  assert.equal(stepsOf("returning")[2].label, "Επιστροφή");
  assert.equal(stepsOf("on-hold")[2].label, "Σε σημείο παραλαβής");
  assert.equal(st("cancelled"), "todo,todo,todo,todo");
});
test("trackUrl", () => {
  assert.equal(trackUrl("elta", "AW1GR"), "https://www.elta-courier.gr/search?br=AW1GR");
  assert.equal(trackUrl("geniki", "123"), "https://www.taxydromiki.com/track/123");
});
