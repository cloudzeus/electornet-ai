import { test } from "node:test";
import assert from "node:assert/strict";
import { e164, envelope, recordXml, stateFromCheckpoint, tagBlocks, tagText, soapFault } from "./soap";

test("φάκελος SOAP: σειρά πεδίων του WSDL, escape, Record", () => {
  const x = envelope("CreateJob", [["sAuthKey", "K&1"], ["oVoucher", recordXml({ OrderId: "EUR-1", Name: "Μαρία <Π>", Address: "Μεσογείων 64", City: "Αθήνα", Telephone: "+306944123456", Zip: "11527", Pieces: 2, Weight: 12.5, CodAmount: 0, InsAmount: 0, ReceivedDate: new Date("2026-10-12T00:00:00Z") })], ["eType", "Voucher"]]);
  assert.match(x, /<CreateJob xmlns="http:\/\/voucher\.taxydromiki\.gr\/JobServicesV2\.asmx"><sAuthKey>K&amp;1<\/sAuthKey><oVoucher><OrderId>EUR-1<\/OrderId><Name>Μαρία &lt;Π&gt;<\/Name>/);
  assert.ok(x.indexOf("<City>") < x.indexOf("<Telephone>") && x.indexOf("<Zip>") < x.indexOf("<Pieces>") && x.indexOf("<InsAmount>") < x.indexOf("<ReceivedDate>"));
  assert.match(x, /<Weight>12\.50<\/Weight>/);
  assert.match(x, /<ReceivedDate>2026-10-12T00:00:00<\/ReceivedDate><\/oVoucher><eType>Voucher<\/eType>/);
  assert.doesNotMatch(x, /<Email>/);
  assert.match(envelope("GetVouchersPdf", [["voucherNumbers", ["1", "2"]]]), /<voucherNumbers><string>1<\/string><string>2<\/string><\/voucherNumbers>/);
});

test("ανάγνωση απάντησης και fault", () => {
  const r = `<soap:Envelope><soap:Body><CreateJobResponse xmlns="x"><CreateJobResult><Result>0</Result><JobId>77</JobId><Voucher>1234567890</Voucher><SubVouchers><Record><VoucherNo>111</VoucherNo></Record><Record><VoucherNo>222</VoucherNo></Record></SubVouchers></CreateJobResult></CreateJobResponse></soap:Body></soap:Envelope>`;
  assert.equal(tagText(r, "Result"), "0");
  assert.equal(tagText(r, "Voucher"), "1234567890");
  assert.deepEqual(tagBlocks(r, "Record").map((b) => tagText(b, "VoucherNo")), ["111", "222"]);
  assert.equal(soapFault(r), null);
  assert.equal(soapFault("<soap:Fault><faultcode>x</faultcode><faultstring>Server was unable</faultstring></soap:Fault>"), "Server was unable");
});

test("checkpoints → κατάσταση, τηλέφωνο E.164", () => {
  assert.equal(stateFromCheckpoint("C_W2"), "delivered");
  assert.equal(stateFromCheckpoint("C_A3"), "out-for-delivery");
  assert.equal(stateFromCheckpoint("C_EA_AS"), "attempted");
  assert.equal(stateFromCheckpoint("C_E1"), "returning");
  assert.equal(stateFromCheckpoint("C_H1"), "in-transit");
  assert.equal(e164("6944 123 456"), "+306944123456");
  assert.equal(e164("2104835143"), "2104835143");
});
