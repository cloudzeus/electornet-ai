import { test } from "node:test";
import assert from "node:assert/strict";
import { carrierOffers, pickCarrier, isAtticaZip, isThessalonikiZip, freeShippingZip, noPriceArea } from "./carriers";

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

test("δωρεάν από: μόνο Αττική και νομός Θεσσαλονίκης", () => {
  assert.equal(isThessalonikiZip("54622"), true);
  assert.equal(isThessalonikiZip("57001"), true);
  assert.equal(isThessalonikiZip("58100"), false); // Πέλλα
  // άγνωστος ή μισός Τ.Κ.: ισχύει, μέχρι να τον μάθουμε
  assert.equal(freeShippingZip(null), true);
  assert.equal(freeShippingZip("546"), true);
  assert.equal(freeShippingZip("11527"), true); // Αθήνα
  assert.equal(freeShippingZip("54622"), true); // Θεσσαλονίκη
  assert.equal(freeShippingZip("45221"), false); // Ιωάννινα
  assert.equal(freeShippingZip("18050"), false); // Σπέτσες: Τ.Κ. Αττικής, αλλά όχι Αττική για αποστολές
  const data = { acsOn: true, eltaOn: true, eltaFreeFrom: 30 };
  // καλάθι 120 € (πάνω και από το γενικό 100 € και από το δικό του 30 €)
  for (const zip of ["11527", "54622", null]) {
    const o = carrierOffers(data, 12000, zip, 10000);
    assert.equal(o.find((x) => x.id === "acs")!.fee, 0, `acs ${zip}`);
    assert.equal(o.find((x) => x.id === "elta")!.fee, 0, `elta ${zip}`);
  }
  const out = carrierOffers(data, 12000, "45221", 10000);
  assert.equal(out.find((x) => x.id === "acs")!.fee, 490);
  assert.equal(out.find((x) => x.id === "elta")!.fee, 390);
  assert.equal(out.find((x) => x.id === "acs")!.freeFrom, null);
});

test("ASAP μόνο στην Αττική — με άγνωστο ΤΚ διαθέσιμος", () => {
  assert.equal(isAtticaZip("17456"), true);
  assert.equal(isAtticaZip("54622"), false);
  // νησιά Σαρωνικού: Τ.Κ. Αττικής αλλά όχι Αττική για τις αποστολές (η Σαλαμίνα μένει Αττική)
  for (const z of ["18010", "18020", "18040", "18050"]) assert.equal(isAtticaZip(z), false, z);
  assert.equal(isAtticaZip("18900"), true);
  assert.equal(carrierOffers({ asapOn: true }, 0, "18010", null)[0].available, false);
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

test("περιοχές χωρίς τιμή αποστολής: εντοπίζονται από τον Τ.Κ. (παραγγελία κατόπιν συνεννόησης)", () => {
  assert.equal(noPriceArea("85111"), "Καστελόριζο");
  assert.equal(noPriceArea(" 84001 "), "Ίος");
  // νησιά με κατάστημα ή με συμφωνημένη τιμή δεν μπλοκάρονται
  assert.equal(noPriceArea("37002"), null); // Σκιάθος: έχει κατάστημα
  assert.equal(noPriceArea("85200"), null); // Κάλυμνος: έχει τιμή στον κατάλογο
  assert.equal(noPriceArea("54622"), null);
  assert.equal(noPriceArea(null), null);
});
