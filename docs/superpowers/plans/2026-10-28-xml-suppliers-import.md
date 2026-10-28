# XML προμηθευτές — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Οδηγός 4 βημάτων που διαβάζει το XML feed ενός προμηθευτή του SoftOne, προτείνει με AI την αντιστοίχιση πεδίων/κατηγοριών/χαρακτηριστικών (με μετατροπές μονάδων), φορτώνει τα προϊόντα σε λίστα ελέγχου με φίλτρα και σελίδες, επιτρέπει τροποποίηση σε modal με drag-and-drop σειρά φωτογραφιών, και εκτελεί την εισαγωγή — φωτογραφίες σε Bunny, νέα είδη προς SoftOne (κλειδωμένο).

**Architecture:** Μετατροπέας πάνω στην υπάρχουσα μηχανή, όχι νέα μηχανή. Καθαρή λογική σε `lib/catalog/xml-import/parse-core.ts` (XML → εικονικός πίνακας), `transform-core.ts` (μονάδες) και `diff-core.ts` (new/changed/same/gone + συγχώνευση `edits`). Ο πίνακας περνά στο υπάρχον `toRows` → `ForeignRow[]` και από εκεί κάτω τίποτα δεν αλλάζει (`compute`, `applyForeign`, `PendingItem`, `applyMedia`). Τα προϊόντα ζουν σε πραγματικό πίνακα `SupplierFeedItem` (όχι JSON blob) ώστε να δουλεύουν server-side φίλτρα/σελίδες και η ουρά εισαγωγής.

**Tech Stack:** Next.js 16, Prisma (Postgres κοινός με live), node:test + tsx, OpenRouter (`lib/ai/openrouter.ts`), Bunny (`lib/media/cdn.ts`).

**Spec:** `docs/superpowers/specs/2026-10-28-xml-suppliers-import-design.md`

## Global Constraints
- Σχήμα μόνο με SQL μέσω `DIRECT_URL` (`CREATE TABLE/INDEX IF NOT EXISTS`), ποτέ `db push` / seed· το script να τρέχει δύο φορές χωρίς σφάλμα.
- **Καμία εγγραφή / δημιουργία στο SoftOne χωρίς ρητή εντολή του χρήστη** (εγγραφές σε παύση από 4/10)· κάθε εγγραφή μόνο όταν `itemWriteEnabled()` = true, αλλιώς «σε αναμονή». Το ίδιο για τιμή web (`webPriceWriteEnabled()`).
- Υπάρχοντα είδη: **μόνο συμπλήρωση κενών** (`onlyBlank: true`)· φωτογραφίες μόνο προσθήκη· καμία αντικατάσταση τιμής που υπάρχει.
- Μόνο δημόσιες διευθύνσεις: feed και φωτογραφίες πάντα μέσω `assertPublicUrl` / `fetchPublicBytes` (`lib/net/safe-fetch.ts`).
- Το AI υποβαθμίζεται πάντα χαριτωμένα: χωρίς κλειδί, `overBudget`, timeout ή άκυρο JSON → μόνο τα rule-based, **κανένα σφάλμα στον χρήστη** (πρότυπο `lib/ai/tasks.ts`).
- Πεδία συσκευασίας / κιβωτίου (`Box*`, `Package*`, `Subbox*`, `BarcodeBox`) αγνοούνται εξ ορισμού, μένουν αντιστοιχίσιμα.
- Το `Availability` δεν αγγίζει ποτέ `StoreStock` — μόνο ένδειξη / χαρακτηριστικό.
- Προϊόν `gone` **δεν** αποκρύπτεται και δεν απενεργοποιείται — μόνο ένδειξη.
- UI: ui-ux-pro-max, υπάρχοντα tokens (`eu-navy`/`eu-blue`/`eu-line`/`eu-chip`), `min-h-11 md:min-h-9`, `var(--fs-…)`, χωρίς οριζόντια κύλιση από 360px, **κανένα `style={{…}}`** (CSP — `sx()` από `@/components/ui/sx`), `data-help` κυριολεκτικά, `npm run help:gen`.
- Δικαιώματα: `catalog.products.write` (εισαγωγή), `catalog.sync.run` (έγκριση νέων ειδών).
- Δοκιμαστικά δεδομένα «ΔΟΚΙΜΗ 2030», διαγραφή μετά.

