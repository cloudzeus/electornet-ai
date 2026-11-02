import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { checkNewEmail, maskEmail, rateLimiter, signEmailChange, validateProfile, verifyEmailChange } from "./profile-core";

const base = { firstName: " Μαρία ", lastName: "Παπά", phone: "694 412-3456", birthday: "1990-05-01" };

test("validateProfile: ιδιώτης — ΑΦΜ προαιρετικός, επαγγελματικά πεδία αγνοούνται", () => {
  const r = validateProfile({ ...base, type: "individual", company: "Κάτι", doy: "Α Αθηνών" });
  assert.ok(r.ok);
  assert.equal(r.data.firstName, "Μαρία");
  assert.equal(r.data.mobile, "6944123456");
  assert.equal(r.data.vatNumber, null);
  assert.equal(r.data.type, "individual");
  assert.equal(r.data.company, null);
  assert.equal(r.data.doy, null);
  assert.ok(validateProfile({ ...base, vat: "094019245" }).ok);
  assert.equal(validateProfile({ ...base, vat: "1234" }).ok, false);
});

test("validateProfile: επιχείρηση — ΑΦΜ 9 ψηφίων και επωνυμία υποχρεωτικά", () => {
  assert.equal(validateProfile({ ...base, type: "business", company: "ΑΒΓ ΑΕ" }).ok, false);
  assert.equal(validateProfile({ ...base, type: "business", vat: "094019245" }).ok, false);
  assert.equal(validateProfile({ ...base, type: "business", vat: "09401924", company: "ΑΒΓ ΑΕ" }).ok, false);
  const r = validateProfile({ ...base, type: "business", vat: " 094019245 ", company: "  ΑΒΓ   ΑΕ ", doy: "", profession: "Λιανικό εμπόριο" });
  assert.ok(r.ok);
  assert.deepEqual([r.data.type, r.data.vatNumber, r.data.company, r.data.doy, r.data.profession], ["business", "094019245", "ΑΒΓ ΑΕ", null, "Λιανικό εμπόριο"]);
});

test("validateProfile: υπάρχοντες έλεγχοι (όνομα, κινητό, γενέθλια)", () => {
  assert.equal(validateProfile({ ...base, firstName: " " }).ok, false);
  assert.equal(validateProfile({ ...base, phone: "12345" }).ok, false);
  assert.ok(validateProfile({ ...base, phone: "+306944123456" }).ok);
  assert.equal(validateProfile({ ...base, birthday: "2999-01-01" }).ok, false);
  assert.equal(validateProfile({ ...base, birthday: "1/5/1990" }).ok, false);
  const odd = validateProfile({ ...base, type: "admin" });
  assert.ok(odd.ok && odd.data.type === "individual");
});

test("checkNewEmail + maskEmail", () => {
  assert.equal(checkNewEmail("", "a@b.gr") !== null, true);
  assert.equal(checkNewEmail("not-an-email", "a@b.gr") !== null, true);
  assert.equal(checkNewEmail("a@b.gr", "A@B.gr ") !== null, true);
  assert.equal(checkNewEmail("new@b.gr", "a@b.gr"), null);
  assert.equal(checkNewEmail("new@b.gr", null), null);
  assert.equal(maskEmail("maria@example.gr"), "ma***@example.gr");
  assert.equal(maskEmail("nope"), "***");
});

test("token αλλαγής email: υπογραφή, aud, λήξη, λάθος κλειδί", async () => {
  const t = await signEmailChange({ sub: "c1", old: "a@b.gr", new: "n@b.gr" }, "s3cret");
  assert.deepEqual(await verifyEmailChange(t, "s3cret"), { sub: "c1", old: "a@b.gr", new: "n@b.gr" });
  assert.equal(await verifyEmailChange(t, "other"), null);
  assert.equal(await verifyEmailChange(t + "x", "s3cret"), null);
  assert.equal(await verifyEmailChange("", "s3cret"), null);
  // cookie συνεδρίας (χωρίς aud) δεν περνά ως token αλλαγής
  const session = await new SignJWT({ sub: "c1" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(new TextEncoder().encode("s3cret"));
  assert.equal(await verifyEmailChange(session, "s3cret"), null);
  const expired = await new SignJWT({ old: "a@b.gr", new: "n@b.gr" }).setProtectedHeader({ alg: "HS256" }).setSubject("c1").setAudience("email-change").setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode("s3cret"));
  assert.equal(await verifyEmailChange(expired, "s3cret"), null);
});

test("rateLimiter: 5 ανά ώρα ανά κλειδί", () => {
  const rl = rateLimiter(5, 3600000);
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rl.hit("c1", t0 + i), false);
  assert.equal(rl.hit("c1", t0 + 10), true);
  assert.equal(rl.hit("c2", t0 + 10), false);
  assert.equal(rl.hit("c1", t0 + 3600001 + 10), false);
});
