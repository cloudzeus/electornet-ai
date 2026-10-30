import { test } from "node:test";
import assert from "node:assert/strict";
import { linkRows, mediaOff } from "./link-core";

test("linkRows: γραμμή που ταίριαξε με υπάρχον είδος κρατά το προϊόν και το MTRL", () => {
  const out = linkRows(
    [{ rowNo: 2, itemId: "it-1", productId: null, pendingItemId: null, mtrl: null }],
    new Map([[2, { mtrl: 5001 }]]),
    new Map([[5001, "p-1"]]),
    new Map(),
  );
  assert.deepEqual(out, [{ itemId: "it-1", data: { productId: "p-1", mtrl: 5001 } }]);
});

test("linkRows: είδος που δεν έχει ακόμη προβολή στον κατάλογο κρατά μόνο το MTRL", () => {
  const out = linkRows(
    [{ rowNo: 2, itemId: "it-1", productId: null, pendingItemId: null, mtrl: null }],
    new Map([[2, { mtrl: 5001 }]]),
    new Map(),
    new Map(),
  );
  assert.deepEqual(out, [{ itemId: "it-1", data: { mtrl: 5001 } }]);
});

test("linkRows: νέο είδος δένεται με την εγγραφή αναμονής, όχι με προϊόν", () => {
  const out = linkRows(
    [{ rowNo: 3, itemId: "it-2", productId: null, pendingItemId: null, mtrl: null }],
    new Map([[3, {}]]),
    new Map(),
    new Map([[3, "pi-9"]]),
  );
  assert.deepEqual(out, [{ itemId: "it-2", data: { pendingItemId: "pi-9" } }]);
});

test("linkRows: γραμμή χωρίς είδος και χωρίς αναμονή δεν γράφεται καθόλου", () => {
  assert.deepEqual(linkRows([{ rowNo: 4, itemId: "it-3", productId: null, pendingItemId: null, mtrl: null }], new Map([[4, {}]]), new Map(), new Map()), []);
});

test("linkRows: ό,τι είναι ήδη γραμμένο δεν ξαναγράφεται", () => {
  const rows = [{ rowNo: 2, itemId: "it-1", productId: "p-1", pendingItemId: null, mtrl: 5001 }];
  assert.deepEqual(linkRows(rows, new Map([[2, { mtrl: 5001 }]]), new Map([[5001, "p-1"]]), new Map()), []);
});

test("linkRows: προϊόν που βρέθηκε τώρα συμπληρώνει γραμμή που είχε μόνο αναμονή", () => {
  const rows = [{ rowNo: 2, itemId: "it-1", productId: null, pendingItemId: "pi-9", mtrl: null }];
  assert.deepEqual(linkRows(rows, new Map([[2, { mtrl: 7 }]]), new Map([[7, "p-7"]]), new Map([[2, "pi-9"]])), [
    { itemId: "it-1", data: { productId: "p-7", mtrl: 7 } },
  ]);
});

test("mediaOff: οι στήλες φωτογραφιών βγαίνουν από την αντιστοίχιση, όλες οι άλλες μένουν", () => {
  const cfg = {
    columns: { 0: { kind: "field", key: "code" }, 1: { kind: "media", type: "image" }, 2: { kind: "spec", label: "Χρώμα" }, 3: { kind: "media", type: "video" } },
    brandMap: { Terra: "b-1" },
    categoryMap: {},
  } as unknown as Parameters<typeof mediaOff>[0];
  const out = mediaOff(cfg);
  assert.deepEqual(Object.keys(out.columns), ["0", "2"]);
  assert.deepEqual(out.brandMap, { Terra: "b-1" });
  // Το αρχικό δεν πειράζεται — ο καλών μπορεί να το χρειάζεται ακέραιο.
  assert.equal(Object.keys(cfg.columns).length, 4);
});
