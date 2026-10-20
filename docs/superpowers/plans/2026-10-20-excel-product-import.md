# Εισαγωγή προϊόντων από ξένο Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Οδηγός που μετατρέπει οποιοδήποτε Excel σε εισαγωγή καταλόγου: αντιστοίχιση στηλών/τιμών, εύρεση ειδών στο SoftOne, συμπλήρωση μόνο κενών, νέα είδη με έγκριση, φωτογραφίες σε Bunny, τιμές από κόστος με κανόνες markup.

**Architecture:** Καθαρή λογική σε `lib/catalog/foreign-import/core.ts` (επικεφαλίδες, αντιστοίχιση, μετατροπή σε γραμμές, εύρεση είδους, «μόνο κενά») και `lib/catalog/pricing/markup.ts`. Ο server μετατρέπει τις γραμμές στη μορφή της υπάρχουσας μηχανής (`ParsedFile` → `planImport`/`applyImport`, `MediaRow` → `applyMedia`) με νέα επιλογή `onlyBlank`· τα νέα είδη πάνε σε `PendingItem` και δημιουργούνται με `createItem` μετά από έγκριση.

**Tech Stack:** Next.js 16, Prisma (Postgres κοινός με live), exceljs, node:test.

**Spec:** `docs/superpowers/specs/2026-10-20-excel-product-import-design.md`

## Global Constraints
- Σχήμα μόνο με SQL μέσω `DIRECT_URL` (`CREATE TABLE IF NOT EXISTS`), ποτέ `db push` / seed.
- **Καμία εγγραφή / δημιουργία στο SoftOne χωρίς ρητή εντολή του χρήστη** (εγγραφές σε παύση από 4/10)· κάθε εγγραφή μόνο όταν `itemWriteEnabled()` = true· αλλιώς «σε αναμονή».
- Υπάρχοντα είδη: γράφεται πεδίο μόνο αν είναι κενό στο SoftOne· χαρακτηριστικά μόνο νέες ετικέτες· φωτογραφίες μόνο προσθήκη (`replace=false`)· τιμή web μόνο αν είναι κενή.
- Εύρεση είδους: MTRL → κωδικός είδους → EAN → κωδικός κατασκευαστή + μάρκα· διαφορετικά είδη από κλειδιά της ίδιας γραμμής ή ίδιο είδος σε δύο γραμμές → «Πρόβλημα».
- Νέο είδος: κωδικός (μοναδικός, ≤ 25· προεπιλογή ο κωδικός κατασκευαστή), όνομα, μάρκα με `s1Id`, ομάδα χαρακτηριστικών, κατηγορία site — αλλιώς δεν εγκρίνεται· μπαίνει ανενεργό στο site.
- Τιμή = κόστος × (1 + markup/100) × (1 + ΦΠΑ/100), στρογγύλεμα none | int | 90 | 99, πλαφόν στην προτεινόμενη λιανική· πιο συγκεκριμένος κανόνας: μάρκα+κατηγορία > κατηγορία > μάρκα > γενικός.
- Όρια αρχείου: 15 MB, 5.000 γραμμές· τύποι xlsx και csv.
- Δοκιμαστικά δεδομένα «ΔΟΚΙΜΗ 2030», διαγραφή μετά· UI: ui-ux-pro-max, `min-h-11 md:min-h-9`, `var(--fs-…)`, χωρίς οριζόντια κύλιση από 360px, κανένα `style={{…}}` (CSP — `sx()` από `@/components/ui/sx`), `data-help` κυριολεκτικά, help:gen.

## Review Focus
- Αρχείο με κενές γραμμές / συγχωνευμένα κελιά / επικεφαλίδα όχι στην 1η γραμμή → σωστή γραμμή επικεφαλίδων και αγνόηση κενών γραμμών — test στο Task 2 (`detectHeaderRow`).
- EAN ως αριθμός στο Excel (επιστημονική μορφή `5.90123E+12` ή χωρίς μηδενικά μπροστά) → κανονικοποίηση σε ψηφία 8/12/13/14, αλλιώς «Πρόβλημα» — test στο Task 2 (`normEan`).
- Κόστος με ελληνική μορφή «1.234,50» ή με «€» → σωστός αριθμός — test στο Task 3 (`parseMoney`).
- Ίδιο είδος σε δύο γραμμές του αρχείου → και οι δύο «Πρόβλημα», καμία εκτέλεση — test στο Task 2 (`resolveMatches`).
- Διακόπτης SoftOne κλειστός → στοιχεία «σε αναμονή», φωτογραφίες εκτελούνται — έλεγχος στο Task 6 (σχέδιο με `writeOn=false`).

