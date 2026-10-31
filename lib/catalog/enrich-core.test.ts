import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedHost, icecatImages, isProductImageUrl, pageImages, robotsAllows, specFingerprint, looksLikeImageFile, energyLabelLink, pageText, searchResultLink, isHomePage, seriesWords, sitemapLocs } from "./enrich-core";

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
    <meta property="og:image" content="/img/ac-front.jpg?v=1&amp;w=800">
    <meta name="twitter:image" content="https://cdn.x.gr/logo.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":"https://x.gr/logo.png"},{"@type":"Product","name":"AC","image":["https://cdn.x.gr/p/1.jpg",{"@type":"ImageObject","url":"https://cdn.x.gr/p/2.webp"}]}]}</script>
    <script type="application/ld+json">{ broken</script>
  </head></html>`;
  assert.deepEqual(pageImages(html, "https://www.x.gr/klimatistika/ac.html"), ["https://cdn.x.gr/p/1.jpg", "https://cdn.x.gr/p/2.webp", "https://www.x.gr/img/ac-front.jpg?v=1&w=800"]);
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

test("modelsFromSpecs / energyClassFromSpecs: μοντέλο σε γραφή EPREL και κλάση από «Κατηγορία ψύξης»", async () => {
  const { modelsFromSpecs, energyClassFromSpecs } = await import("./enrich-core");
  assert.deepEqual(modelsFromSpecs([{ key: "Μοντέλο", value: "HTN/HTG-717R32" }, { key: "Σειρά", value: "HIRO" }]), ["HTN-717R32/HTG-717R32", "HTN-717R32"]);
  assert.deepEqual(modelsFromSpecs([{ key: "Model", value: "WGG254ZHGR" }]), ["WGG254ZHGR"]);
  assert.deepEqual(energyClassFromSpecs([{ key: "SEER", value: "5.1" }, { key: "Κατηγορία θέρμανσης", value: "A+" }, { key: "Κατηγορία ψύξης", value: "A++" }]), { cls: "A++", scale: "A+++-D", key: "Κατηγορία ψύξης" });
  assert.deepEqual(energyClassFromSpecs([{ key: "Ενεργειακή κλάση", value: "Β" }]), { cls: "B", scale: "A-G", key: "Ενεργειακή κλάση" });
  assert.equal(energyClassFromSpecs([{ key: "Κατηγορία", value: "Πλυντήρια" }]), null);
});

test("pageImages: φωτογραφίες γκαλερί (<a href>) με το μοντέλο στο όνομα πρώτες", () => {
  const html = `<meta property="og:image" content="/up/hiro.png"><a href="/up/HTN_G-717R32.jpeg"><img src="/up/thumb.jpg"></a><a href="/up/logo.png">x</a><img src="/up/WiFi-1.png">`;
  assert.deepEqual(pageImages(html, "https://www.toyotomi.gr/p/", 12, ["HTN-717R32/HTG-717R32"]), ["https://www.toyotomi.gr/up/HTN_G-717R32.jpeg", "https://www.toyotomi.gr/up/hiro.png"]);
});

test("ενεργειακή ετικέτα: βρίσκεται από το κείμενο πριν από τον σύνδεσμο και δεν προτείνεται ως φωτογραφία", () => {
  const html = `<div><h2>Υποστήριξη</h2><p>Ενεργειακή Ετικέτα</p></div><div class="w"><a class="btn" href="/wp-content/uploads/2023/05/HTN_G-717R32.jpeg">εμφάνιση</a></div>
    <a href="/wp-content/uploads/2023/05/HTN-717R32-front.jpg"><img src="x.jpg"></a>`;
  assert.equal(energyLabelLink(html, "https://www.toyotomi.gr/p/"), "https://www.toyotomi.gr/wp-content/uploads/2023/05/HTN_G-717R32.jpeg");
  assert.deepEqual(pageImages(html, "https://www.toyotomi.gr/p/", 12, ["HTN/HTG-717R32"]), ["https://www.toyotomi.gr/wp-content/uploads/2023/05/HTN-717R32-front.jpg"]);
  assert.equal(energyLabelLink(`<a href="/a.jpg">x</a>`, "https://a.gr/"), null);
});

test("pageText: κελιά πίνακα σε γραμμές, χωρίς script / μενού", () => {
  const t = pageText(`<header>Μενού</header><table><tr><td>Ψύξη</td><td>15.700 Btu/h</td></tr></table><script>var x=1</script><p>SEER&nbsp;6,1</p>`);
  assert.equal(t, "Ψύξη\n15.700 Btu/h\nSEER 6,1");
});

test("αποτελέσματα αναζήτησης site: σύνδεσμος του ίδιου site με το μοντέλο στη διαδρομή", () => {
  const html = `<a href="https://www.toyotomi.gr/">αρχική</a><a href="https://www.toyotomi.gr/?s=717">ξανά</a><a href="https://other.gr/htn-717r32/">ξένο</a>
    <a href="/wp-content/uploads/HTN-717R32.pdf">pdf</a><a href="/oikiakos-klimatismos/htn-htg-717r32/">Hiro</a>`;
  assert.equal(searchResultLink(html, "https://www.toyotomi.gr/?s=717R32", ["HTN/HTG-717R32"]), "https://www.toyotomi.gr/oikiakos-klimatismos/htn-htg-717r32/");
  assert.equal(searchResultLink(html, "https://www.toyotomi.gr/?s=x", ["ABC"]), null);
  assert.equal(isHomePage("https://www.toyotomi.gr"), true);
  assert.equal(isHomePage("https://www.toyotomi.gr/oikiakos/x/"), false);
});

test("seriesWords / sitemapLocs", () => {
  assert.deepEqual(seriesWords("HTN-717R32 (R32) TOYOTOMI HIRO INV.IN DELTA DOMESTIC", "TOYOTOMI"), ["HIRO", "INVIN"]);
  assert.deepEqual(sitemapLocs(`<sitemapindex><sitemap><loc>https://a.gr/page-sitemap.xml</loc></sitemap></sitemapindex>`), { pages: [], sitemaps: ["https://a.gr/page-sitemap.xml"] });
  assert.deepEqual(sitemapLocs(`<urlset><url><loc><![CDATA[https://a.gr/x-717r32/]]></loc></url></urlset>`).pages, ["https://a.gr/x-717r32/"]);
});

test("isProductImageUrl: όχι εικόνες κοινοποίησης (ogp.jpg, og-image)", () => {
  assert.equal(isProductImageUrl("https://en.toyotomi.jp/en/wp-content/uploads/2022/08/ogp.jpg"), false);
  assert.equal(isProductImageUrl("https://a.gr/img/og-image.png"), false);
  assert.equal(isProductImageUrl("https://www.toyotomi.gr/wp-content/uploads/2023/05/hiro.png"), true);
  assert.equal(isProductImageUrl("https://a.gr/p/blogger-x.jpg"), true);
});
