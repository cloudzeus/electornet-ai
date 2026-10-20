import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAnalyticsIds } from "./analytics-ids";

test("cleanAnalyticsIds: κρατά έγκυρα IDs και το consentMode", () => {
  const ids = { ga4: "G-ABC123XYZ", gtm: "GTM-K7PQ9", googleAds: "AW-123456789", metaPixel: "123456789012345", tiktokPixel: "C1A2B3C4D5E6F7G8H9I0", clarity: "abcd1234ef", hotjar: "1234567", consentMode: true };
  assert.deepEqual(cleanAnalyticsIds(ids), ids);
  assert.deepEqual(cleanAnalyticsIds({ ga4: "  G-ABC123XYZ " }), { ga4: "G-ABC123XYZ" });
});

test("cleanAnalyticsIds: ID με χαρακτήρες που σπάνε το inline script πετιέται (δεν φορτώνει το pixel)", () => {
  const out = cleanAnalyticsIds({ gtm: "GTM-1');alert(document.cookie);('", clarity: "x\"+alert(1)+\"", hotjar: "1};alert(1);//", ga4: "G-1</script><script>alert(1)</script>", metaPixel: "", tiktokPixel: 42, consentMode: "yes" });
  assert.deepEqual(out, {});
});

test("cleanAnalyticsIds: αγνοεί άγνωστα πεδία και μη-αντικείμενα", () => {
  assert.deepEqual(cleanAnalyticsIds({ gsc: "abc", evil: "x" }), {});
  assert.deepEqual(cleanAnalyticsIds(null), {});
  assert.deepEqual(cleanAnalyticsIds("G-1"), {});
});
