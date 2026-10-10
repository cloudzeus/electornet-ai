import { test } from "node:test";
import assert from "node:assert/strict";
import { gsmLength } from "../sms/gsm";
import { reminderSms } from "./sms-text";

test("SMS υπενθύμισης: GSM-7, έως 160 χαρακτήρες, ο σύνδεσμος ανέπαφος", () => {
  const link = "euronics.gr/eg/cmg2x9q0a000108l4abcd1234.Ab3_dE-9xYz1";
  const free = reminderSms("Samsung Πλυντήριο Ρούχων 9kg WW90T4040CE/LE Inverter", new Date("2026-11-20"), null, link);
  const paid = reminderSms("LG OLED evo C4 55\"", new Date("2026-11-20"), 49.9, link);
  for (const s of [free, paid]) {
    assert.ok((gsmLength(s) ?? 999) <= 160, `${gsmLength(s)}: ${s}`);
    assert.ok(s.includes(link));
  }
  assert.match(free, /ΔΩPEAN/);
  assert.match(paid, /49,9 EUR/);
});
