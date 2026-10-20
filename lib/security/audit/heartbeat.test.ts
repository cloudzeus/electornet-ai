import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signHeartbeat, verifyHeartbeat, parseTs, shouldRecordPing, latestCompleteRun, bearerOk, HEARTBEAT_WINDOW_S } from "./heartbeat";

const secret = "s3cret-watch";
const now = 1_792_400_000;

test("signHeartbeat: hex HMAC-SHA256 του String(ts)", () => {
  assert.equal(signHeartbeat(secret, now), createHmac("sha256", secret).update(String(now)).digest("hex"));
  assert.match(signHeartbeat(secret, now), /^[0-9a-f]{64}$/);
});

test("verifyHeartbeat: σωστό → true (και στα όρια ±300″)", () => {
  assert.equal(verifyHeartbeat(secret, now, signHeartbeat(secret, now), now), true);
  assert.equal(verifyHeartbeat(secret, now - HEARTBEAT_WINDOW_S, signHeartbeat(secret, now - 300), now), true);
  assert.equal(verifyHeartbeat(secret, now + 300, signHeartbeat(secret, now + 300), now), true);
  assert.equal(verifyHeartbeat(secret, now, signHeartbeat(secret, now).toUpperCase(), now), true);
});

test("verifyHeartbeat: ts −301″ / +301″ → false", () => {
  assert.equal(verifyHeartbeat(secret, now - 301, signHeartbeat(secret, now - 301), now), false);
  assert.equal(verifyHeartbeat(secret, now + 301, signHeartbeat(secret, now + 301), now), false);
});

test("verifyHeartbeat: λάθος sig / άλλο μυστικό / κομμένο / μη hex / κενό μυστικό → false", () => {
  const good = signHeartbeat(secret, now);
  assert.equal(verifyHeartbeat(secret, now, good.replace(/^./, good[0] === "a" ? "b" : "a"), now), false);
  assert.equal(verifyHeartbeat(secret, now, signHeartbeat("other", now), now), false);
  assert.equal(verifyHeartbeat(secret, now, good.slice(0, 63), now), false);
  assert.equal(verifyHeartbeat(secret, now, `${good}00`, now), false);
  assert.equal(verifyHeartbeat(secret, now, "zz".repeat(32), now), false);
  assert.equal(verifyHeartbeat(secret, now, "", now), false);
  assert.equal(verifyHeartbeat("", now, createHmac("sha256", "").update(String(now)).digest("hex"), now), false);
  assert.equal(verifyHeartbeat(secret, now + 0.5, signHeartbeat(secret, now + 0.5), now), false);
  assert.equal(verifyHeartbeat(secret, Number.NaN, good, now), false);
});

test("parseTs: μόνο ακέραια δευτερόλεπτα", () => {
  assert.equal(parseTs(String(now)), now);
  for (const s of [null, "", "12.5", "-1", "1e9", " 1", "0x10", "9".repeat(16)]) assert.equal(parseTs(s), null, String(s));
});

test("shouldRecordPing: το πολύ μία εγγραφή ανά 10′", () => {
  const t = new Date("2026-10-20T10:00:00Z");
  assert.equal(shouldRecordPing(null, t), true);
  assert.equal(shouldRecordPing(new Date(t.getTime() - 9 * 60_000), t), false);
  assert.equal(shouldRecordPing(new Date(t.getTime() - 10 * 60_000), t), true);
  // ώρα στο μέλλον (ρολόι) → δεν μπλοκάρει για πάντα
  assert.equal(shouldRecordPing(new Date(t.getTime() + 3_600_000), t), true);
});

test("latestCompleteRun: το νεότερο report με όλους τους ελέγχους (και με error) — όχι τα χειροκίνητα ενός ελέγχου", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
  const c = (key: string, status = "ok") => ({ key, title: key, status, summary: "", findings: [], ms: 1 });
  const rows = [
    { id: "r3", startedAt: at(9), status: "ok", checks: [c("site")] },
    { id: "r2", startedAt: at(8), status: "error", checks: [c("site", "error"), c("staff")] },
    { id: "r1", startedAt: at(7), status: "ok", checks: [c("site"), c("staff")] },
  ];
  assert.deepEqual(latestCompleteRun(rows, ["site", "staff"]), { id: "r2", startedAt: at(8).toISOString(), status: "error" });
  assert.equal(latestCompleteRun(rows.slice(0, 1), ["site", "staff"]), null);
  assert.equal(latestCompleteRun([{ id: "x", startedAt: at(1), status: "ok", checks: "junk" }], ["site"]), null);
});

test("bearerOk: σταθερού χρόνου σύγκριση του Authorization· χωρίς μυστικό → πάντα false", () => {
  assert.equal(bearerOk("Bearer abc123", "abc123"), true);
  assert.equal(bearerOk("Bearer abc124", "abc123"), false);
  assert.equal(bearerOk("Bearer abc1234", "abc123"), false);
  assert.equal(bearerOk("abc123", "abc123"), false);
  assert.equal(bearerOk(null, "abc123"), false);
  assert.equal(bearerOk("Bearer ", ""), false);
  assert.equal(bearerOk("Bearer x", undefined), false);
});
