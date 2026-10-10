import { test } from "node:test";
import assert from "node:assert/strict";
import { carrierOffers, pickCarrier, isAtticaZip } from "./carriers";

test("μόνο οι ενεργοί, με δικό τους κόστος ή το προεπιλεγμένο", () => {
  const o = carrierOffers({ eltaOn: true, eltaFee: 3.5, boxnowOn: true, boxnowPartnerId: "123", acsOn: false }, 5000, null, 10000);
  assert.deepEqual(o.map((x) => x.id), ["elta", "boxnow"]);
  assert.equal(o[0].fee, 350);
  assert.equal(o[1].fee, 290);
});

test("δωρεάν από: δικό του ή το γενικό", () => {
  const o = carrierOffers({ eltaOn: true, eltaFreeFrom: 30, acsOn: true }, 4000, null, 10000);
  assert.equal(o.find((x) => x.id === "elta")!.fee, 0);
  assert.equal(o.find((x) => x.id === "acs")!.fee, 490);
  assert.equal(carrierOffers({ acsOn: true }, 12000, null, 10000)[0].fee, 0);
});

test("ASAP μόνο στην Αττική — με άγνωστο ΤΚ διαθέσιμος", () => {
  assert.equal(isAtticaZip("17456"), true);
  assert.equal(isAtticaZip("54622"), false);
  assert.equal(carrierOffers({ asapOn: true }, 0, "54622", null)[0].available, false);
  assert.equal(carrierOffers({ asapOn: true }, 0, "11523", null)[0].available, true);
  assert.equal(carrierOffers({ asapOn: true }, 0, null, null)[0].available, true);
  assert.equal(carrierOffers({ asapOn: true, asapAtticaOnly: false }, 0, "54622", null)[0].available, true);
});

test("επιλογή: ο διαλεγμένος αν είναι διαθέσιμος, αλλιώς ο φθηνότερος για το σπίτι (όχι θυρίδα)", () => {
  const o = carrierOffers({ acsOn: true, eltaOn: true, asapOn: true, boxnowOn: true, boxnowPartnerId: "123" }, 0, "54622", null);
  assert.equal(pickCarrier(o, "acs")!.id, "acs");
  assert.equal(pickCarrier(o, "asap")!.id, "elta");
  assert.equal(pickCarrier(o, null)!.id, "elta");
  assert.equal(pickCarrier(o, "boxnow")!.id, "boxnow");
  assert.equal(pickCarrier(carrierOffers({ boxnowOn: true, boxnowPartnerId: "1" }, 0, null, null), null)!.id, "boxnow");
  assert.equal(pickCarrier([], "acs"), null);
});

test("BOX NOW μόνο με Partner ID", () => {
  assert.equal(carrierOffers({ boxnowOn: true }, 0, null, null).length, 0);
  assert.equal(carrierOffers({ boxnowOn: true, boxnowPartnerId: " 42 " }, 0, null, null).length, 1);
});
