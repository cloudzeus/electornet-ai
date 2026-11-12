# Σύγκριση τιμών με kotsovolos.gr — πλάνο υλοποίησης

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Νυχτερινή σύγκριση τιμών με τον Κωτσόβολο για λευκές συσκευές, τηλεοράσεις και τηλέφωνα: badge στη διαχείριση και μαζική αλλαγή τιμής web στο SoftOne με δικλείδες και αναίρεση.

**Architecture:** Καθαρός πυρήνας (`core.ts`, `bulk-core.ts`) με tests. Λεπτός client HTTP. Νυχτερινή εργασία στον υπάρχοντα scheduler. Server components για ανάγνωση, server actions για αλλαγές. Οι εγγραφές περνούν μόνο από την υπάρχουσα `writeWebPrice`.

**Tech Stack:** Next.js 16 (διάβασε `node_modules/next/dist/docs/` πριν από νέα route), Prisma + Postgres (μεταβολές με αρχείο `prisma/sql/*.sql`), shadcn/ui, Tailwind 4, `node:test` μέσω `npm test`.

**Spec:** `docs/superpowers/specs/2026-11-11-kotsovolos-price-compare-design.md` · Mockups: https://claude.ai/artifact/KjffZSGnJPteSUg7NicGwq

## Global Constraints

- `competitor` = `"kotsovolos"` σε όλους τους πίνακες.
- **Ροή χωρίς ban (απαίτηση χρήστη):** κλήσεις στον Κωτσόβολο μία τη φορά, ποτέ παράλληλα.
  - Τυχαία παύση **3–7″** ανάμεσα (μέσος όρος ~12 το λεπτό, ποτέ πάνω από 20 σε οποιοδήποτε λεπτό).
  - Διάλειμμα **60–120″** κάθε 80–120 κλήσεις (τυχαίο).
  - Όριο **1.800 κλήσεις τη νύχτα**, μόνο μέσα στο παράθυρο **01:00–06:00**. Στο όριο ή στις 06:00 σταματά ήσυχα και συνεχίζει την επόμενη νύχτα.
  - Σειρά: παλαιότερο `checkedAt` πρώτο, ώστε όσα δεν πρόλαβε να πάνε πρώτα την επόμενη φορά.
  - Το sitemap κατεβαίνει μία φορά τη νύχτα.
  - Ζευγάρι που ελέγχθηκε τις τελευταίες 20 ώρες (π.χ. από «Τρέξε τώρα» ή από επιβεβαίωση ζευγαριού) δεν ξαναζητείται.
  - Timeout 15″. Ένα σταθερό User-Agent `Mozilla/5.0 (compatible; price-compare/1.0)` και keep-alive, χωρίς προσωπικά στοιχεία.
  - **Φρένο:**
    - 429/403/503 → σέβεται το `Retry-After` μία φορά (έως 10′) και αν ξαναγίνει σταματά για τη νύχτα.
    - 3 συνεχόμενα σφάλματα δικτύου/5xx → σταματά.
    - Ο χρόνος απόκρισης ανεβαίνει πάνω από 3× τον μέσο → διπλασιάζονται οι παύσεις.
    - Δύο νύχτες στη σειρά με φρένο → `ok:false` με «ο Κωτσόβολος μάς κόβει — η εργασία σταματά ώσπου να την ξαναενεργοποιήσεις» και αυτόματη απενεργοποίηση (setting `competitors.kotsovolos.paused`).
  - «Τρέξε τώρα» από τη διαχείριση: ίδιοι ρυθμοί, όριο 300 κλήσεις.