---

### Task 1: Σχήμα
**Files:** Modify `prisma/schema.prisma` · Create `scripts/apply-foreign-import.ts`
**Produces:** μοντέλα `ImportMapping` (id, name, headerSignature, config Json, createdById, createdAt, updatedAt), `ImportJob` (id, fileName, mappingId?, rows Json, counts Json, status default "draft", createdById, createdAt, updatedAt), `PendingItem` (id, jobId, rowNo, code, fields Json, specs Json, media Json, brandId?, specGroupS1Id Int?, webCategoryId?, cost Float?, rrp Float?, price Float?, status default "pending", mtrl Int?, productId?, error?, approvedById?, createdAt, updatedAt; @@index([status])), `MarkupRule` (id, brandId?, categoryId?, percent Float, rounding default "none", active default true, createdAt, updatedAt).
- [ ] Μοντέλα · script `CREATE TABLE/INDEX IF NOT EXISTS` (δύο εκτελέσεις χωρίς σφάλμα) · `npx prisma generate` · `tsc` · commit.

### Task 2: Καθαρή λογική εισαγωγής
**Files:** Create `lib/catalog/foreign-import/core.ts`, test `lib/catalog/foreign-import/core.test.ts`
**Produces:**
- `type Target = { kind: "field"; key: FieldKey } | { kind: "spec"; label: string } | { kind: "media"; type: "image" | "banner" | "video" } | { kind: "brand" } | { kind: "category" } | { kind: "cost" } | { kind: "rrp" } | { kind: "ignore" }` (`FieldKey` από lib/catalog/supplier-sheet.ts)
- `detectHeaderRow(matrix: string[][]): number` — η πρώτη γραμμή με ≥ 2 μη κενά κελιά που ακολουθείται από γραμμή δεδομένων
- `suggestTarget(header: string): Target` (EAN/Barcode/GTIN → barcode· SKU/Κωδικός → code· Model/MPN/Part → factoryCode· Name/Περιγραφή είδους/Title → name· Image/Photo/Φωτογραφία/URL εικόνας → media image· Brand/Μάρκα/Κατασκευαστής → brand· Category/Κατηγορία → category· Cost/Κόστος/Τιμή αγοράς/Net → cost· RRP/Λιανική/MSRP → rrp· αλλιώς ignore)
- `headerSignature(headers: string[]): string` (πεζά, χωρίς τόνους/κενά, ταξινομημένα, σε ένα string)
- `normEan(v: string): string | null` (επιστημονική μορφή → ψηφία· δεκτά μήκη 8/12/13/14)
- `toRows(matrix, headerRow, config: { columns: Record<number, Target>; brandMap: Record<string, string | null>; categoryMap: Record<string, string | null> }): ForeignRow[]` όπου `ForeignRow = { rowNo: number; fields: Partial<Record<FieldKey,string>>; specs: Record<string,string>; media: { image: string[]; banner: string[]; video: string[] }; brandId: string | null; categoryId: string | null; cost: string | null; rrp: string | null }` (κενές γραμμές παραλείπονται)
- `resolveMatches(rows: ForeignRow[], index: { byMtrl: Map<number, number>; byCode: Map<string, number>; byEan: Map<string, number>; byFactory: Map<string, number> }): { rowNo: number; mtrl: number | null; problem: string | null }[]` (`byFactory` κλειδί = `${brandId}|${factoryCode.toLowerCase()}`)
- `blankOnly(current: Partial<Record<FieldKey, string | null>>, incoming: Partial<Record<FieldKey, string>>): Partial<Record<FieldKey, string>>` και `newSpecs(currentMemo: string, incoming: Record<string,string>): Record<string,string>` (ετικέτες που δεν υπάρχουν, χωρίς διάκριση πεζών/τόνων)
- [ ] Tests (RED): επικεφαλίδα στη 3η γραμμή μετά από κενές → 2 (0-based)· `suggestTarget("EAN13")` → barcode, `("Φωτογραφία 2")` → media image, `("Χρώμα")` → ignore· ίδια υπογραφή για «EAN, Τιμή» και «τιμη ,ean»· `normEan("5.90123E+12")` → null (απώλεια ψηφίων), `normEan("5901234123457")` → ίδιο, `normEan("123")` → null· `toRows` αγνοεί κενή γραμμή και διαβάζει brand/category από τους χάρτες· `resolveMatches`: MTRL κερδίζει, EAN και κωδικός σε διαφορετικά είδη → problem, ίδιο είδος σε 2 γραμμές → problem και στις δύο, κωδικός κατασκευαστή χωρίς μάρκα → καμία αντιστοίχιση· `blankOnly` κρατά μόνο πεδία που είναι κενά/null· `newSpecs` αγνοεί «Χωρητικότητα» όταν το memo έχει «χωρητικοτητα : 9kg».
- [ ] GREEN · `npm test` · commit.