## Review Focus
- Feed σε **windows-1253** ή με BOM (ο επόμενος Έλληνας προμηθευτής) → τιμώνται η δήλωση `encoding` και το BOM, τα ελληνικά δεν γίνονται μουσακάς — test στο Task 2 (`parseFeed`).
- `ProductSpecification` **χωρίς `:`**, ή με δεύτερο `:` μέσα στην τιμή (`«Μέγιστη θερμοκρασία: Έως 12 ώρες κρύο & έως 6 ώρες ζεστό»`) → σπάσιμο στο **πρώτο** `:` μόνο· χωρίς `:` → αγνοείται, δεν γίνεται ετικέτα-σκουπίδι — test στο Task 2 (`specColumns`).
- Προϊόν **χωρίς `SKU`** → δεν έχει κλειδί για upsert· σημαίνεται ως πρόβλημα με τον αριθμό θέσης του, **ποτέ σιωπηλή απώλεια** — test στο Task 4 (`diffItems`).
- **Κόστος ≥ λιανική** (`Price=52.10` vs `PriceRetail=49.90` στο δείγμα) → προειδοποίηση στη γραμμή, η εισαγωγή δεν μπλοκάρει — test στο Task 3 (`priceWarning`).
- Σύγκρουση **`edits` × `payload`** σε re-run → υπερισχύει το `edits`, το προϊόν σημαίνεται `changed`, φαίνονται και οι δύο τιμές — test στο Task 4 (`mergeEdits`).

---

### Task 1: Σχήμα
**Files:** Modify `prisma/schema.prisma` · Create `scripts/apply-xml-import.ts`

- [ ] Μοντέλα `Supplier`, `SupplierFeed`, `SupplierFeedItem` όπως στο §6 του spec (με `@@unique([feedId, sku])`, `@@index([feedId, status])`, `@@index([feedId, diff])`) · script `CREATE TABLE/INDEX IF NOT EXISTS` μέσω `DIRECT_URL` (δύο εκτελέσεις χωρίς σφάλμα) · `npx prisma generate` · `npx tsc --noEmit` · commit.

### Task 2: XML → εικονικός πίνακας
**Files:** Create `lib/catalog/xml-import/parse-core.ts`, test `lib/catalog/xml-import/parse-core.test.ts`

**Interfaces:**
- Produces: `parseFeed(bytes: Buffer): { headers: string[]; matrix: string[][]; counts: { products: number; tags: number; categories: number; specLabels: number; images: number } }` · `specColumns(values: string[]): Record<string, string>` · `SPEC_PREFIX = "spec:"`

- [ ] **Tests (RED):** BOM + `encoding="windows-1253"` → ελληνικά σωστά, `encoding="utf-8"` → σωστά· `imageurl` ×3 → στήλες `imageurl 1..3` με τη σειρά του εγγράφου· `ProductSpecification` `«Τύπος: Air Cooler»` → στήλη `spec:Τύπος`· `«Μέγιστη θερμοκρασία: Έως 12 ώρες κρύο & έως 6 ώρες ζεστό»` → ετικέτα `Μέγιστη θερμοκρασία`, τιμή με το υπόλοιπο ακέραιο (σπάσιμο στο 1ο `:`)· string χωρίς `:` → αγνοείται· ίδια ετικέτα δύο φορές στο ίδιο προϊόν → οι τιμές ενώνονται με `|`· entities `&lt;55dB` και `&amp;` → αποκωδικοποιημένα· προϊόν χωρίς `imageurl` → κενές στήλες, όχι εξαίρεση· άγνωστο tag → κανονική στήλη.
- [ ] **GREEN** · `npx tsx --test lib/catalog/xml-import/parse-core.test.ts` · commit.
- [ ] Επαλήθευση στο πραγματικό δείγμα με script ανάγνωσης: 2.580 προϊόντα, 73 στήλες (43 tags + 9 `imageurl` + 21 `spec:`), 120 ζεύγη κατηγοριών · commit.

