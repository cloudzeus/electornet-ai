import { test } from "node:test";
import assert from "node:assert/strict";
import { calmTitle, restoreAcronyms, dropNoteRefs } from "./banner-doc";

const corpus = "Όλα τα πλυντήρια της AEG διαθέτουν τον κάδο ProTex για να φροντίζει τα ρούχα σας. Η προστασία των υφασμάτων.";

test("calmTitle: ΚΕΦΑΛΑΙΑ → κανονική γραφή με τους τόνους του κειμένου", () => {
  assert.equal(calmTitle("ΠΡΟΣΤΑΣΙΑ ΓΙΑ ΤΑ ΡΟΥΧΑ ΣΑΣ", corpus), "Προστασία για τα ρούχα σας");
  assert.equal(calmTitle("ΚΑΔΟΣ PROTEX", corpus), "ΚΑΔΟΣ PROTEX"); // «κάδος» δεν υπάρχει αυτούσιο → μένει ως έχει
  assert.equal(calmTitle("Ο ΚΑΔΟ PROTEX", corpus), "Ο κάδο ProTex");
});

test("calmTitle: αφήνει ό,τι δεν είναι κεφαλαία ή δεν βρίσκει", () => {
  assert.equal(calmTitle("Λειτουργίες", corpus), "Λειτουργίες");
  assert.equal(calmTitle("ΕΞΟΙΚΟΝΟΜΗΣΗ ΝΕΡΟΥ", corpus), "ΕΞΟΙΚΟΝΟΜΗΣΗ ΝΕΡΟΥ");
});

test("restoreAcronyms: τα λατινικά ακρωνύμια γυρίζουν όπως τα γράφει ο κατασκευαστής", () => {
  assert.equal(restoreAcronyms("80 dmpis"), "80 DMPIS");
  assert.equal(restoreAcronyms("Ήχος dts και 4K hdr στην tv"), "Ήχος DTS και 4K HDR στην TV");
  assert.equal(restoreAcronyms("Θόρυβος 42 db · wi fi"), "Θόρυβος 42 dB · Wi-Fi");
  assert.equal(restoreAcronyms("Δες στο eprel.ec.europa.eu"), "Δες στο eprel.ec.europa.eu");
  assert.equal(restoreAcronyms("Λειτουργία gaming με ProSense"), "Λειτουργία gaming με ProSense");
});

test("dropNoteRefs: δείκτες υποσημειώσεων χωρίς υποσημείωση φεύγουν, τα νούμερα του κειμένου μένουν", () => {
  assert.equal(dropNoteRefs("ομαλότητα της κίνησης στο επόμενο καρέ. ⁴"), "ομαλότητα της κίνησης στο επόμενο καρέ.");
  assert.equal(dropNoteRefs("μέσα από το κινητό σας. 13"), "μέσα από το κινητό σας.");
  assert.equal(dropNoteRefs("Δεν υποστηρίζονται τα ελληνικά. 3 Η βοήθεια"), "Δεν υποστηρίζονται τα ελληνικά. Η βοήθεια");
  assert.equal(dropNoteRefs("Απολαύστε έως 7 χρόνια αναβαθμίσεων 10"), "Απολαύστε έως 7 χρόνια αναβαθμίσεων");
  assert.equal(dropNoteRefs("Πλυντήριο σειράς 6"), "Πλυντήριο σειράς 6");
  assert.equal(dropNoteRefs("Bluetooth 5"), "Bluetooth 5");
  assert.equal(dropNoteRefs("που απλοποιούν την καθημερινότητά σας 16"), "που απλοποιούν την καθημερινότητά σας");
  assert.equal(dropNoteRefs("Ρυθμιζόμενο έως 16"), "Ρυθμιζόμενο έως 16");
  assert.equal(dropNoteRefs("Χωρητικότητα 9 kg και 1400 στροφές. 2 θύρες USB"), "Χωρητικότητα 9 kg και 1400 στροφές. 2 θύρες USB");
  assert.equal(dropNoteRefs("Επιφάνεια 20 m² με 4K HDR."), "Επιφάνεια 20 m² με 4K HDR.");
});