### Task 3: Τιμές με markup
**Files:** Create `lib/catalog/pricing/markup.ts`, test `lib/catalog/pricing/markup.test.ts`
**Produces:** `type Rounding = "none" | "int" | "90" | "99"` · `parseMoney(v: string): number | null` · `pickRule<R extends { brandId: string | null; categoryId: string | null; active: boolean }>(rules: R[], brandId: string | null, categoryId: string | null): R | null` · `priceFrom(i: { cost: number; percent: number; vat: number; rounding: Rounding; rrp?: number | null }): { price: number; capped: boolean; margin: number }` (margin = τιμή χωρίς ΦΠΑ − κόστος).
- [ ] Tests (RED): `parseMoney("1.234,50 €")` → 1234.5, `("1234.5")` → 1234.5, `("abc")` → null· `pickRule`: μάρκα+κατηγορία > κατηγορία > μάρκα > γενικός, ανενεργός αγνοείται· `priceFrom({cost:100,percent:30,vat:24,rounding:"90"})` → 161.90 (130×1.24=161.2 → ,90 προς τα πάνω), `"99"` → 161.99, `"int"` → 162, `"none"` → 161.2· με `rrp:150` → 150 και capped true.
- [ ] GREEN · commit.

### Task 4: «Μόνο κενά» στη μηχανή εισαγωγής + τιμή web
**Files:** Modify `lib/catalog/supplier-import.ts` (`ImportOptions.onlyBlank?: boolean` — στο `decide` οι αλλαγές υπαρχόντων περνούν από `blankOnly` / `newSpecs` του Task 2), `lib/softone/item-write.ts` (`writeWebPrice(mtrl: number, price: number): Promise<WriteResult>` — setData ITEM με τον πίνακα MTREXTRA πεδίο NUM04, ανάγνωση για επαλήθευση)
- [ ] Πρώτα **μόνο ανάγνωση**: `getData ITEM` ενός είδους με `scripts/tmp-*.ts` για να επιβεβαιωθεί η δομή του MTREXTRA (πίνακας και κλειδιά)· ΚΑΜΙΑ εγγραφή — το `writeWebPrice` γράφεται και ελέγχεται με τύπους, η πρώτη πραγματική εγγραφή μόνο με εντολή του χρήστη.
- [ ] `planImport` με `onlyBlank` σε υπάρχον είδος: πεδία με τιμή δεν εμφανίζονται ως αλλαγές (script ανάγνωσης, χωρίς apply) · τα υπάρχοντα tests μένουν πράσινα · commit.

### Task 5: Ανάγνωση αρχείου και αποθηκευμένες αντιστοιχίσεις
**Files:** Create `lib/catalog/foreign-import/read.ts` (server-only)
**Produces:** `readWorkbook(buf: ArrayBuffer, fileName: string): Promise<{ sheets: { name: string; matrix: string[][] }[] }>` (xlsx μέσω exceljs, csv με ανίχνευση `;`/`,`· άλλος τύπος → σφάλμα «Αποθήκευσε ως xlsx»· έλεγχος ορίων 15 MB / 5.000 γραμμές· κελιά με `cellText` της supplier-sheet) · `saveMapping(name, headers, config, staffId)` · `findMapping(headers): Promise<ImportMapping | null>` (ίδια υπογραφή).
- [ ] Δοκιμή με ένα πραγματικό ξένο xlsx και ένα csv (script, χωρίς εγγραφές)· commit.