### Task 3: Μετατροπές μονάδων και προειδοποίηση τιμής
**Files:** Create `lib/catalog/xml-import/transform-core.ts`, test `lib/catalog/xml-import/transform-core.test.ts`

**Interfaces:**
- Consumes: `FieldKey` από `lib/catalog/supplier-sheet.ts`, `parseMoney` / `Rounding` από `lib/catalog/pricing/markup.ts`
- Produces: `type Transform = "none" | "g_kg" | "kg_g" | "mm_cm" | "cm_mm" | "m_cm" | { factor: number }` · `applyTransform(value: string, t: Transform): string` · `guessTransform(target: FieldKey, samples: string[]): Transform` · `priceWarning(cost: string | null, retail: string | null): string | null` · `priceFromMode(mode: "cost" | "retail", i: { cost: string | null; retail: string | null; rule: { percent: number; rounding: Rounding } | null; vat: number }): { price?: number; source: "markup" | "feed"; warning?: string }`

- [ ] **Tests (RED):** `applyTransform("4400","g_kg")` → `"4.4"`, `("31.00","cm_mm")` → `"310"`, `("1.234,50","none")` → `"1234.5"` (κόμμα ως υποδιαστολή), `("abc", …)` → `"abc"` αναλλοίωτο, `("0","g_kg")` → `"0"`, αρνητικό → αναλλοίωτο· `{factor:2.54}` → πολλαπλασιασμός· `guessTransform("weightKg", ["4400","5750"])` → `"g_kg"` (τάξη μεγέθους), `(["4.40","5.75"])` → `"none"`· `priceWarning("52.10","49.90")` → μήνυμα, `("40","49.90")` → `null`, `(null,"49.90")` → `null`.
- [ ] **Tests (RED) για `priceFromMode`:** `"retail"` με `retail:"49.90"` → `49.9`, `source:"feed"`, **ο κανόνας markup αγνοείται**· `"retail"` χωρίς `retail` → `price: undefined` + warning· `"cost"` με `cost:"40"`, κανόνα 30%, ΦΠΑ 24 → `64.48`, `source:"markup"`· `"cost"` χωρίς κανόνα → `price: undefined` + warning· `"cost"` με κόστος που δεν είναι ποσό → warning.
- [ ] **GREEN** · commit.

### Task 4: Diff του re-run και συγχώνευση διορθώσεων
**Files:** Create `lib/catalog/xml-import/diff-core.ts`, test `lib/catalog/xml-import/diff-core.test.ts`

**Interfaces:**
- Produces: `type Diff = "new" | "changed" | "same" | "gone"` · `diffItems(incoming: { sku: string; payload: Record<string,string>; pos: number }[], existing: { sku: string; payload: Record<string,string> }[]): { sku: string; diff: Diff; problem?: string }[]` · `mergeEdits(payload: Record<string,string>, edits: Record<string,string> | null): { merged: Record<string,string>; conflicts: { key: string; mine: string; feed: string }[] }`

- [ ] **Tests (RED):** `diffItems`: νέο sku → `new`· ίδιο payload → `same`· άλλη τιμή → `changed`· υπάρχον που δεν ήρθε → `gone`· **προϊόν με κενό/λείπον sku → εγγραφή με `problem` που αναφέρει τη θέση `pos`, όχι απόρριψη**· δύο προϊόντα με το ίδιο sku → `problem` στο δεύτερο. `mergeEdits`: πεδίο μόνο στο payload → περνά· πεδίο μόνο στα edits → περνά· **πεδίο και στα δύο με διαφορά → κερδίζει το edits και επιστρέφεται conflict με `mine`/`feed`**· ίδια τιμή στα δύο → κανένα conflict· `edits: null` → merged = payload.
- [ ] **GREEN** · commit.

