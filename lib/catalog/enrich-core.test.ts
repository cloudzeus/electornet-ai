import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedHost, icecatImages, isProductImageUrl, pageImages, robotsAllows, specFingerprint, looksLikeImageFile } from "./enrich-core";

test("blockedHost: συγκριτικά και marketplaces ποτέ ως πηγή", () => {
  assert.equal(blockedHost("https://www.skroutz.gr/s/123/x.html"), true);
  assert.equal(blockedHost("https://bestprice.gr/item/1"), true);
  assert.equal(blockedHost("https://www.amazon.de/dp/B0"), true);
  assert.equal(blockedHost("https://www.inventor.gr/product/x"), false);
  assert.equal(blockedHost("https://www.kotsovolos.gr/x"), false);
  assert.equal(blockedHost("not a url"), true);
});

test("icecatImages: μεγάλη εικόνα πρώτα, χωρίς διπλά", () => {
  const g = [{ Pic: "https://images.icecat.biz/img/a.jpg", Pic500x500: "https://images.icecat.biz/img/a_500.jpg" }, { Pic500x500: "https://images.icecat.biz/img/b_500.jpg" }, { Pic: "https://images.icecat.biz/img/a.jpg" }];
  assert.deepEqual(icecatImages(g), ["https://images.icecat.biz/img/a.jpg", "https://images.icecat.biz/img/b_500.jpg"]);
  assert.deepEqual(icecatImages(undefined), []);
});

test("isProductImageUrl: όχι λογότυπα, svg, gif", () => {
  assert.equal(isProductImageUrl("https://x.gr/media/catalog/ac-12k.jpg"), true);
  assert.equal(isProductImageUrl("https://x.gr/static/logo.png"), false);
  assert.equal(isProductImageUrl("https://x.gr/a.svg"), false);
  assert.equal(isProductImageUrl("data:image/png;base64,AAAA"), false);
});

test("pageImages: JSON-LD Product (και @graph) πριν από og:image, απόλυτες διευθύνσεις", () => {
  const html = `<html><head>
    <meta property="og:image" content="/img/og.jpg?v=1&amp;w=800">
    <meta name="twitter:image" content="https://cdn.x.gr/logo.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":"https://x.gr/logo.png"},{"@type":"Product","name":"AC","image":["https://cdn.x.gr/p/1.jpg",{"@type":"ImageObject","url":"https://cdn.x.gr/p/2.webp"}]}]}</script>
    <script type="application/ld+json">{ broken</script>
  </head></html>`;
  assert.deepEqual(pageImages(html, "https://www.x.gr/klimatistika/ac.html"), ["https://cdn.x.gr/p/1.jpg", "https://cdn.x.gr/p/2.webp", "https://www.x.gr/img/og.jpg?v=1&w=800"]);
  assert.deepEqual(pageImages("<p>τίποτα</p>", "https://x.gr/"), []);
});

test("robotsAllows: μεγαλύτερο ταίριασμα, * και $, μόνο η ομάδα *", () => {
  const r = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /s/*/shops_list\nDisallow: /search\nAllow: /search/help$\nDisallow: /*?\n`;
  assert.equal(robotsAllows(r, "/s/123/shops_list"), false);
  assert.equal(robotsAllows(r, "/s/123/x.html"), true);
  assert.equal(robotsAllows(r, "/search?q=1"), false);
  assert.equal(robotsAllows(r, "/search/help"), true);
  assert.equal(robotsAllows(r, "/product.html?id=2"), false);
  assert.equal(robotsAllows("", "/anything"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "/x"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/x"), false);
});

test("specFingerprint και looksLikeImageFile", () => {
  assert.equal(specFingerprint(" Ψύξη ", "Απόδοση  BTU"), "ψύξη|απόδοση btu");
  assert.equal(looksLikeImageFile("https://x.gr/a.jpg"), true);
  assert.equal(looksLikeImageFile("https://x.gr/image/123"), true);
  assert.equal(looksLikeImageFile("https://x.gr/doc.pdf"), false);
});
