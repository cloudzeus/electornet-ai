import { test } from "node:test";
import assert from "node:assert/strict";
import { accountsForSave, bankFromIban, formatIban, ibanValid, normalizeIban, parseAccounts, usableAccounts, validateAccounts, bankNames, type BankAccount } from "./bank-accounts";

const NBG = "GR1601101250000000012300695";
const EUROBANK = "GR1402600000000000000012345";
const PIRAEUS = "GR9501700000000000000054321";
const ALPHA = "GR4301400000000000000099999";

test("normalizeIban: κενά, παύλες και πεζά δεν μετράνε", () => {
  assert.equal(normalizeIban(" gr16 0110-1250 0000 0001 2300 695 "), NBG);
});

test("ibanValid: πραγματικός έλεγχος mod-97, όχι μόνο μορφή", () => {
  assert.equal(ibanValid(NBG), true);
  assert.equal(ibanValid("GR16 0110 1250 0000 0001 2300 695"), true);
  assert.equal(ibanValid(EUROBANK), true);
  assert.equal(ibanValid("GR1601101250000000012300696"), false, "ένα ψηφίο λάθος");
  assert.equal(ibanValid("GR17011012500000000123006"), false, "ελληνικό IBAN με λάθος μήκος");
  assert.equal(ibanValid("DE89370400440532013000"), true, "και ξένο IBAN με σωστό check");
  assert.equal(ibanValid(""), false);
  assert.equal(ibanValid("GR16 ΑΒΓ"), false);
});

test("formatIban: ομάδες των 4", () => {
  assert.equal(formatIban("gr1601101250000000012300695"), "GR16 0110 1250 0000 0001 2300 695");
});

test("bankFromIban: η τράπεζα από τον κωδικό του ελληνικού IBAN", () => {
  assert.equal(bankFromIban(NBG), "Εθνική Τράπεζα");
  assert.equal(bankFromIban(EUROBANK), "Eurobank");
  assert.equal(bankFromIban(PIRAEUS), "Τράπεζα Πειραιώς");
  assert.equal(bankFromIban(ALPHA), "Alpha Bank");
  assert.equal(bankFromIban("GR6599900000000000000011111"), null, "άγνωστος κωδικός");
  assert.equal(bankFromIban("DE89370400440532013000"), null, "μόνο ελληνικά");
});

const acc = (o: Partial<BankAccount> = {}): BankAccount => ({ logo: "", bank: "Εθνική Τράπεζα", holder: "ΕΥΡΩΝΙΚΣ Α.Ε.", iban: NBG, ...o });

test("validateAccounts: λάθος IBAN, κενά πεδία και διπλό IBAN, με τη θέση της γραμμής", () => {
  assert.deepEqual(validateAccounts([acc()]), []);
  const errs = validateAccounts([acc(), acc({ iban: "GR1601101250000000012300696" }), acc({ holder: " ", bank: "", iban: EUROBANK }), acc({ iban: "gr16 0110 1250 0000 0001 2300 695" })]);
  assert.deepEqual(errs.map((e) => [e.index, e.field]), [[1, "iban"], [2, "bank"], [2, "holder"], [3, "iban"]]);
  assert.match(errs[0].message, /IBAN/);
  assert.match(errs[3].message, /ήδη/);
});

test("validateAccounts: λογότυπο μόνο https ή δική μας διαδρομή", () => {
  assert.deepEqual(validateAccounts([acc({ logo: "https://cdn.example.gr/nbg.svg" }), acc({ iban: EUROBANK, bank: "Eurobank", logo: "/media/eurobank.png" })]), []);
  const errs = validateAccounts([acc({ logo: "javascript:alert(1)" }), acc({ iban: EUROBANK, logo: "//evil.example/x.png" }), acc({ iban: PIRAEUS, logo: "http://x.gr/a.png" })]);
  assert.deepEqual(errs.map((e) => [e.index, e.field]), [[0, "logo"], [1, "logo"], [2, "logo"]]);
});

test("parseAccounts: από JSON της ρύθμισης, ανθεκτικό σε σκουπίδια, IBAN κανονικοποιημένο", () => {
  assert.deepEqual(parseAccounts(""), []);
  assert.deepEqual(parseAccounts("όχι json"), []);
  assert.deepEqual(parseAccounts(undefined), []);
  assert.deepEqual(parseAccounts(JSON.stringify({ a: 1 })), []);
  const r = parseAccounts(JSON.stringify([{ bank: " Eurobank ", holder: "Χ", iban: "gr14 0260 0000 0000 0000 0012 345", logo: 5 }, "x", null]));
  assert.deepEqual(r, [{ logo: "", bank: "Eurobank", holder: "Χ", iban: EUROBANK }]);
  // η αναλογία του λογοτύπου μένει μόνο όταν είναι λογικός αριθμός
  assert.deepEqual(parseAccounts([{ logo: "/a.svg", logoAspect: 3.2, bank: "Β", holder: "Χ", iban: NBG }, { logo: "/b.svg", logoAspect: "9", bank: "Β", holder: "Χ", iban: NBG }, { logo: "/c.svg", logoAspect: 500, bank: "Β", holder: "Χ", iban: NBG }]).map((a) => a.logoAspect), [3.2, undefined, undefined]);
});

test("usableAccounts: στο site μόνο πλήρεις και έγκυροι λογαριασμοί, χωρίς επικίνδυνο λογότυπο", () => {
  const raw = JSON.stringify([acc(), acc({ iban: "GR00" }), acc({ iban: EUROBANK, bank: "Eurobank", holder: "" }), acc({ iban: ALPHA, bank: "Alpha Bank", logo: "javascript:x" })]);
  const r = usableAccounts(raw);
  assert.deepEqual(r.map((a) => a.iban), [NBG, ALPHA]);
  assert.equal(r[1].logo, "", "το επικίνδυνο λογότυπο πέφτει, ο λογαριασμός μένει");
});

test("bankNames: οι τράπεζες για τον υπότιτλο του checkout, χωρίς διπλές", () => {
  assert.equal(bankNames([acc(), acc({ iban: EUROBANK, bank: "Eurobank" }), acc({ iban: "GR0000", bank: "Eurobank" })]), "Εθνική Τράπεζα · Eurobank");
  assert.equal(bankNames([]), "");
});

test("accountsForSave: κανονικοποιημένο JSON για αποθήκευση, κενό όταν δεν υπάρχει λογαριασμός, λάθη με αριθμό γραμμής", () => {
  assert.deepEqual(accountsForSave(""), { value: "", message: null });
  assert.deepEqual(accountsForSave("[]"), { value: "", message: null });
  const ok = accountsForSave(JSON.stringify([{ logo: "", bank: "Εθνική Τράπεζα", holder: "ΕΥΡΩΝΙΚΣ Α.Ε.", iban: "gr16 0110 1250 0000 0001 2300 695" }]));
  assert.equal(ok.message, null);
  assert.deepEqual(JSON.parse(ok.value), [{ logo: "", bank: "Εθνική Τράπεζα", holder: "ΕΥΡΩΝΙΚΣ Α.Ε.", iban: NBG }]);
  const bad = accountsForSave(JSON.stringify([acc(), acc({ iban: "GR1601101250000000012300696", holder: "" })]));
  assert.equal(bad.value, "");
  assert.match(bad.message!, /Λογαριασμός 2: .*δικαιούχο.*IBAN/);
});
