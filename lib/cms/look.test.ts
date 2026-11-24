import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, lookCount, lookFor, lookOf, lookRules, lookStyle, withLook } from "./look";

test("χωρίς ρυθμίσεις: τίποτα — η ζώνη αποδίδεται όπως ήταν", () => {
  assert.equal(lookStyle({}), null);
  assert.equal(lookRules({ bg: "red", bgImage: "javascript:alert(1)", mt: -5 }), null);
});

test("σκούρο φόντο → ανοιχτά κείμενα μόνα τους· ρητά χρώματα κερδίζουν", () => {
  const s = lookStyle({ bg: "#122a58", titleColor: "#f1c400", subColor: "#cccccc" })!;
  assert.equal(s.style.backgroundColor, "#122a58");
  assert.equal(s.style["--bs-ink"], "#ffffff");
  assert.equal(s.style["--bs-title"], "#f1c400");
  assert.equal(s.style["--bs-muted"], "#cccccc");
  assert.match(s.className, /eu-bs-title/);
  assert.equal(lookStyle({ bg: "#f3f5f9" })!.style["--bs-ink"], "#1a1a1a");
});

test("εικόνα: γέμισμα / όλο το πλάτος / πλακάκια· χωρίς χρώμα μπαίνει πέπλο· το μοτίβο μόνο χωρίς εικόνα", () => {
  const cover = lookStyle({ bgImage: "/img/a.jpg" })!.style;
  assert.equal(cover.backgroundSize, "cover");
  assert.match(cover.backgroundImage, /^linear-gradient.*url\("\/img\/a\.jpg"\)$/);
  const width = lookStyle({ bgImage: "https://cdn.example/a.jpg", bgFit: "width", bg: "#ffffff" })!.style;
  assert.deepEqual([width.backgroundSize, width.backgroundRepeat, width.backgroundImage], ["100% auto", "no-repeat", 'url("https://cdn.example/a.jpg")']);
  assert.equal(lookStyle({ bgImage: "/a.png", bgFit: "tile" })!.style.backgroundRepeat, "repeat");
  assert.match(lookStyle({ pattern: "dots" })!.style.backgroundImage, /radial-gradient/);
  assert.doesNotMatch(lookStyle({ pattern: "dots", bgImage: "/a.png" })!.style.backgroundImage, /radial-gradient/);
});

test("περιθώρια: ακολουθούν την οθόνη, με όριο 160px", () => {
  const s = lookStyle({ mt: 32, ml: 96, mr: 999 })!.style;
  assert.equal(s.marginTop, "clamp(1rem, 2.5vw, 2rem)");
  assert.equal(s.marginLeft, "min(6rem, 7.5vw)");
  assert.equal(s.marginRight, "min(10rem, 12.5vw)");
});

test("τρεις προβολές: tablet / κινητό κρατούν μόνο ό,τι αλλάζει· null = τίποτα σε αυτή τη συσκευή", () => {
  const l = { bg: "#122a58", bgImage: "/a.jpg", mt: 64, mobile: { bgImage: null, mt: 16, titleColor: "#f1c400" }, tablet: {} };
  assert.deepEqual(lookFor(l, "mobile"), { bg: "#122a58", mt: 16, titleColor: "#f1c400" });
  assert.deepEqual(lookFor(l, "tablet"), { bg: "#122a58", bgImage: "/a.jpg", mt: 64 });
  const r = lookRules(l)!;
  assert.equal(r.devices.length, 1);
  const m = r.devices[0];
  assert.match(m.media, /max-width:767/);
  // ρητό περιθώριο κινητού μπαίνει όπως είναι· ό,τι έφυγε γυρίζει στο αρχικό· ό,τι δεν άλλαξε δεν επαναλαμβάνεται
  assert.equal(m.style.marginTop, "1rem");
  assert.equal(m.style.backgroundImage, "initial");
  assert.equal(m.style["--bs-title"], "#f1c400");
  assert.equal("backgroundColor" in m.style, false);
  assert.match(r.className, /eu-bs-title/);
  // μόνο το κινητό έχει ρύθμιση: βάση κενή, ένας κανόνας συσκευής
  assert.deepEqual(lookRules({ mobile: { bg: "#f1c400" } })!.base, {});
});

test("αντίθεση: λευκό σε μπλε Euronics διαβάζεται, κίτρινο σε λευκό όχι", () => {
  assert.ok(contrast("#ffffff", "#122a58") >= 4.5);
  assert.ok(contrast("#f1c400", "#ffffff") < 3);
});

test("αντικατάσταση εμφάνισης: τα υπόλοιπα πεδία μένουν, παλιές ρυθμίσεις φεύγουν· μέτρημα ανά συσκευή", () => {
  const b = { id: "b1", type: "text", bg: "#122a58", mt: 8, mobile: { bg: "#ffffff" } };
  assert.deepEqual(withLook(b, { titleColor: "#f1c400" }), { id: "b1", type: "text", titleColor: "#f1c400" });
  assert.deepEqual(lookOf(b), { bg: "#122a58", mt: 8, mobile: { bg: "#ffffff" } });
  assert.equal(lookCount({ bg: "#122a58", mt: 8, mb: 8, ml: 4, mobile: { mt: null, mb: null, pattern: "dots" } }, "desktop"), 2);
  assert.equal(lookCount({ mobile: { mt: null, mb: null, pattern: "dots" } }, "mobile"), 2);
});
