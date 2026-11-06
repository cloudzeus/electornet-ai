import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenForm } from "./spoken";

test("τηλέφωνα ανά δύο ψηφία", () => {
  assert.equal(spokenForm("Τηλέφωνο 2107709247."), "Τηλέφωνο είκοσι ένα, μηδέν εφτά, εβδομήντα, ενενήντα δύο, σαράντα εφτά.");
  assert.equal(spokenForm("στο +30 6938895915"), "στο εξήντα εννιά, τριάντα οχτώ, ογδόντα εννιά, πενήντα εννιά, δεκαπέντε");
  assert.equal(spokenForm("2410-123456"), "είκοσι τέσσερα, δέκα, δώδεκα, τριάντα τέσσερα, πενήντα έξι");
});
test("όχι τηλέφωνα: τιμές, έτη, Τ.Κ.", () => {
  assert.equal(spokenForm("1.899 €"), "χίλια οχτακόσια ενενήντα εννιά ευρώ");
  assert.match(spokenForm("2021-2024"), /δύο χιλιάδες είκοσι ένα έως/);
});