### Task 5: Προμηθευτές από το SoftOne
**Files:** Create `lib/catalog/xml-import/suppliers.ts` (server-only)

**Interfaces:**
- Produces: `syncSuppliers(): Promise<{ added: number; updated: number }>` · `listSuppliers(q?: string): Promise<{ id: string; s1Trdr: number; code: string; name: string; afm: string | null; feed: { id: string; url: string; lastRunAt: Date | null; lastCount: number | null } | null }[]>`

- [ ] `getTable("TRDR", ["TRDR","CODE","NAME","AFM","SOSOURCE","TRDCATEGORY"], …)` με φίλτρο προμηθευτών· upsert σε `Supplier` ανά `s1Trdr`· `listSuppliers` με αναζήτηση σε κωδικό/όνομα/ΑΦΜ και join του feed.
- [ ] **Μόνο ανάγνωση** — επαλήθευση με script `scripts/tmp-*.ts` ότι το φίλτρο φέρνει προμηθευτές και όχι πελάτες/μέλη· έλεγχος πλήθους · `npx tsc --noEmit` · commit.

### Task 6: Προτάσεις αντιστοίχισης (κανόνες + AI)
**Files:** Create `lib/catalog/xml-import/suggest.ts` (server-only)

**Interfaces:**
- Consumes: `parseFeed` (Task 2), `guessTransform` (Task 3), υπάρχον `suggestTarget` / `Target` / `MappingConfig` από `lib/catalog/foreign-import/core.ts`
- Produces: `suggestMapping(input: { headers: string[]; matrix: string[][] }): Promise<{ columns: Record<number, { target: Target; transform: Transform; confidence: "sure" | "unsure"; why?: string }>; categories: Record<string, { categoryId: string | null; specGroupS1Id: number | null; confidence: "sure" | "unsure" }>; specs: Record<string, { specDefId: number | null; confidence: "sure" | "unsure" }>; aiUsed: boolean }>`

- [ ] Πρώτα κανόνες: `suggestTarget` ανά στήλη· οι στήλες `imageurl N` **ως ομάδα** σε `media:image`· οι `spec:*` σε `{ kind: "spec", label }`· `confidence: "sure"` σε ό,τι έλυσαν οι κανόνες.
- [ ] Έπειτα το AI **μόνο για τα υπόλοιπα**, τρεις κλήσεις μέσω `chat({ feature: "xml-mapping", json: true })`: (α) άγνωστες στήλες με 5 δείγματα → στόχος + μονάδα, (β) τα ζεύγη κατηγοριών → `Category` + `S1SpecGroup` με βεβαιότητα, (γ) οι ετικέτες → `S1SpecDef` της ομάδας (+ `S1SpecOption` όπου κλειστή λίστα). `parseJson` με έλεγχο· άκυρο ή `overBudget` → τα rule-based, `aiUsed: false`.
- [ ] Επαλήθευση με το δείγμα της Estia, **δύο φορές**: με κλειδί AI και με `AI` απενεργοποιημένο — και στις δύο βγαίνει πλήρης, χρησιμοποιήσιμη αντιστοίχιση (η δεύτερη με λιγότερα `sure`)· καταγραφή κόστους από `AiUsage` · commit.

### Task 7: Feed — κατέβασμα, φόρτωση, diff
**Files:** Create `lib/catalog/xml-import/feed.ts` (server-only)

**Interfaces:**
- Consumes: `parseFeed` (T2), `applyTransform` (T3), `diffItems` / `mergeEdits` (T4), `suggestMapping` (T6)
- Produces: `inspectFeed(url: string): Promise<{ counts: …; headers: string[]; sample: Record<string,string> }>` · `saveFeed(supplierId: string, url: string, config: SavedConfig & { transforms: Record<string, Transform>; priceMode: "cost" | "retail"; toSoftone: boolean }): Promise<string>` · `runFeed(feedId: string): Promise<{ counts: Record<Diff, number>; problems: number }>` · `listItems(feedId: string, filter: { diff?: Diff; status?: string; q?: string; page: number }): Promise<{ rows: …[]; total: number }>`

