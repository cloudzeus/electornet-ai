import { test } from "node:test";
import assert from "node:assert/strict";
import { loginBlocked, LOGIN_LIMITS } from "./throttle";

test("σύνδεση διαχείρισης: φραγή μετά από πολλές αποτυχίες ανά email ή ανά IP στο παράθυρο", () => {
  assert.equal(LOGIN_LIMITS.windowMin, 15);
  assert.equal(loginBlocked({ byEmail: 0, byIp: 0 }), false);
  assert.equal(loginBlocked({ byEmail: LOGIN_LIMITS.perEmail - 1, byIp: 0 }), false);
  assert.equal(loginBlocked({ byEmail: LOGIN_LIMITS.perEmail, byIp: 0 }), true);
  assert.equal(loginBlocked({ byEmail: 0, byIp: LOGIN_LIMITS.perIp }), true);
  assert.equal(loginBlocked({ byEmail: 0, byIp: LOGIN_LIMITS.perIp - 1 }), false);
});
