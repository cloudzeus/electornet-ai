import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BANNER_DESIGN, bannerDesignIssue, normalizeBannerDesign } from "./banner-design";

test("έγκυρο σχέδιο μένει όπως είναι· ό,τι δεν είναι σχέδιο → null", () => {
  assert.deepEqual(normalizeBannerDesign(DEFAULT_BANNER_DESIGN), DEFAULT_BANNER_DESIGN);
  assert.equal(normalizeBannerDesign(null), null);
  assert.equal(normalizeBannerDesign("x"), null);
});

test("πετά επικίνδυνες διευθύνσεις, λάθος χρώματα, άγνωστη κίνηση και παραπανίσια προϊόντα", () => {
  const d = normalizeBannerDesign({ bg: { color: "red", image: "javascript:alert(1)", video: "//evil.example/v.mp4", anim: "explode" }, logo: "http://insecure/logo.png", accent: "#ABCDEF", title: "x".repeat(200), products: { source: "manual", ids: ["a", "a", "b", "c", "d", 5], max: 9, bullets: ["1", "", "2", "3", "4", "5", "6"] } })!;
  assert.deepEqual(d.bg, { color: DEFAULT_BANNER_DESIGN.bg.color, image: null, video: null, anim: "none" });
  assert.equal(d.logo, null);
  assert.equal(d.accent, "#abcdef");
  assert.equal(d.title.length, 80);
  assert.deepEqual(d.products.ids, ["a", "b", "c", "d"]);
  assert.equal(d.products.max, 4);
  assert.equal(d.layout, "strip");
  assert.equal(d.products.bullets.length, 5);
});

test("λέει τι λείπει πριν ενεργοποιηθεί", () => {
  const base = normalizeBannerDesign(DEFAULT_BANNER_DESIGN)!;
  assert.equal(bannerDesignIssue(base, null), null);
  assert.match(bannerDesignIssue({ ...base, title: "" }, null)!, /τίτλο/);
  assert.match(bannerDesignIssue({ ...base, products: { ...base.products, source: "promotion" } }, null)!, /προσφορά/);
  assert.match(bannerDesignIssue({ ...base, products: { ...base.products, source: "manual" } }, null)!, /προϊόν/);
  assert.match(bannerDesignIssue({ ...base, bg: { ...base.bg, anim: "zoom" } }, null)!, /zoom/);
  assert.match(bannerDesignIssue({ ...base, layout: "posts" }, null)!, /post/);
});
