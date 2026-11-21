import { test } from "node:test";
import assert from "node:assert/strict";
import { carrierOffers, pickCarrier, isAtticaZip, noPriceArea, pricedArea, storeAreaZip } from "./carriers";

test("μόνο οι ενεργοί, με δικό τους κόστος ή το προεπιλεγμένο", () => {
  const o = carrierOffers({ eltaOn: true, eltaFee: 3.5, boxnowOn: true, boxnowPartnerId: "123", acsOn: false }, null);
  assert.deepEqual(o.map((x) => x.id), ["elta", "boxnow"]);
  assert.equal(o[0].fee, 350);
  assert.equal(o[1].fee, 290);
});

test("κανένα «δωρεάν από»: η αξία του καλαθιού δεν μηδενίζει τα μεταφορικά (Euronics 20/11/2026)", () => {
  // παλιές ρυθμίσεις με «δωρεάν από» αγνοούνται, σε κάθε Τ.Κ. και με κάθε καλάθι
  const data = { acsOn: true, eltaOn: true, eltaFreeFrom: 30, freeShippingFrom: 100 };
  for (const zip of ["11527", "54622", "45221", null]) {
    const o = carrierOffers(data, zip);
    assert.equal(o.find((x) => x.id === "acs")!.fee, 490, `acs ${zip}`);
    assert.equal(o.find((x) => x.id === "elta")!.fee, 390, `elta ${zip}`);
  }
});

test("ASAP μόνο στην Αττική — με άγνωστο ΤΚ διαθέσιμος", () => {
  assert.equal(isAtticaZip("17456"), true);
  assert.equal(isAtticaZip("54622"), false);
  // νησιά Σαρωνικού: Τ.Κ. Αττικής αλλά όχι Αττική για τις αποστολές (η Σαλαμίνα μένει Αττική)
  for (const z of ["18010", "18020", "18040", "18050"]) assert.equal(isAtticaZip(z), false, z);
  assert.equal(isAtticaZip("18900"), true);
  assert.equal(carrierOffers({ asapOn: true }, "18010")[0].available, false);
  assert.equal(carrierOffers({ asapOn: true }, "54622")[0].available, false);
  assert.equal(carrierOffers({ asapOn: true }, "11523")[0].available, true);
  assert.equal(carrierOffers({ asapOn: true }, null)[0].available, true);
  assert.equal(carrierOffers({ asapOn: true, asapAtticaOnly: false }, "54622")[0].available, true);
});

test("επιλογή: ο διαλεγμένος αν είναι διαθέσιμος, αλλιώς ο φθηνότερος για το σπίτι (όχι θυρίδα)", () => {
  const o = carrierOffers({ acsOn: true, eltaOn: true, asapOn: true, boxnowOn: true, boxnowPartnerId: "123" }, "54622");
  assert.equal(pickCarrier(o, "acs")!.id, "acs");
  assert.equal(pickCarrier(o, "asap")!.id, "elta");
  assert.equal(pickCarrier(o, null)!.id, "elta");
  assert.equal(pickCarrier(o, "boxnow")!.id, "boxnow");
  assert.equal(pickCarrier(carrierOffers({ boxnowOn: true, boxnowPartnerId: "1" }, null), null)!.id, "boxnow");
  assert.equal(pickCarrier([], "acs"), null);
});

test("BOX NOW μόνο με Partner ID", () => {
  assert.equal(carrierOffers({ boxnowOn: true }, null).length, 0);
  assert.equal(carrierOffers({ boxnowOn: true, boxnowPartnerId: " 42 " }, null).length, 1);
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

test("δωρεάν στις περιοχές με κατάστημα: ίδιος Τ.Κ. ή ίδια πόλη· στα νησιά μόνο ο ίδιος Τ.Κ.", () => {
  const stores = ["54453", "17124", "84003", "26221"]; // Θεσσαλονίκη, Ν. Σμύρνη, Σίφνος, Πάτρα
  assert.equal(storeAreaZip("54453", stores), true); // ίδιος Τ.Κ.
  assert.equal(storeAreaZip("54455", stores), true); // ίδια πόλη (546xx → 544xx όχι· 545xx ναι)
  assert.equal(storeAreaZip("54629", stores), false); // άλλο 3ψήφιο: δεν θεωρείται ίδια περιοχή
  assert.equal(storeAreaZip("17123", stores), true);
  assert.equal(storeAreaZip("84003", stores), true); // Σίφνος: ο ίδιος Τ.Κ.
  assert.equal(storeAreaZip("84001", stores), false); // Ίος: νησί, 840xx δεν μετρά ως ίδια περιοχή
  assert.equal(storeAreaZip("45221", stores), false);
  assert.equal(storeAreaZip(null, stores), false);
  assert.equal(storeAreaZip("546", stores), false);
});

test("ο συμφωνημένος τιμοκατάλογος χρεώνεται ακόμη κι όπου έχουμε κατάστημα", () => {
  assert.equal(pricedArea("63074"), "Χαλκιδική"); // έχουμε κατάστημα, αλλά ισχύει ο κατάλογος
  assert.equal(pricedArea("85200"), "Κάλυμνος");
  assert.equal(pricedArea("18020"), "Πόρος και Γαλατάς");
  assert.equal(pricedArea("45221"), "Ιωάννινα (όλος ο νομός)");
  assert.equal(pricedArea("72200"), "Ιεράπετρα και τα γύρω χωριά");
  assert.equal(pricedArea("11527"), null);
  assert.equal(pricedArea("54622"), null);
  assert.equal(pricedArea(null), null);
});
