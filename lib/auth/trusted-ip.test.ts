import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedAdminIp, proxyPeerIp } from "./trusted-ip";

const LIST = "84.254.60.118";

test("σύνδεση χωρίς OTP: μόνο η τελευταία τιμή του x-forwarded-for (του proxy) μετρά", () => {
  assert.equal(proxyPeerIp("84.254.60.118"), "84.254.60.118");
  assert.equal(proxyPeerIp("1.2.3.4, ::ffff:84.254.60.118"), "84.254.60.118");
  assert.equal(isTrustedAdminIp("84.254.60.118", LIST), true);
  assert.equal(isTrustedAdminIp("9.9.9.9, 84.254.60.118", LIST), true);
  // ο επισκέπτης βάζει ψεύτικη IP μπροστά: ο proxy προσθέτει την πραγματική στο τέλος
  assert.equal(isTrustedAdminIp("84.254.60.118, 5.6.7.8", LIST), false);
  assert.equal(isTrustedAdminIp(null, LIST), false);
  assert.equal(isTrustedAdminIp("", LIST), false);
  // κενή λίστα = πάντα OTP
  assert.equal(isTrustedAdminIp("84.254.60.118", ""), false);
  assert.equal(isTrustedAdminIp("84.254.60.1", LIST), false);
  assert.equal(isTrustedAdminIp("10.0.0.1", " 84.254.60.118 , 10.0.0.1 "), true);
});