- Μόνο τα endpoints του spec: `productSiteMap.xml`, `categoriesSiteMap.xml`, `/api/ext/getProductByArticleNumber`.
- Τιμή Κωτσόβολου = `offerPrice ?? listPrice`. Δική μας = `ProductOffer.price ?? Product.price`. `diffPct = (εμείς − Κωτσ.)/Κωτσ.·100`, στρογγυλό σε 1 δεκαδικό. Ίδια τιμή = |diff| ≤ 0,5.
- Ελάχιστο μήκος κωδικού μοντέλου 5, με τουλάχιστον ένα ψηφίο.
- Εγγραφή τιμής **μόνο** μέσω `writeWebPrice` (`lib/softone/item-write.ts`) και μόνο με δικαίωμα `catalog.sync.run`. Οι εγγραφές SoftOne είναι σε παύση: κανένα τρέξιμο εγγραφής σε πραγματικό είδος χωρίς ρητή έγκριση του χρήστη στο chat.
- Προεπιλογές δικλείδων: μέγιστη μείωση 15%, ελάχιστο περιθώριο πάνω από κόστος (ορίζεται στην οθόνη), παράλειψη ενεργής προσφοράς, τιμή Κωτσόβολου όχι παλαιότερη από 36 ώρες, «ανέβασε και τα φθηνότερα» κλειστό.
- Badge μόνο στη διαχείριση, ποτέ σε σελίδα του eshop.
- Κείμενα UI στα απλά ελληνικά. Fluid τυπογραφία (`var(--fs-*)`), χωρίς σταθερά `px` γραμματοσειράς. Χωρίς οριζόντια κύλιση σελίδας (οι πίνακες σε κουτί `overflow-x-auto`). Στόχοι αφής ≥ 44px. Ποτέ δύο κάθετα scrollbars.
- Κάθε σελίδα/component της διαχείρισης: οδηγός στο `lib/help/content/index.ts`, `data-help`, `npm run help:gen`, `npm run help:shots -- <διαδρομή>`.
- Πριν από κάθε UI εργασία: φόρτωσε τα skills `unslop` και `ui-ux-pro-max`· γραφήματα με το `dataviz`.
- Commit μόνο όταν το ζητήσει ο χρήστης (κανόνας του χρήστη). Τα βήματα «Commit» σημαίνουν: ετοίμασε τη λίστα αρχείων και ρώτα.

## Review Focus

1. **Τιμές σε άλλη μορφή ή που λείπουν** («1299.9», χωρίς γραμμή `Offer`, `price: []`, απάντηση HTML/302 αντί για JSON): γραμμή με `lastError`, χωρίς να πέσει η εργασία. Test στο Task 3 (`parseProduct`).
2. **Μοντέλα με κενά, τελείες, κάθετες** (`CSO 496TWMB6/1-S`, `WWG360 WCS`, `F4WV912P2E.ABWQPHS`): ίδιο αποτέλεσμα με το σκέτο κωδικό. Test στο Task 3.
3. **Ζευγάρι που χάθηκε από το sitemap**: `available=false`, η τελευταία τιμή μένει, γκρι badge «δεν διατίθεται πια», και η μαζική αλλαγή το αποκλείει. Tests στα Tasks 3 και 7.
4. **Η τιμή web άλλαξε ανάμεσα στην προεπισκόπηση και την εφαρμογή**: η γραμμή παραλείπεται με μήνυμα και δεν γράφεται. Test στο Task 8 (`expect` στη `writeWebPrice`).
5. **Αναίρεση όταν κάποιος άλλος άλλαξε στο μεταξύ την τιμή**: η γραμμή μένει όπως είναι, «άλλαξε από άλλον». Test στο Task 8.

---

### Task 1: Κόστος αγοράς από το SoftOne (διερεύνηση, μόνο ανάγνωση)

**Files:**
- Create: `lib/competitors/cost.ts`
- Create: `scripts/tmp-cost-probe.ts` (σβήνεται στο τέλος)

**Interfaces:**
- Produces: `readCosts(mtrls: number[]): Promise<Map<number, number> | null>`: `null` = το πεδίο δεν διαβάζεται, οπότε η δικλείδα κόστους κρύβεται.

- [ ] **Step 1:** Με το skill `softone`, βρες ποιο πεδίο είναι η τιμή/κόστος αγοράς του είδους. Υποψήφια: `MTRL.PURLPRICE`· μέσος όρος κόστους σε `MTRBALSHEET`/`MTRFINDATA`. Έλεγξε με `getTableFields` και με `GetTable`/`selectorFields` στα MTRL 111750 και 158980. Μόνο αναγνώσεις.
- [ ] **Step 2:** Γράψε το εύρημα στο spec (ενότητα «Μαζική αλλαγή → Κόστος»): πεδίο, πηγή, πόσα από 20 τυχαία είδη το έχουν > 0.
- [ ] **Step 3:** Υλοποίησε το `readCosts` με batch ανάγνωση (≤ 50 MTRL ανά κλήση). Αν το πεδίο δεν υπάρχει ή είναι παντού 0, γύρνα `null`.
- [ ] **Step 4:** Τρέξε `npx tsx scripts/tmp-cost-probe.ts 111750 158980`. Αναμενόμενο: τυπώνει τον χάρτη ή `null` με εξήγηση. Σβήσε το script.
- [ ] **Step 5: Commit** `lib/competitors/cost.ts`, spec.

