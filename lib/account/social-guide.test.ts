import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSocialGuide, guideToHtml, guideToMarkdown } from "./social-guide";

test("οδηγός για το domain του κλικ: redirect URIs ακριβώς όπως τα στέλνει η εφαρμογή", () => {
  const d = buildSocialGuide({ origin: "https://euronics.dgsoft.gr/", now: new Date("2026-10-10T10:00:00Z") });
  assert.equal(d.host, "euronics.dgsoft.gr");
  assert.equal(d.sections.length, 4);
  const urls = Object.fromEntries(d.urls.map((u) => [u.label, u.value]));
  assert.equal(urls["Redirect URI · Google"], "https://euronics.dgsoft.gr/api/account/oauth/google/callback");
  assert.equal(urls["Redirect URI · Apple"], "https://euronics.dgsoft.gr/api/account/oauth/apple/callback");
  assert.equal(urls["Οδηγίες διαγραφής δεδομένων"], "https://euronics.dgsoft.gr/diagrafi-dedomenon");
  const g = d.sections[0].steps.find((s) => s.title.startsWith("Branding"))!;
  assert.ok(g.values!.some((v) => v.label === "Authorized domain" && v.value === "dgsoft.gr"));
});

test("localhost: Google/Microsoft με localhost, Apple και νομικά από το live", () => {
  const d = buildSocialGuide({ origin: "http://localhost:3111", providers: ["google", "apple"], microsoftTenant: "consumers" });
  assert.equal(d.isLocal, true);
  assert.equal(d.sections.length, 2);
  const urls = Object.fromEntries(d.urls.map((u) => [u.label, u.value]));
  assert.equal(urls["Redirect URI · Google"], "http://localhost:3111/api/account/oauth/google/callback");
  assert.equal(urls["Redirect URI · Apple"], "https://euronics.dgsoft.gr/api/account/oauth/apple/callback");
  assert.equal(urls["Πολιτική απορρήτου"], "https://euronics.dgsoft.gr/aporrito");
  assert.ok(d.sections[1].before.some((b) => b.includes("ΔΕΝ δέχεται localhost")));
});

test("Microsoft: account types από τη ρύθμιση· Markdown και HTML χωρίς ενεσίμο κώδικα", () => {
  const d = buildSocialGuide({ origin: "https://www.euronics.gr", providers: ["microsoft"], microsoftTenant: "common" });
  assert.match(d.sections[0].steps[0].values![0].value, /any organizational directory and personal/);
  const md = guideToMarkdown(d);
  assert.match(md, /^# Οδηγός ρύθμισης σύνδεσης με Microsoft/);
  assert.match(md, /`https:\/\/www\.euronics\.gr\/api\/account\/oauth\/microsoft\/callback`/);
  const html = guideToHtml(buildSocialGuide({ origin: "https://x.gr/<script>" }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<html lang="el">/);
});