- [ ] `inspectFeed`: `assertPublicUrl` → `fetchPublicBytes` (όριο μεγέθους/χρόνου) → `parseFeed`· επιστρέφει πλήθη + το πρώτο προϊόν ακατέργαστο (βήμα ②). Feed πάνω από το όριο → `UserError` με ρητό μήνυμα.
- [ ] `runFeed`: κατέβασμα → `parseFeed` → `applyTransform` ανά στήλη → `diffItems` → upsert `SupplierFeedItem` (payload ναι, `edits` **ποτέ** δεν πειράζεται) → `status: "review"` στα open· ενημέρωση `lastRunAt` / `lastCount`.
- [ ] `listItems`: server-side σελίδες (50) και φίλτρα πάνω στα `@@index`· επιστρέφει και τα πλήθη ανά φίλτρο για τα chips.
- [ ] Επαλήθευση με script στο πραγματικό feed: 1ο τρέξιμο → 2.580 `new`· 2ο τρέξιμο αμέσως → 2.580 `same`, 0 `new`· χειροκίνητο `edits` σε ένα προϊόν + αλλαγμένο payload → `changed` με conflict· **καμία κλήση SoftOne** · διαγραφή του δοκιμαστικού feed · commit.

### Task 8: Ουρά εισαγωγής
**Files:** Create `lib/catalog/xml-import/queue.ts` (server-only)

**Interfaces:**
- Consumes: `listItems` (T7), υπάρχοντα `fetchPublicBytes`, `ingest`, `attachAssets`, `planForeign` / `applyForeign`, `itemWriteEnabled`
- Produces: `enqueue(feedId: string, sel: { filter: …; except: string[] }, staffId: string | null): Promise<{ queued: number }>` · `drain(feedId: string, max: number): Promise<{ done: number; images: number; errors: number; left: number }>` · `progress(feedId: string): Promise<{ total: number; done: number; images: { done: number; total: number }; errors: number; running: boolean }>`

- [ ] `enqueue`: η επιλογή είναι **φίλτρο + εξαιρέσεις**, όχι λίστα ids → `status: "queued"` στα όσα ταιριάζουν.
- [ ] `drain`: παρτίδα `max` στοιχείων — φωτογραφίες `fetchPublicBytes` → `ingest` (WebP, Bunny) → `assetIds` **με τη σειρά των `images`**· γραμμές μέσω `planForeign` + `applyForeign` (`onlyBlank: true`)· νέα → `PendingItem`· προϊόν που γεννήθηκε → `attachAssets(productId, assetIds, "gallery")`. Σφάλμα → `status: "error"` + `error` **στη γραμμή**, η παρτίδα συνεχίζει.
- [ ] Η τιμή μπαίνει από `priceFromMode(feed.priceMode, …)` (T3) πριν το `applyForeign`, ώστε το `"retail"` να μη περνά από τον κανόνα markup· override του χρήστη στα `edits` κερδίζει και από τα δύο.
- [ ] `progress`: διαβάζεται από τη βάση ώστε η πρόοδος να επιβιώνει κλείσιμο καρτέλας.
- [ ] Επαλήθευση με **ένα** δοκιμαστικό προϊόν «ΔΟΚΙΜΗ 2030»: φωτογραφίες φτάνουν στο Bunny με τη σωστή σειρά, `MediaAsset` δημιουργούνται, νέο είδος μένει `PendingItem` σε αναμονή με κλειστό διακόπτη· **καμία `setData`**· διαγραφή μετά · commit.

### Task 9: Διαχείριση — βήματα ① ② ③
**Files:** Create `app/admin/(shell)/catalog/templates/xml/page.tsx` + `actions.ts`, `components/admin/catalog/xml/XmlImportWizard.tsx`, `components/admin/catalog/xml/MappingSections.tsx` · Modify `app/admin/(shell)/catalog/templates/page.tsx` (σύνδεσμος)

