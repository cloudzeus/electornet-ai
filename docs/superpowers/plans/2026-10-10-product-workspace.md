# Σελίδα προϊόντος ως χώρος εργασίας — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Η `/admin/catalog/[id]` γίνεται χώρος εργασίας: ετοιμότητα με ελλείψεις πάνω, 5 καρτέλες εργασιών, διαστάσεις/AR/EPREL μέσα στο προϊόν, κάρτα του site δεξιά.

**Architecture:** Καθαρή συνάρτηση `productReadiness` (tests) · η σελίδα αποδίδει μόνο την ενεργή καρτέλα (`?tab=`) με τα υπάρχοντα components · δύο νέα back-end κομμάτια: `matchProductEprel` και `arRowDataFor`.

**Tech Stack:** Next.js 16 server components + server actions, Prisma, node:test (`npm test`), Tailwind 4 (container queries, tokens `--fs-*`).

**Spec:** `docs/superpowers/specs/2026-10-10-product-workspace-design.md`

---

## Δομή αρχείων

| Αρχείο | Ευθύνη |
|---|---|
| `lib/catalog/readiness.ts` (νέο) | `productReadiness(input)` — έλεγχοι, μετρητής, κατάσταση καρτελών |
| `lib/catalog/readiness.test.ts` (νέο) | tests |
| `lib/catalog/eprel-match.ts` | + `matchProductEprel(productId)` |
| `lib/ar/admin-row.ts` (νέο) | `arRowDataFor(product, setting)` — η γραμμή AR για σελίδα AR και προϊόν |
| `app/admin/(shell)/ar/page.tsx` | χρησιμοποιεί `arRowDataFor` |
| `components/admin/catalog/ProductEditor.tsx` | + `only?: Section[]` |
| `components/admin/catalog/ProductWorkspace.tsx` (νέο) | κεφαλίδα ετοιμότητας + καρτέλες (server, links) |
| `components/admin/catalog/SiteCardPreview.tsx` (νέο) | `ProductCard` μέσα σε providers |
| `components/admin/catalog/EnergyLabelPanel.tsx` (νέο) | ενεργειακή ετικέτα + «Αναζήτηση στο EPREL» |
| `app/admin/(shell)/catalog/[id]/page.tsx` | αναδιάταξη σε καρτέλες |
| `app/admin/(shell)/catalog/actions.ts` | + `matchEprelAction(productId)` |

---

### Task 1: Ετοιμότητα (TDD)

- [ ] **Step 1: tests**

```ts file=lib/catalog/readiness.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { productReadiness, type ReadinessInput } from "./readiness";

const full: ReadinessInput = { photos: 5, mainLowRes: false, description: true, specs: 12, dims: { needed: true, present: true }, energy: { needed: true, present: true }, ar: { applies: true, on: true, reason: null }, price: 399 };

test("πλήρες προϊόν: όλα ΟΚ, όλες οι καρτέλες πράσινες", () => {
  const r = productReadiness(full);
  assert.equal(r.done, r.total); assert.equal(r.total, 9); assert.deepEqual(r.missing, []);
  assert.deepEqual(r.tabs, { media: "ok", content: "ok", dims: "ok", commerce: "ok", erp: "ok" });
});

test("μετρούν μόνο οι έλεγχοι που ισχύουν", () => {
  const r = productReadiness({ ...full, dims: { needed: false, present: false }, energy: { needed: false, present: false }, ar: { applies: false, on: false, reason: null } });
  assert.equal(r.total, 6); assert.equal(r.done, 6);
});

test("χωρίς φωτογραφία: απαραίτητο, και δεν ζητά επιπλέον «4+» ή μέγεθος", () => {
  const r = productReadiness({ ...full, photos: 0, mainLowRes: null });
  assert.deepEqual(r.missing.map((m) => m.id), ["photo"]);
  assert.equal(r.tabs.media, "bad");
});

test("λίγες και μικρές φωτογραφίες: προτεινόμενα (κίτρινο)", () => {
  const r = productReadiness({ ...full, photos: 2, mainLowRes: true });
  assert.deepEqual(r.missing.map((m) => [m.id, m.label]), [["photos4", "2 φωτογραφίες · προτείνονται 4+"], ["photoSize", "Μικρή κύρια φωτογραφία (κάτω από 600 px)"]]);
  assert.equal(r.tabs.media, "warn");
});

test("κείμενα, διαστάσεις, EPREL, AR, τιμή", () => {
  const r = productReadiness({ ...full, description: false, specs: 2, dims: { needed: true, present: false }, energy: { needed: true, present: false }, ar: { applies: true, on: false, reason: "λείπουν διαστάσεις" }, price: null });
  assert.deepEqual(r.missing.map((m) => m.label), ["Χωρίς περιγραφή", "Χωρίς διαστάσεις", "Χωρίς ενεργειακή ετικέτα EPREL", "Χωρίς τιμή", "Μόνο 2 χαρακτηριστικά", "AR ανενεργό: λείπουν διαστάσεις"]);
  assert.deepEqual(r.tabs, { media: "ok", content: "bad", dims: "bad", commerce: "bad", erp: "ok" });
  assert.equal(productReadiness({ ...full, specs: 0 }).missing[0].label, "Χωρίς χαρακτηριστικά");
});

test("τα απαραίτητα πρώτα στη λίστα ελλείψεων", () => {
  const r = productReadiness({ ...full, photos: 2, description: false });
  assert.deepEqual(r.missing.map((m) => m.level), ["required", "recommended"]);
});
```