### Task 2: Πίνακες

**Files:**
- Modify: `prisma/schema.prisma` (νέα models + back-relations στα `Product`, `Category`, `Brand`, `User`)
- Create: `prisma/sql/2026-11-12-competitor-prices.sql`

**Interfaces:**
- Produces: models `CompetitorCategoryMap`, `CompetitorBrandMap`, `CompetitorPrice`, `CompetitorPriceHistory`, `PriceChangeBatch`, `PriceChangeLine` με τα πεδία και τα μοναδικά κλειδιά του spec (ενότητα «Δεδομένα»). Τύποι: τιμές `Decimal(10,2)`, `diffPct Float?`, `match String` (`auto|suggested|manual|rejected|lost`), `rule Json`, χρόνοι `DateTime`. Επιπλέον στο `CompetitorPrice` (οδηγία χρήστη): `cost Decimal(10,2)?`, `costSource String?` (`supplier-last|purl`), `costAt DateTime?`, `missCount Int @default(0)` (συνεχόμενες νύχτες που το `extId` δεν βρέθηκε).

- [ ] **Step 1:** Πρόσθεσε τα models. `CompetitorPrice` και `CompetitorPriceHistory` με `onDelete: Cascade`. Ευρετήρια: `CompetitorPrice(competitor, diffPct)`, `CompetitorPriceHistory(competitorPriceId, at)`, `PriceChangeLine(batchId)`.
- [ ] **Step 2:** Γράψε το SQL idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`), με σχόλιο κεφαλίδας όπως στο `2026-11-11-product-weight.sql`.
- [ ] **Step 3:** `npx prisma validate && npx prisma generate`. Αναμενόμενο: χωρίς σφάλμα.
- [ ] **Step 4:** Ρώτα τον χρήστη πριν από το `npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-12-competitor-prices.sql` (κοινή βάση με άλλα projects). Μετά: `npx tsx -e` με `db.competitorPrice.count()` → `0`.
- [ ] **Step 5: Commit** schema + SQL.

### Task 3: Πυρήνας ταιριάσματος

**Files:**
- Create: `lib/competitors/kotsovolos/core.ts`
- Test: `lib/competitors/kotsovolos/core.test.ts`

**Interfaces:**
- Produces:
  - `type KotItem = { art: string; path: string; last: string }` (`path` = διαδρομή χωρίς το τελευταίο κομμάτι)
  - `parseSitemap(xml: string): KotItem[]`
  - `parseCategories(xml: string): { path: string; label: string }[]` (label από το τελευταίο κομμάτι)
  - `norm(s: string): string`
  - `matchByModel(o: { brand: string; alias?: string | null; model: string | null }, cands: KotItem[]): { kind: "matched"; item: KotItem } | { kind: "ambiguous"; items: KotItem[] } | { kind: "none" }`
  - `matchPhone(o: { brand: string; alias?: string | null; title: string }, cands: KotItem[]): KotItem | null` (πάντα πρόταση)
  - `isBundle(title: string, kind: string): boolean`
  - `parseProduct(json: unknown): { title: string; list: number | null; offer: number | null; buyable: boolean } | { error: string }`
  - `diffPct(ours: number, theirs: number): number`
  - `badgeState(diff: number | null, available: boolean): "up" | "down" | "eq" | "gone" | "none"`

- [ ] **Step 1: Γράψε τα tests:**
  - `matchByModel` matched:
    - («Samsung», `QE65QN90DATXXH`) ↔ `300899-tv-led-65-samsung-qe65qn90da`
    - («LG», `F4WV912P2E.ABWQPHS`) ↔ `1-lg-f4wv912p2ea-12kg`
    - («AEG», `DVE5962HB`) ↔ `320409-απορ-τηρας-καμι-90cm-aeg-dve5962hb-black`
    - («Hisense», `55U7Q`) ↔ `1-tv-hisense-55u7q`
    - («Candy», `GD 49B8-S`) ↔ `1-candy-gd-49b8-s-9kg` (δύο διαδοχικά κομμάτια)
    - («Candy», `CSO 496TWMB6/1-S`) ↔ `1-candy-cso-496twmb6-1-s`
  - `matchByModel` none:
    - `QE65QN85DATXXH` απέναντι στο `qe65qn90da`
    - `DVE5` (κοντό)
    - άλλη μάρκα στο slug
  - `matchByModel` ambiguous: δύο slug που ξεκινούν με `100u7se`.
  - `matchPhone`:
    - («Samsung», «MOBILE SAMSUNG SM-F971 GALAXY Z FOLD 8 5G 12GB / 512GB GRAPHITE») → `339348-smartphone-samsung-fold-8-512gb-graph-5g`, όχι το `…-256gb-…`, όχι τα `θηκη-…`
    - Fold 8 **Ultra** → όχι το απλό Fold 8
  - `isBundle`: «LG F4WV912P2E + ΔΩΡΟ Σύστημα Ατμού» → true· `kind="set"` → true.
  - `parseProduct`:
    - Offer 649.99 / Display 749.99 → `{offer: 649.99, list: 749.99}`
    - μόνο Display → `offer: null`
    - `price: []` → list και offer null
    - string HTML ή `{}` → `{error}`
  - `diffPct(829, 649.99) === 27.5`
  - `badgeState(0.4, true) === "eq"`
  - `badgeState(-7.7, true) === "down"`
  - `badgeState(5, false) === "gone"`
  - `badgeState(null, true) === "none"`
- [ ] **Step 2:** `npm test -- lib/competitors/kotsovolos/core.test.ts`. Αναμενόμενο: FAIL (δεν υπάρχει module).
- [ ] **Step 3: Υλοποίηση.**
  - Ο κανόνας μοντέλου είναι του spec: κομμάτια του slug και ζεύγη διαδοχικών κομματιών, το ένα αρχή του άλλου, το μικρότερο ≥ 5 χαρακτήρες με ψηφίο. Η μάρκα (ή το alias) πρέπει να υπάρχει στο `norm(last)`.
  - `matchPhone`: λέξεις μοντέλου από τον τίτλο (π.χ. `fold 8`, `ultra`/`ult`, `pro max`), μνήμη (`512gb`/`512g`, `1tb`) και πρόθεμα χρώματος (≥ 4 γράμματα). Αποκλείονται slugs με `θηκ|μεμβραν|τζαμ|γυαλι|set-`.
- [ ] **Step 4:** `npm test -- lib/competitors/kotsovolos/core.test.ts`. Αναμενόμενο: PASS.
- [ ] **Step 5: Commit**.

### Task 4: Client HTTP

**Files:**
- Create: `lib/competitors/kotsovolos/client.ts`, `lib/competitors/kotsovolos/pacer.ts`

**Interfaces:**
- Consumes: `parseSitemap`, `parseCategories`, `parseProduct` (Task 3).
- Produces:
  - `fetchSitemap(): Promise<KotItem[]>`
  - `fetchCategories(): Promise<{path;label}[]>`
  - `fetchProduct(art: string): Promise<ReturnType<typeof parseProduct>>`
  - `class KotStopError extends Error { reason: "blocked" | "errors" | "budget" | "window" }`
  - `createPacer(opts: { budget: number; until: Date; rand?: () => number; sleep?: (ms: number) => Promise<void>; now?: () => Date }): { wait(): Promise<void>; record(r: { status: number; ms: number; retryAfterS?: number }): Promise<void>; used: number }`. Καθαρή λογική (με εγχεόμενα `rand`/`sleep`/`now` για tests). Βάζει τις παύσεις, τα διαλείμματα, το όριο, το παράθυρο και το φρένο των Global Constraints. Ρίχνει `KotStopError`.
- Test: `lib/competitors/kotsovolos/pacer.test.ts`

- [ ] **Step 1: Tests του pacer με ψεύτικο ρολόι:**
  - 200 κλήσεις → κάθε παύση μέσα σε [3000, 7000] ms ή διάλειμμα [60000, 120000]
  - σε κάθε κινούμενο παράθυρο 60″ ≤ 20 κλήσεις
  - τουλάχιστον ένα διάλειμμα ανά 120 κλήσεις
  - η 1.801η κλήση ρίχνει `budget`
  - κλήση μετά το `until` ρίχνει `window`
  - 429 με `Retry-After: 30` → μία αναμονή 30″, το επόμενο 429 ρίχνει `blocked`
  - `Retry-After: 3600` → `blocked` αμέσως (πάνω από 10′)
  - 3 διαδοχικά 500 ρίχνουν `errors`, ενώ 2 και μετά 200 δεν ρίχνουν
  - χρόνος απόκρισης 3,5× του μέσου → οι επόμενες παύσεις στο [6000, 14000]
- [ ] **Step 2:** `npm test -- lib/competitors/kotsovolos/pacer.test.ts`. Αναμενόμενο: FAIL, μετά υλοποίηση, μετά PASS.
- [ ] **Step 3:** Υλοποίηση του client με `fetch`, `AbortSignal.timeout(15000)`, `redirect: "manual"`. Κάθε κλήση περνά από `pacer.wait()` / `pacer.record()`. Ένα 3xx μετρά ως `{error:"redirect"}`, όχι ως stop.
- [ ] **Step 4:** `npx tsx -e 'import("./lib/competitors/kotsovolos/client").then(async c=>{console.log((await c.fetchSitemap()).length, await c.fetchProduct("320409"))})'`. Αναμενόμενο: ~24000 και `{offer: <αριθμός>, …}`.
- [ ] **Step 5: Commit**.

### Task 5: Νυχτερινή εργασία

**Files:**
- Create: `lib/competitors/run.ts`
- Modify: `lib/scheduler/jobs.ts` (μία γραμμή στο `JOBS`)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `runCompetitorJob(trigger: "cron" | "manual", opts?: { categoryIds?: string[]; limit?: number }): Promise<JobResult>`
  - `ourPrice(p: { price: number | null; offer: { price: Decimal } | null }): number | null`

- [ ] **Step 1: Υλοποίησε τα βήματα 1–5 της ενότητας «Νυχτερινή εργασία» του spec.**
  - **Σειρά (οδηγία χρήστη):** (α) βρες τα κοινά προϊόντα, (β) πάρε τιμή Κωτσόβολου για τα κοινά, (γ) διάβασε κόστος (`readCosts`, Task 1) μόνο για τα κοινά και σώσε `cost/costSource/costAt`· αν το `readCosts` γυρνά `null`, κράτα το παλιό κόστος.
  - **Ένα ζευγάρι που βρέθηκε (`auto` ή `manual`) δεν ξαναψάχνεται:** σώζεται `extId`, `extUrl`, `extTitle` και τα επόμενα βράδια ζητείται μόνο η τιμή με το `extId`. Ταίριασμα τρέχει μόνο για προϊόντα χωρίς ζευγάρι, `suggested` και `lost`. Τα `rejected` δεν ξαναπροτείνονται (κράτα το απορριφθέν `extId` ώστε να εξαιρείται).
  - Τα `ambiguous` γράφονται ως `suggested` με το πρώτο υποψήφιο και `lastError = "πολλά υποψήφια (N)"`.
  - **Κανόνας μοντέλου (Ruling 7):** `matchByModel` → `matched` γράφεται `auto`, `suggested` γράφεται `suggested` (με `lastError = reason`).
  - **EAN (Ruling 8):** όταν φέρνεις ένα προϊόν, `sameEan(parsed.ean, product.ean)`. `true` → `auto` (αναβαθμίζει `suggested`· στα `ambiguous` φέρε έως 3 υποψήφιους και κράτα αυτόν με ίδιο EAN). `false` → ποτέ απόρριψη (οδηγία χρήστη: αν συμφωνεί ένα από τα δύο, πιθανό ζευγάρι): με μοντέλο matched/suggested → `suggested` με `lastError = "διαφορετικό EAN — έλεγξε"` (το `auto` υποβαθμίζεται), `manual` μένει με `lastError`· `rejectedExtIds` μόνο από τον διαχειριστή. `null` → κανόνας μοντέλου. Test στο `run`: ίδιο EAN αναβαθμίζει, διαφορετικό κάνει suggested, manual δεν αγγίζεται.
  - `extId` που λείπει από το sitemap ή API με 3xx/404/«χωρίς προϊόν» → `available=false`, `missCount+1`, χωρίς νέα κλήση· με `missCount ≥ 2` → `match="lost"`, `lastError="χάθηκε: <παλιό extUrl>"`, και ξαναψάχνεται την ίδια νύχτα. Επιτυχής τιμή → `missCount=0`.
  - Ιστορικό μόνο όταν άλλαξε η `offer ?? list` ή η `ourPrice`.
  - Στο `KotStopError` σταματά και επιστρέφει `ok:false` με όσα πρόλαβε.
  - Κλήσεις με σειρά παλαιότερου `checkedAt`, παράλειψη όσων ελέγχθηκαν τις τελευταίες 20 ώρες, pacer με `budget` 1.800 (cron) ή 300 (manual) και `until` = 06:00 της ημέρας.
  - `KotStopError("budget"|"window")` = κανονικό τέλος (`ok:true`, «συνεχίζει αύριο: N έμειναν»). `"blocked"|"errors"` = `ok:false`, και αύξηση του μετρητή νυχτών με φρένο στο setting· δεύτερη συνεχόμενη → `competitors.kotsovolos.paused = true`. Νύχτα χωρίς φρένο → μηδενίζει τον μετρητή.
  - Με `paused` η εργασία επιστρέφει `idle` χωρίς καμία κλήση.
- [ ] **Step 2:** Πρόσθεσε στο `JOBS`: `key: "competitor-kotsovolos"`, label «Τιμές Κωτσόβολου (σύγκριση)», `schedule: { dailyAt: [1, 0] }`, `group: "competitors"`, `maxMin: 320`.
- [ ] **Step 3:** Βάλε προσωρινά αντιστοιχίσεις για Τηλεοράσεις και Ψυγειοκαταψύκτες με `npx tsx -e` (upsert `CompetitorCategoryMap`). Τρέξε `runCompetitorJob("manual", { limit: 50 })` στο background (~5′ με τις παύσεις). Αναμενόμενο: ζευγάρια ≥ όσα του δείγματος (14 TV / 10 ψυγεία στα 25), χωρίς σφάλματα, γραμμές στο `CompetitorPrice`. Σύγκρινε 5 τυχαία με το kotsovolos.gr.
- [ ] **Step 4: Commit**.

### Task 6: Οθόνη αντιστοίχισης (mockup 1)

**Files:**
- Create: `app/admin/(shell)/catalog/competitors/page.tsx`, `app/admin/(shell)/catalog/competitors/actions.ts`, `components/admin/competitors/MappingTabs.tsx` (client: dropdowns, κουμπιά)
- Modify: `components/admin/nav.ts` (μετά την «Πληρότητα»: `{ href: "/admin/catalog/competitors", label: "Σύγκριση τιμών", icon: Scale, perm: "catalog.products.read" }`), `lib/help/content/index.ts`

**Interfaces:**
- Consumes: `fetchCategories` (Task 4, με cache 24 ωρών), `runCompetitorJob` (Task 5).
- Produces (server actions, κάθε αλλαγή με `catalog.products.write`):
  - `setCategoryMap(categoryId: string, extPath: string | null)`
  - `setBrandMap(brandId: string, patch: { alias?: string | null; notCarried?: boolean })`
  - `runNow(): Promise<JobResult>` (`catalog.sync.run`· τρέχει στο background, η σελίδα δείχνει πρόοδο από την τελευταία εκτέλεση)
  - `resumeJob()` (`catalog.sync.run`): σβήνει το `competitors.kotsovolos.paused` και τον μετρητή. Η κάρτα «Τελευταίος έλεγχος» δείχνει σε κόκκινο «Σε παύση: ο Κωτσόβολος μάς έκοψε» με αυτό το κουμπί, και κάτω από αυτήν «N από M τιμές ανανεώθηκαν απόψε · τα υπόλοιπα αύριο».

- [ ] **Step 1:** Φόρτωσε `unslop`, `ui-ux-pro-max`, `dataviz`.
- [ ] **Step 2: Σελίδα όπως το mockup 1.**
  - Τρεις καρτέλες. Ποιες κατηγορίες μας ανήκουν σε κάθε καρτέλα το ορίζει μια σταθερή λίστα ριζικών κατηγοριών στο `page.tsx`· διάβασε τα ονόματα από τη βάση.
  - Οι κατηγορίες χωρίς αντιστοίχιση παίρνουν πρόταση από το κοινό ριζικό της διαδρομής του Κωτσόβολου, ως `suggested`.
  - Κάρτες κατάστασης από την τελευταία εκτέλεση της εργασίας και από το `CompetitorPrice`.
  - Μάρκες με 0 ζευγάρια σε πορτοκαλί πλαίσιο.
- [ ] **Step 3:** Οδηγός βοήθειας + `data-help` (`competitors-tabs`, `competitors-categories`, `competitors-brands`, `competitors-status`).
- [ ] **Step 4:** `npm run build` χωρίς σφάλμα. Στο preview: αλλαγή μιας αντιστοίχισης, ανανέωση, η αλλαγή μένει. Έλεγχος σε 360px χωρίς οριζόντια κύλιση.
- [ ] **Step 5:** `npm run help:gen && npm run help:shots -- /admin/catalog/competitors`.
- [ ] **Step 6: Commit**.

### Task 7: Badge και panel προϊόντος (mockup 2)

**Files:**
- Create: `components/admin/competitors/CompetitorBadge.tsx`, `components/admin/competitors/CompetitorPanel.tsx`, `components/admin/competitors/PairPicker.tsx` (client: «Λάθος ζευγάρι»/«Βρες ζευγάρι», αναζήτηση στα slug της κατηγορίας)
- Modify: `app/admin/(shell)/catalog/[id]/page.tsx`, `components/admin/catalog/ProductTable.tsx` (νέα στήλη), το query της λίστας (φέρνει `CompetitorPrice` του προϊόντος), `app/admin/(shell)/catalog/competitors/actions.ts`, `lib/help/content/index.ts`

**Interfaces:**
- Consumes: `badgeState`, `diffPct` (Task 3).
- Produces:
  - `<CompetitorBadge price={CompetitorPrice | null} size="lg" | "sm" />`
  - actions `setPair(productId: string, art: string)` (→ `manual`, φέρνει αμέσως τιμή), `rejectPair(productId: string)` (→ `rejected`)

- [ ] **Step 1: Badge.**
  - Μορφή «+27,5% · Κωτσόβολος 649,99 €», με χρώματα και εικονίδια όπως στο mockup (up κόκκινο ▲, down πράσινο ▼, eq μπλε =, gone/none γκρι).
  - Κείμενο «gone» = «Δεν διατίθεται πια στον Κωτσόβολο».
  - Τα `suggested` δείχνουν «Πρόταση ζευγαριού · επιβεβαίωσε» αντί για ποσοστό.
- [ ] **Step 2: Panel.** Γράφημα 30 ημερών από το `CompetitorPriceHistory` (dataviz, δύο γραμμές βηματικές), το ζευγάρι με σύνδεσμο, οι τιμές καταλόγου/προσφοράς, το κουμπί «−0,10 €» (ενεργοποιείται στο Task 8) και ο `PairPicker`.
- [ ] **Step 3:** Οδηγός + `data-help` (`kotsovolos-badge`, `kotsovolos-chart`, `kotsovolos-pair`).
- [ ] **Step 4:** Build, preview σε ένα προϊόν Hisense του δείγματος (badge +27,5% ή η νέα τιμή με την προσφορά), έλεγχος σε 360px.
- [ ] **Step 5:** `help:gen`, `help:shots -- /admin/catalog/<id>`.
- [ ] **Step 6: Commit**.

### Task 8: Μαζική αλλαγή (mockup 3)

**Files:**
- Create: `lib/competitors/bulk-core.ts`, `lib/competitors/bulk-core.test.ts`, `lib/competitors/bulk.ts`, `app/admin/(shell)/catalog/competitors/prices/page.tsx`, `components/admin/competitors/BulkPrices.tsx` (client)
- Modify: `lib/softone/item-write.ts` (`writeWebPrice` opts: `expect?: number`), `lib/softone/item-write` tests αν υπάρχουν, `CompetitorPanel.tsx` (κουμπί −0,10 €), `lib/help/content/index.ts`

**Interfaces:**
- Consumes: `CompetitorPrice` με `cost/costSource/costAt` (Task 5· **όχι** ζωντανό `readCosts`), `writeWebPrice`.
- Produces:
  - `type Rule = { mode: "eur" | "pct"; amount: number; maxDropPct: number | null; minMarginPct: number | null; skipPromo: boolean; maxAgeH: number; raiseCheaper: boolean }`
  - `type Row = { productId: string; mtrl: number; now: number; web: number; theirs: number; checkedAt: Date; available: boolean; promo: boolean; cost: number | null; costAt: Date | null }`
  - `planRow(r: Row, rule: Rule, at: Date): { newPrice: number; changeEur: number; changePct: number } | { skip: "stale" | "gone" | "promo" | "max-drop" | "below-cost" | "no-cost" | "cheaper" | "same" }`
  - `previewBulk(filter: { categoryId?: string; brandId?: string; onlyExpensive: boolean }, rule: Rule)` (server)
  - `applyBulk(productIds: string[], rule: Rule, userId: string): Promise<{ batchId: string; ok: number; failed: number }>`
  - `undoBatch(batchId: string, userId: string)`
  - `writeWebPrice(..., { mode: "any", expect })`: αποτυγχάνει χωρίς εγγραφή όταν η ζωντανή τιμή ≠ `expect` (±0,005).

- [ ] **Step 1: Γράψε τα tests `bulk-core.test.ts`:**
  - (829, 649.99, eur 0.10, maxDrop 15) → `skip:"max-drop"`
  - (3499, 3299.99) → `newPrice 3299.89`, `changePct -5.7`
  - pct 1% πάνω σε 1000 → 990
  - `cost` 3200 + margin 5% με νέα 3299.89 → `below-cost`
  - `checkedAt` πριν από 37 ώρες → `stale`
  - `available:false` → `gone`
  - `promo:true` → `promo`
  - φθηνότεροι με `raiseCheaper:false` → `cheaper`
  - νέα τιμή = τωρινή → `same`
  - στρογγυλοποίηση: 0.1 + 0.2 χωρίς ουρά float
- [ ] **Step 2:** `npm test -- lib/competitors/bulk-core.test.ts`. Αναμενόμενο: FAIL.
- [ ] **Step 3:** Υλοποίησε το `planRow`. Πρόσθεσε το `expect` στη `writeWebPrice`, πριν από το `setData`: μετά το `readExtra`, `if (opts?.expect != null && !(cur != null && Math.abs(cur - opts.expect) < 0.005)) return fail(\`Η τιμή web άλλαξε στο μεταξύ (${cur ?? "—"} €) — δεν γράφτηκε.\`)`.
- [ ] **Step 4:** `npm test`. Αναμενόμενο: PASS όλα, και τα παλιά.
- [ ] **Step 5: `bulk.ts`.**
  - `previewBulk` παίρνει το κόστος από το `CompetitorPrice.cost`· `cost` null ή `costAt` > 36 ώρες με ενεργή δικλείδα κόστους → `skip:"no-cost"`. Το `Row` έχει και `web` (= `Product.price`, η τιμή web NUM04): βάση για `expect` και `oldPrice`, ενώ `now` (τιμή επισκέπτη) μένει για σύγκριση/εμφάνιση.
  - `applyBulk`: έλεγχος `catalog.sync.run`, `writeWebPrice(mtrl, newPrice, { mode: "any", expect: now })` μία τη φορά, γραμμές `PriceChangeLine`.
  - `undoBatch`: `writeWebPrice(mtrl, oldPrice, { mode: "any", expect: newPrice })` μόνο για `ok`. Αποτυχία expect → `undoOk=false`, `error="άλλαξε από άλλον"`.
  - Το `mtrl` προέρχεται από `Product.erpCode`.
- [ ] **Step 6: Σελίδα όπως το mockup 3.**
  - Φίλτρα, κανόνας, δικλείδες (δίπλα στο κόστος η πηγή του: «τελ. τιμή προμηθευτή» ή «τελ. τιμή αγοράς είδους»), σύνοψη, πίνακας με checkbox και λόγο αποκλεισμού, ιστορικό παρτίδων με «Αναίρεση».
  - Με κλειστό `webPriceWriteEnabled()` ή `itemWriteEnabled()`, το κουμπί είναι ανενεργό και λέει γιατί (`WEB_PRICE_OFF`).
  - Μετά την εφαρμογή: «Θα φανεί στο eshop στον επόμενο συγχρονισμό (έως 30′)».
  - Το «−0,10 €» του panel ανοίγει αυτή τη σελίδα φιλτραρισμένη στο προϊόν.
- [ ] **Step 7:** Οδηγός + `data-help` (`bulk-filters`, `bulk-rule`, `bulk-guards`, `bulk-summary`, `bulk-table`, `bulk-history`), `help:gen`, `help:shots -- /admin/catalog/competitors/prices`.
- [ ] **Step 8:** Build. Preview με κλειστή εγγραφή: η προεπισκόπηση των τηλεοράσεων Hisense δείχνει τα αποτελέσματα του `planRow`, χωρίς οριζόντια κύλιση στα 360px.
- [ ] **Step 9:** **Μόνο με ρητή έγκριση του χρήστη:** εφαρμογή σε ένα είδος, ανάγνωση πίσω στο SoftOne, αναίρεση, ανάγνωση πίσω.
- [ ] **Step 10: Commit**.

### Task 9: Τελικός έλεγχος

- [ ] **Step 1:** `npm test && npm run build`. Αναμενόμενο: PASS.
- [ ] **Step 2:** `runCompetitorJob("manual")` χωρίς όριο, στις τρεις καρτέλες. Σημείωσε διάρκεια, ζευγάρια και σφάλματα, και ενημέρωσε το spec αν η διάρκεια ξεπερνά τα 60′.
- [ ] **Step 3:** Σβήσε το `scripts/tmp-kotsovolos.ts`. Γράψε memory: ταίριασμα, endpoints, κατάσταση εγγραφής τιμής.
- [ ] **Step 4:** Πρότεινε στον χρήστη commit/PR με τη λίστα αρχείων.