### Task 6: Σχέδιο και εκτέλεση εισαγωγής
**Files:** Create `lib/catalog/foreign-import/server.ts` (server-only)
**Consumes:** Tasks 2–5, `planImport`/`applyImport`, `applyMedia`, `itemWriteEnabled`, `S1Item` (index), `MarkupRule`.
**Produces:**
- `planForeign(input: { fileName; sheet: string[][]; headerRow; config }, staffId): Promise<{ jobId: string; rows: ForeignPlanRow[]; writeOn: boolean }>` — `ForeignPlanRow = { rowNo; title; status: "update" | "unchanged" | "new" | "waiting" | "problem"; mtrl?; changes: { label; from; to }[]; media: number; price?: { cost; price; rule: string; capped: boolean; margin }; problem?: string }`· αποθηκεύει `ImportJob` (draft).
- `applyForeign(jobId: string, rowNos: number[], staffId): Promise<{ done: number; waiting: number; pending: number; errors: { rowNo; error }[] }>` — υπάρχοντα: `applyImport` με `toSoftone = writeOn`, `onlyBlank: true`, χωρίς ενεργοποίηση· φωτογραφίες `applyMedia(..., replace=false)`· τιμή μόνο αν `eshopPrice` κενό και `writeOn` → `writeWebPrice`· νέα → `PendingItem` (ομάδα χαρακτηριστικών από την κατηγορία site ή από ήδη υπάρχον είδος της ίδιας κατηγορίας, URLs φωτογραφιών στο `media`, κόστος/τιμή)· με `writeOn=false` τα στοιχεία SoftOne μένουν «waiting» στο job.
- [ ] Επαλήθευση με script: σχέδιο σε πραγματικό ξένο αρχείο με `writeOn=false` → status ανά γραμμή, «waiting» για στοιχεία, πλήθος φωτογραφιών, τιμές· **καμία κλήση applyForeign σε πραγματικά είδη**· διαγραφή του job · commit.

### Task 7: Νέα είδη — έγκριση και δημιουργία
**Files:** Create `lib/catalog/foreign-import/pending.ts` (server-only)
**Produces:** `pendingMissing(p: PendingItem): string[]` (καθαρή — κωδικός, όνομα, μάρκα με s1Id, ομάδα, κατηγορία) · `approvePending(ids: string[], staffId): Promise<{ id; ok; mtrl?; error? }[]>` — μόνο αν `itemWriteEnabled()` και `pendingMissing` κενό: `createItem` (refs από είδος ίδιας ομάδας, όπως σήμερα) → `writeWebPrice` αν υπάρχει τιμή → `projectItem(mtrl)` → προϊόν ανενεργό → `applyMedia` με τα URLs στο νέο productId → status created· σφάλμα → status error με το μήνυμα · `discardPending(ids)`.
- [ ] Test για `pendingMissing` (RED → GREEN)· η `approvePending` ελέγχεται μόνο με τύπους — **καμία δημιουργία χωρίς εντολή του χρήστη** · commit.

### Task 8: Διαχείριση και βοήθεια
**Files:** Create `app/admin/(shell)/catalog/templates/import/page.tsx` + `actions.ts`, `components/admin/catalog/ForeignImportWizard.tsx`, `app/admin/(shell)/catalog/templates/nea-eidi/page.tsx` (λίστα «Νέα είδη προς δημιουργία»), `app/admin/(shell)/catalog/templates/kanones-timon/page.tsx` (κανόνες markup) · Modify `app/admin/(shell)/catalog/templates/page.tsx` (σύνδεσμοι), `lib/help/content/index.ts`
- [ ] Οδηγός 4 βημάτων (ανέβασμα · στήλες με εξήγηση/παράδειγμα και αποθηκευμένη αντιστοίχιση · τιμές μάρκας/κατηγορίας · προεπισκόπηση με επιλογή και εκτέλεση σε παρτίδες με πρόοδο)· λίστα νέων με «τι λείπει», επεξεργασία στοιχείων, έγκριση (κλειδωμένη χωρίς διακόπτη, με εξήγηση) και απόρριψη· σελίδα κανόνων (γενικός + εξαιρέσεις, παράδειγμα υπολογισμού δίπλα σε κάθε κανόνα). Δικαιώματα `catalog.products.write` (εισαγωγή), `catalog.sync.run` (έγκριση νέων).
- [ ] Έλεγχος στον browser (υπολογιστής + 375px) με ξένο Excel μέχρι την προεπισκόπηση· help:gen χωρίς κενά · `tsc`, `eslint`, `npm test` · commit.