- [ ] **Step 2:** `npx tsx --test lib/catalog/readiness.test.ts` → FAIL (λείπει το module).

- [ ] **Step 3: υλοποίηση**

```ts file=lib/catalog/readiness.ts
/**
 * Ετοιμότητα ενός προϊόντος για το site: ποιοι έλεγχοι ισχύουν, ποιοι λείπουν και σε ποια καρτέλα της σελίδας
 * προϊόντος διορθώνονται. Καθαρή συνάρτηση — τα δεδομένα τα μαζεύει η σελίδα.
 */
export type TabId = "media" | "content" | "dims" | "commerce" | "erp";
export type CheckLevel = "required" | "recommended";
export type TabState = "ok" | "warn" | "bad";

export interface ReadinessInput {
  /** ορατές φωτογραφίες */
  photos: number;
  /** η κύρια φωτογραφία είναι κάτω από 600 px· null = άγνωστο / χωρίς φωτογραφία */
  mainLowRes: boolean | null;
  description: boolean;
  specs: number;
  /** needed: κατηγορίες με AR ή «χωράει στον χώρο μου» */
  dims: { needed: boolean; present: boolean };
  /** needed: η κατηγορία έχει υποχρεωτική ενεργειακή ετικέτα */
  energy: { needed: boolean; present: boolean };
  /** applies: η κατηγορία υποστηρίζει AR */
  ar: { applies: boolean; on: boolean; reason: string | null };
  price: number | null;
}
export interface Check { id: string; tab: TabId; level: CheckLevel; ok: boolean; label: string }
export interface Readiness { checks: Check[]; done: number; total: number; missing: Check[]; tabs: Record<TabId, TabState> }

export function productReadiness(i: ReadinessInput): Readiness {
  const checks: Check[] = [];
  const add = (applies: boolean, c: Check) => { if (applies) checks.push(c); };
  add(true, { id: "photo", tab: "media", level: "required", ok: i.photos > 0, label: "Χωρίς φωτογραφία" });
  add(i.photos > 0, { id: "photos4", tab: "media", level: "recommended", ok: i.photos >= 4, label: `${i.photos} ${i.photos === 1 ? "φωτογραφία" : "φωτογραφίες"} · προτείνονται 4+` });
  add(i.photos > 0 && i.mainLowRes !== null, { id: "photoSize", tab: "media", level: "recommended", ok: i.mainLowRes === false, label: "Μικρή κύρια φωτογραφία (κάτω από 600 px)" });
  add(true, { id: "description", tab: "content", level: "required", ok: i.description, label: "Χωρίς περιγραφή" });
  add(true, { id: "specs", tab: "content", level: "recommended", ok: i.specs >= 5, label: i.specs === 0 ? "Χωρίς χαρακτηριστικά" : `Μόνο ${i.specs} χαρακτηριστικά` });
  add(i.dims.needed, { id: "dims", tab: "dims", level: "required", ok: i.dims.present, label: "Χωρίς διαστάσεις" });
  add(i.energy.needed, { id: "energy", tab: "dims", level: "required", ok: i.energy.present, label: "Χωρίς ενεργειακή ετικέτα EPREL" });
  add(i.ar.applies, { id: "ar", tab: "dims", level: "recommended", ok: i.ar.on, label: `AR ανενεργό${i.ar.reason ? `: ${i.ar.reason}` : ""}` });
  add(true, { id: "price", tab: "commerce", level: "required", ok: (i.price ?? 0) > 0, label: "Χωρίς τιμή" });

  const missing = checks.filter((c) => !c.ok).sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1));
  const tabs: Record<TabId, TabState> = { media: "ok", content: "ok", dims: "ok", commerce: "ok", erp: "ok" };
  for (const c of missing) if (tabs[c.tab] !== "bad") tabs[c.tab] = c.level === "required" ? "bad" : "warn";
  return { checks, done: checks.filter((c) => c.ok).length, total: checks.length, missing, tabs };
}
```

