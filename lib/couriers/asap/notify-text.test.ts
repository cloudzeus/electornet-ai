import { test } from "node:test";
import assert from "node:assert/strict";
import { etaPhrase, outForDeliverySms } from "./notify-text";
import { gsmLength } from "../../sms/gsm";

const now = new Date("2026-11-04T07:00:00Z"); // Τετ 4/11, 09:00 ώρα Ελλάδας

test("ώρα άφιξης σε ώρα Ελλάδας: σήμερα / αύριο / ημερομηνία", () => {
  assert.equal(etaPhrase(new Date("2026-11-04T12:30:00Z"), now), "σήμερα γύρω στις 14:30");
  assert.equal(etaPhrase(new Date("2026-11-05T08:00:00Z"), now), "αύριο γύρω στις 10:00");
  assert.match(etaPhrase(new Date("2026-11-06T08:00:00Z"), now)!, /6\/11 γύρω στις 10:00$/);
  // 23:30 UTC της 4/11 = 01:30 της 5/11 στην Ελλάδα → αύριο
  assert.equal(etaPhrase(new Date("2026-11-04T23:30:00Z"), now), "αύριο γύρω στις 01:30");
  assert.equal(etaPhrase(null, now), null);
});

test("SMS: GSM-7, αριθμός παραγγελίας, ώρα και σύνδεσμος ως έχει· χωράει σε 160 με λογικό σύνδεσμο", () => {
  const url = "https://track.lastmily.com/p/AbC123xyz";
  const s = outForDeliverySms("EUR-20261104-0417", new Date("2026-11-04T12:30:00Z"), url, now);
  assert.equal(s, `H ΠAPAΓΓEΛIA ΣAΣ EUR-20261104-0417 ΦTANEI ΣHMEPA ΓYPΩ ΣTIΣ 14:30. ΔEITE ΠOY EINAI O OΔHΓOΣ: ${url}`);
  assert.ok(gsmLength(s)! <= 160);
  // χωρίς ώρα
  assert.match(outForDeliverySms("EUR-1", null, url, now), /^H ΠAPAΓΓEΛIA ΣAΣ EUR-1 EINAI KAΘ' OΔON\. /);
});
