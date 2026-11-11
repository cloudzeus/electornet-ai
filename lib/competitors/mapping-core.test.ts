import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bestByName, commonRoot, knownPath, pathLabel, rootSegment, suggestPath } from "./mapping-core";

/** Ολόκληρο το πραγματικό categoriesSiteMap.xml (756 διαδρομές, 11/11/2026). */
const REAL = readFileSync(join(__dirname, "kotsovolos/categories.fixture.txt"), "utf8").split("\n").filter(Boolean);

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
  assert.equal(b("Πλυντήρια Ρούχων", "Πλυντήρια, Στεγνωτήρια"), "household-appliances/washing-machines/washing-machines");
  assert.equal(b("Στεγνωτήρια", "Πλυντήρια, Στεγνωτήρια"), "household-appliances/washing-machines/dryers");
  assert.equal(b("Όλες οι κουζίνες", "Κουζίνες"), "household-appliances/cookers/hlektrikes-kouzines"); // ούτε αξεσουάρ ούτε «υπηρεσίες»
  assert.equal(b("Όλοι οι απορροφητήρες", "Απορροφητήρες"), "household-appliances/hoods/aporrofhthres");
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

test("rootSegment: πίνακας για τις γνωστές ριζικές, αλλιώς η πλειοψηφία, πάντα υπαρκτή ενότητα", () => {
  assert.equal(rootSegment("Λευκές Συσκευές", [], REAL), "household-appliances");
  assert.equal(rootSegment("Εικόνα και Ήχος", [], REAL), "sound-vision");
  assert.equal(rootSegment("Τηλεφωνία", [], REAL), "mobile-phones-gps");
  assert.equal(rootSegment("Computing", [], REAL), "computing");
  assert.equal(rootSegment("Κλιματισμός & Θέρμανση", [], REAL), "air-condition-heaters");
  assert.equal(rootSegment("Gaming", [], REAL), "gaming-gadgets");
  assert.equal(rootSegment("Imaging", [], REAL), "imaging");
  assert.equal(rootSegment("Κάτι νέο", ["computing/a", "computing/b", "imaging/c"], REAL), "computing");
  assert.equal(rootSegment("Κάτι νέο", ["computing/a", "imaging/c"], REAL), null);
  assert.equal(rootSegment("Κάτι νέο", ["nope/a"], REAL), null);
});

test("suggestPath: Λευκές Συσκευές με μία επιβεβαιωμένη (ψυγειοκαταψύκτες) — όχι όλα «fridges»", () => {
  const fridge = { id: "f", parentId: "P", grandId: "G", extPath: "household-appliances/fridges/fridge-freezers" };
  const s = (name: string, parentName: string, rootName = "Λευκές Συσκευές") => suggestPath({ id: "x", parentId: "P", grandId: "G", name, parentName, rootName }, [fridge], REAL);
  const W: [string, string, string][] = [
    ["Όλοι οι απορροφητήρες", "Απορροφητήρες", "household-appliances/hoods/aporrofhthres"],
    ["Εστίες", "Εντοιχιζόμενα", "household-appliances/built-in/hobs"],
    ["Φούρνοι", "Εντοιχιζόμενα", "household-appliances/built-in/ovens"],
    ["Όλοι οι φούρνοι μικροκυμάτων", "Φούρνοι Μικροκυμάτων", "household-appliances/microwaves"],
    ["Πλυντήρια Πιάτων", "Πλυντήρια, Στεγνωτήρια", "household-appliances/washing-machines/dish-washing-machines"],
    ["Πλυντήρια Ρούχων", "Πλυντήρια, Στεγνωτήρια", "household-appliances/washing-machines/washing-machines"],
    ["Πλυντήρια-Στεγνωτήρια", "Πλυντήρια, Στεγνωτήρια", "household-appliances/washing-machines/washing-machines-dryers"],
    ["Στεγνωτήρια", "Πλυντήρια, Στεγνωτήρια", "household-appliances/washing-machines/dryers"],
    ["Όλες οι κουζίνες", "Κουζίνες", "household-appliances/cookers/hlektrikes-kouzines"],
    ["Συντηρητές Κρασιών", "Ψυγεία", "household-appliances/fridges/wine-conservation"],
    ["Ψυγεία", "Ψυγεία", "household-appliances/fridges/fridges"],
    ["Ψυγεία Βιτρίνες", "Ψυγεία", "household-appliances/epaggelmatikes-lefkes-syskeves/epaggelmetika-psygeia-vitrines"],
    ["Set Εντοιχισμού", "Εντοιχιζόμενα", "household-appliances/built-in/built-in-bundles"],
    ["Καταψύκτες", "Ψυγεία", "household-appliances/fridges/freezers"],
  ];
  for (const [n, p, want] of W) assert.equal(s(n, p), want, n);
  // ασαφές φύλλο → ο γονέας δεύτερου επιπέδου (η εργασία ψάχνει με πρόθεμα, καλύπτει όλες τις υποκατηγορίες)
  assert.equal(s("Παγομηχανές", "Ψυγεία"), "household-appliances/fridges");
  // επαγγελματικά μόνο όταν το λέει το όνομα
  assert.ok(!s("Ψυγεία", "Ψυγεία")!.includes("epaggelm"));
});

test("suggestPath: άλλες ριζικές — headsets, hubs, τηλεοράσεις, κινητά", () => {
  const s = (name: string, parentName: string, rootName: string) => suggestPath({ id: "x", parentId: "P", grandId: "G", name, parentName, rootName }, [], REAL);
  const h = s("Ακουστικά – Headsets", "Περιφερειακά PC", "Computing");
  assert.ok(h && !h.includes("vr-headset") && !h.startsWith("gaming"), h ?? "null");
  assert.equal(s("Καλώδια – Hubs", "Περιφερειακά PC", "Computing"), "computing/peripherals/usb-hubs-and-cables");
  assert.equal(s("Τηλεοράσεις", "Τηλεοράσεις & Αξεσουάρ", "Εικόνα και Ήχος"), "sound-vision/televisions");
  assert.equal(s("Κινητά - Smartphones", "Κινητή Τηλεφωνία", "Τηλεφωνία"), "mobile-phones-gps/mobile-phones/smartphones");
  assert.equal(s("Θήκες Κινητών", "Κινητή Τηλεφωνία", "Τηλεφωνία"), "mobile-phones-gps/mobile-phones/thikes-kiniton-tilefonon");
  // τίποτα δεν ταιριάζει, ούτε ο γονέας: η ίδια η ενότητα
  assert.equal(s("Ξξξξξ", "Ψψψψψ", "Λευκές Συσκευές"), "household-appliances");
  // χωρίς ριζική και χωρίς ταίριασμα: τίποτα
  assert.equal(suggestPath({ id: "z", parentId: "Q", grandId: null, name: "Ξξξξξ", parentName: null }, [], REAL), null);
});

test("pathLabel: ελληνικές ετικέτες, αλλιώς το slug ευανάγνωστο", () => {
  assert.equal(pathLabel("household-appliances/washing-machines/dryers"), "Λευκές συσκευές › Πλυντήρια › Στεγνωτήρια");
  assert.equal(pathLabel("computing/foo-bar"), "Υπολογιστές › Foo bar");
});
