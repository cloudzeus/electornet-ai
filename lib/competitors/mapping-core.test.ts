import { test } from "node:test";
import assert from "node:assert/strict";
import { bestByName, commonRoot, knownPath, suggestPath } from "./mapping-core";

// Κομμάτι του πραγματικού categoriesSiteMap.xml (11/11/2026)
const KNOWN = [
  "household-appliances", "household-appliances/fridges", "household-appliances/fridges/fridges", "household-appliances/fridges/fridge-freezers",
  "household-appliances/fridges/freezers", "household-appliances/fridges/mini-bars", "household-appliances/built-in", "household-appliances/built-in/fridges",
  "household-appliances/built-in/hobs", "household-appliances/washing-machines", "household-appliances/washing-machines/washing-machines",
  "household-appliances/washing-machines/dish-washing-machines", "household-appliances/washing-machines/dryers", "household-appliances/washing-machines/washing-machines-dryers",
  "household-appliances/cookers", "household-appliances/cookers/hlektrikes-kouzines", "household-appliances/cookers/aksesouar-kouzinwn",
  "household-appliances/hoods", "household-appliances/hoods/aporrofhthres", "household-appliances/microwaves",
  "small-home-appliances/vacuum-cleaners", "small-home-appliances/vacuum-cleaners/washing-vacuum-cleaners", "small-home-appliances/vacuum-cleaners/skoupes-robot",
  "small-home-appliances/ironing/sidera", "household-appliances/fridges/side-by-side-fridges",
  "air-condition-heaters/air-condition", "air-condition-heaters/air-condition/klimatistika-multi",
  "mobile-phones-gps/mobile-phones", "mobile-phones-gps/mobile-phones/smartphones", "mobile-phones-gps/mobile-phones/kinita-tilefona",
  "mobile-phones-gps/mobile-phones/thikes-kiniton-tilefonon", "mobile-phones-gps/mobile-phones/fortistes-kiniton", "mobile-phones-gps/mobile-phones/prostasia-othonis-kinitwn",
  "mobile-phones-gps/kartes-mnimis-micro-sd/micro-sd", "computing/laptop-tablet-ipad/notebook-macbook-ultrabook", "computing/monitors",
  "ypiresies/services-paradosi-enkatastasi/enkatastasi-sindesi-gr/enkatastasi-sindesi-kouzines",
];

test("commonRoot: γονέας μίας διαδρομής, κοινός πρόγονος πολλών, τίποτα όταν δεν μοιράζονται", () => {
  assert.equal(commonRoot(["household-appliances/fridges/fridge-freezers"]), "household-appliances/fridges");
  assert.equal(commonRoot(["household-appliances/fridges/a", "household-appliances/washing/b"]), "household-appliances");
  assert.equal(commonRoot(["a/x", "b/y"]), null);
  assert.equal(commonRoot(["fridges"]), null);
  assert.equal(commonRoot([]), null);
});

test("knownPath: ίδια ή πρόγονος, όχι μισό κομμάτι", () => {
  assert.ok(knownPath("household-appliances/fridges", ["household-appliances/fridges/mini"]));
  assert.ok(!knownPath("household-appliances/fri", ["household-appliances/fridges/mini"]));
});

test("bestByName: ελληνικά ονόματα → αγγλικές/greeklish διαδρομές", () => {
  const b = (n: string, p: string | null) => bestByName(n, p, KNOWN);
  assert.equal(b("Ψυγειοκαταψύκτες", "Ψυγεία"), "household-appliances/fridges/fridge-freezers");
  assert.equal(b("Ψυγεία", "Εντοιχιζόμενα"), "household-appliances/built-in/fridges");
  assert.equal(b("Πλυντήρια Πιάτων", "Πλυντήρια, Στεγνωτήρια"), "household-appliances/washing-machines/dish-washing-machines");
  assert.equal(b("Πλυντήρια Ρούχων", "Πλυντήρια, Στεγνωτήρια"), "household-appliances/washing-machines");
  assert.equal(b("Στεγνωτήρια", "Πλυντήρια, Στεγνωτήρια"), "household-appliances/washing-machines/dryers");
  assert.equal(b("Όλες οι κουζίνες", "Κουζίνες"), "household-appliances/cookers"); // ούτε αξεσουάρ ούτε «υπηρεσίες»
  assert.equal(b("Όλοι οι απορροφητήρες", "Απορροφητήρες"), "household-appliances/hoods");
  assert.equal(b("Όλοι οι φούρνοι μικροκυμάτων", null), "household-appliances/microwaves"); // όχι micro-sd
  assert.equal(b("Σκούπες Ρομπότ", "Σκούπες"), "small-home-appliances/vacuum-cleaners/skoupes-robot");
  assert.equal(b("Σίδερα", null), "small-home-appliances/ironing/sidera"); // όχι side-by-side
  assert.equal(b("Κλιματιστικά Inverter", "Air Condition"), "air-condition-heaters/air-condition");
  assert.equal(b("Laptop – MacBook", null), "computing/laptop-tablet-ipad/notebook-macbook-ultrabook");
  assert.equal(b("Αναμεταδότης ραδιοφώνου", null), null);
});

test("bestByName: τα κινητά πάνε μόνο στα smartphones, τα αξεσουάρ μόνο σε αξεσουάρ", () => {
  const b = (n: string) => bestByName(n, "Κινητή Τηλεφωνία", KNOWN);
  assert.equal(b("Κινητά - Smartphones"), "mobile-phones-gps/mobile-phones/smartphones");
  assert.equal(b("Κινητά Τηλέφωνα"), "mobile-phones-gps/mobile-phones/smartphones");
  assert.equal(bestByName("Κινητή Τηλεφωνία", null, KNOWN), "mobile-phones-gps/mobile-phones/smartphones");
  assert.equal(b("Θήκες Κινητών"), "mobile-phones-gps/mobile-phones/thikes-kiniton-tilefonon");
  assert.equal(b("Προστασία Οθόνης Κινητών"), "mobile-phones-gps/mobile-phones/prostasia-othonis-kinitwn");
});

test("suggestPath: με επιβεβαιωμένες αδελφές ψάχνει κάτω από το κοινό ριζικό, αλλιώς το ίδιο το ριζικό", () => {
  const fridge = { id: "f", parentId: "P", grandId: "G", extPath: "household-appliances/fridges/fridge-freezers" };
  const cat = (id: string, name: string, parentId = "P") => ({ id, parentId, grandId: "G", name, parentName: "Ψυγεία" });
  assert.equal(suggestPath(cat("m", "Μικρά ψυγεία - Mini Bars"), [fridge], KNOWN), "household-appliances/fridges/mini-bars");
  assert.equal(suggestPath(cat("x", "Παγομηχανές"), [fridge], KNOWN), "household-appliances/fridges");
  assert.equal(suggestPath({ ...cat("k", "Όλες οι κουζίνες", "Q"), grandId: null, parentName: "Κουζίνες" }, [], KNOWN), "household-appliances/cookers");
  assert.equal(suggestPath({ ...cat("z", "Παγομηχανές", "Q"), grandId: null }, [], KNOWN), null);
});
