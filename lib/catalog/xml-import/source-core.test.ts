import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_FORMATS, feedFormat, feedSourceLabel } from "./source-core";

test("feedFormat: η διεύθυνση λέει τι είδους feed είναι", () => {
  assert.equal(feedFormat("https://estia.gr/feed.xml"), "xml");
  assert.equal(feedFormat("keyvoto:acme/cat-7"), "keyvoto");
  assert.equal(feedFormat("KEYVOTO:acme"), "keyvoto");
  assert.equal(feedFormat(""), "xml");
});

test("feedSourceLabel: πώς το λέμε στον χρήστη", () => {
  assert.equal(feedSourceLabel("xml"), "XML feed");
  assert.equal(feedSourceLabel("keyvoto"), "Keyvoto PIM");
});

test("FEED_FORMATS: οι δύο πηγές, για τα φίλτρα της βάσης", () => {
  assert.deepEqual([...FEED_FORMATS], ["xml", "keyvoto"]);
});