- [ ] ①: αναζήτηση προμηθευτή (κωδικός/όνομα/ΑΦΜ) με `listSuppliers`· προμηθευτής με feed → κάρτα «έτρεξε <ημ/νία>, <ν> προϊόντα» + «Νέο τρέξιμο» που πηδά στο ④ **χωρίς AI**.
- [ ] ②: url + «Έλεγχος» → πλήθη και **το πρώτο προϊόν ακατέργαστο**, πριν δεσμευτεί ο χρήστης.
- [ ] ③: τρεις πτυσσόμενες ενότητες με «ν από Μ · κ θέλουν έλεγχο» στην κεφαλίδα, ανοιχτές μόνο όσες έχουν ανεπίλυτα· αβέβαια πρώτα· ανά γραμμή `στήλη → στόχος → μονάδα` με **3 πραγματικά δείγματα τιμών**· **badge AI μόνο στα `unsure`**· διακόπτης τιμής (κόστος+markup ↔ λιανική feed) και καθολικός διακόπτης SoftOne· μάρκα feed χωρίς αντιστοιχία → **ρητό φράγμα** («δεν δημιουργούμε μάρκες από εδώ»).
- [ ] Πρόοδος βημάτων ορατή με επιστροφή πίσω· `aria-live` στα σφάλματα· `tsc`, `eslint` · commit.

### Task 10: Διαχείριση — λίστα ελέγχου ④, modal, φωτογραφίες
**Files:** Create `components/admin/catalog/xml/ReviewList.tsx`, `ProductModal.tsx`, `ImageOrder.tsx` · Modify `lib/help/content/index.ts`

- [ ] Λίστα: server-side σελίδες/φίλτρα· chips με πλήθη (`Νέα · Υπάρχουν · Αβέβαια · Μη διαθέσιμα · Σφάλματα`)· **επιλογή ως φίλτρο + εξαιρέσεις** («2.088 επιλεγμένα · 3 εξαιρέσεις»)· **στα 360px κάρτες, από `md` πίνακας** με `tabular-nums`· και τα δύο σενάρια τιμής ορατά· προειδοποίηση `priceWarning` ανά γραμμή.
- [ ] `ProductModal`: στοιχεία / χαρακτηριστικά / τιμή / φωτογραφίες· «ήρθε ως» δίπλα σε κάθε αλλαγμένο πεδίο και **και οι δύο τιμές στα conflicts** του `mergeEdits`· ‹ προηγούμενο / επόμενο ›· επιβεβαίωση στο κλείσιμο με αλλαγές· `inputMode="decimal"` στα αριθμητικά· διακόπτης SoftOne ως εξαίρεση.
- [ ] `ImageOrder`: πρότυπο από `components/admin/catalog/ProductImages.tsx` — native HTML5 drag **και βελάκια ως εναλλακτική πληκτρολογίου**, αριθμημένα badges, «Κύρια» στην πρώτη, αφαίρεση με στόχο ≥44px και `aria-label`.
- [ ] Εισαγωγή: `enqueue` → επαναλαμβανόμενο `drain` με `progress` από τη βάση· μήνυμα «μπορείς να κλείσεις τη σελίδα»· σφάλματα **ως φίλτρο στη λίστα** με «Δοκίμασε ξανά», όχι toast· `aria-live="polite"` στην πρόοδο· κατάσταση **ποτέ μόνο με χρώμα** (εικονίδιο + λέξη).
- [ ] Οδηγός βοήθειας για τη νέα σελίδα με `data-help` σε κάθε σημείο· `npm run help:gen` χωρίς κενά· `npm run help:shots -- /admin/catalog/templates/xml`.
- [ ] Έλεγχος στον browser (υπολογιστής + 360px) με το δείγμα της Estia μέχρι τη λίστα ελέγχου, **χωρίς εκτέλεση εισαγωγής**· `tsc`, `eslint`, `npm test` · commit.