- [ ] **Step 4:** `npx tsx --test lib/catalog/readiness.test.ts` → PASS (6). **Commit.**

### Task 2: EPREL για ένα προϊόν
- [ ] Στο `lib/catalog/eprel-match.ts` πρόσθεσε `matchProductEprel(productId)`: φορτώνει προϊόν (id, sku, title, ean, categoryId, brand), τις ομάδες από `eprelGroupsFor(κατηγορία)`, το `imageModel` από `imageImport` (seq 1, key = ean/0ean/00ean), καλεί `findInEprel`, σε «matched» `storeEprelMatch` + `refreshDimStatus([id])`, ενημερώνει `eprelStatus/eprelCheckedAt/modelCode` — ίδια λογική με τον worker του `matchEprelBatch`. Επιστρέφει `{ status, model, candidates?, registrationNumber? }` ή σφάλμα κλειδιού.
- [ ] `matchEprelAction(productId)` στο `app/admin/(shell)/catalog/actions.ts` (δικαίωμα `catalog.products.write`, audit, `revalidatePath`).
- [ ] `tsc` · commit.

### Task 3: Γραμμή AR ως κοινή συνάρτηση
- [ ] Μετέφερε τη δημιουργία `ArRowData` από το `app/admin/(shell)/ar/page.tsx` σε `lib/ar/admin-row.ts` (`arRowDataFor(product, setting)`), η σελίδα AR την καλεί. Καμία αλλαγή συμπεριφοράς — έλεγχος `/admin/ar` ίδια εικόνα. Commit.

### Task 4: `ProductEditor` κατά ενότητες
- [ ] Prop `only?: ("basics" | "texts" | "specs" | "dims" | "warranty")[]` — αποδίδονται μόνο αυτές· η αποθήκευση στέλνει όλες τις τιμές όπως πριν. Commit.

### Task 5: Σελίδα σε καρτέλες
- [ ] `ProductWorkspace` (server): κεφαλίδα, μπάρα ετοιμότητας (chips → `?tab=`), λωρίδα καρτελών (links, `aria-current`, τελεία κατάστασης), διάταξη `@5xl:grid-cols-[minmax(0,1fr)_17rem]` με την κάρτα δεξιά.
- [ ] `SiteCardPreview` (client): `SettingsProvider` + `CartProvider` + `ProductCard`.
- [ ] `EnergyLabelPanel` (client): κλάση/ετικέτα/δελτίο ή «Δεν βρέθηκε», κουμπί «Αναζήτηση στο EPREL» → `matchEprelAction`, μήνυμα αποτελέσματος.
- [ ] `page.tsx`: υπολογίζει `ReadinessInput` (photos = ορατές, mainLowRes = πρώτη ορατή `lowRes`, description = longDesc/shortDesc ή summary, specs = `_count.specs`, dims = `dimsFor(shop)` + needed από AR/fit, energy = `hasEnergyLabel(κατηγορία)` + `shop.energy`, ar από `arPlan`, price) και αποδίδει την ενεργή καρτέλα με τα υπάρχοντα components.
- [ ] Browser: κάθε καρτέλα, chips → σωστή καρτέλα, desktop/tablet/κινητό χωρίς οριζόντια κύλιση. Commit.

### Task 6: Σύνδεσμοι από τις λίστες
- [ ] Στις σελίδες Διαστάσεις, EPREL, AR, Απόδελτίωση: ο σύνδεσμος προϊόντος ανοίγει `/admin/catalog/[id]?tab=dims|content`. Commit.

## Αυτοέλεγχος
§1 → Task 1, 5 · §2 → Tasks 4, 5 · §3 → Task 5 · §4 → Tasks 2, 3 · §5 → Task 6.
