import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestSetLabel } from "./set-labels";

const AC = "Κλιματιστικό 09HRFN8/09HFN8 BreezeleSS+ Inverter Midea";

test("κλιματιστικά: εσωτερική / εξωτερική από τον κωδικό του ERP", () => {
  assert.equal(suggestSetLabel("MSFAAU-09HRFN8-I R32 BREEZELES F.G.EUROPE", AC), "Εσωτερική μονάδα MSFAAU-09HRFN8-I");
  assert.equal(suggestSetLabel("MOB01-09HFN8-O R32 BREEZELESS F.G.EUROPE", AC), "Εξωτερική μονάδα MOB01-09HFN8-O");
  assert.equal(suggestSetLabel("TRN-828ZR (R32) TOYOTOMI IZURU INV.IN DELTA", "Κλιματιστικό TRN/TRG-828ZR DC Inverter TOYOTOMI"), "Εσωτερική μονάδα TRN-828ZR");
  assert.equal(suggestSetLabel("TRG-828ZR (R32) TOYOTOMI IZURU INV.OUT DELTA", "Κλιματιστικό TRN/TRG-828ZR DC Inverter TOYOTOMI"), "Εξωτερική μονάδα TRG-828ZR");
});

test("κωδικοί κατασκευαστών και θέση στο set", () => {
  assert.equal(suggestSetLabel("ASYG12KPCA AIR CONDITIONING F.G EUROPE", "Κλιματιστικό ASYG12KPCA/AOYG12KPCA Fujitsu"), "Εσωτερική μονάδα ASYG12KPCA");
  assert.equal(suggestSetLabel("AOYG12KPCA AIR CONDITIONING F.G EUROPE", "Κλιματιστικό ASYG12KPCA/AOYG12KPCA Fujitsu"), "Εξωτερική μονάδα AOYG12KPCA");
  assert.equal(suggestSetLabel("XYZ123 UNIT", AC, { isMain: true, members: 2 }), "Εσωτερική μονάδα XYZ123");
  assert.equal(suggestSetLabel("XYZ124 UNIT", AC, { isMain: false, members: 2 }), "Εξωτερική μονάδα XYZ124");
  assert.equal(suggestSetLabel("XYZ124 UNIT", AC, { isMain: false, members: 3 }), null);
});

test("χωρίς πρόταση εκτός κλιματιστικών ή όταν δεν αναγνωρίζεται", () => {
  assert.equal(suggestSetLabel("S40Q.CEUSLLK Soundbar_OS LG", "50QNED826RE + LG Sound Bar S40Q"), null);
  assert.equal(suggestSetLabel("ΣΩΛΗΝΩΣΗ ΧΑΛΚΟΥ 3m", AC), null);
});
