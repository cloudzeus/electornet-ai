# Καμπάνιες — Φάση 1 (δεδομένα & καμπάνιες) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Η «Καμπάνια» γίνεται φάκελος που ομαδοποιεί προσφορές, landing pages και banners, με οδηγό 5 βημάτων, λίστα, δημοσίευση / παύση / λήξη και τους δύο νέους ρόλους έγκρισης (η ροή έγκρισης έρχεται στη Φάση 2).

**Architecture:** Επέκταση του υπάρχοντος (αχρησιμοποίητου) πίνακα `Campaign` + `campaignId` σε `Promotion`, `LandingPage`, `AdPlacement`. Καθαρή λογική σε `lib/promo/campaign-core.ts` (με tests), server λογική σε `lib/promo/campaigns.ts` που ξαναχρησιμοποιεί `savePromotion` / `bulkPromotions` του `lib/promo/admin.ts`. Σελίδες κάτω από `/admin/prosfores/kampanies`, στα μοτίβα της διαχείρισης (λεπτή κολλητή κεφαλίδα, πυκνά πεδία).

**Tech Stack:** Next.js 16 (server components + server actions), Prisma (Postgres, κοινός με live), Tailwind 4, lucide-react, `node:test` μέσω `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-16-campaigns-approval-design.md` (ενότητες 2, 3, 5.1, 9 — Φάση 1)

## Global Constraints

- Αλλαγές σχήματος ΜΟΝΟ με SQL μέσω `DIRECT_URL` (`ADD COLUMN IF NOT EXISTS`, τίποτα καταστροφικό). Ποτέ `prisma db push`, ποτέ `prisma db seed` (το seed επαναφέρει όλους τους ρόλους στη βάση του live).
- Κωδικός καμπάνιας: `KAM-<έτος>-<3ψήφιο>` (π.χ. `KAM-2026-007`). Ο κωδικός προσφοράς `CMP-…` μένει ως έχει.
- Στόχοι καμπάνιας (`goal`): `sales | clearance | acquisition | launch | seasonal`.
- Καταστάσεις καμπάνιας: `draft | review | approved | scheduled | live | paused | ended | archived | rejected` (στη Φάση 1 χρησιμοποιούνται `draft | scheduled | live | paused | ended | archived`).
- Νέο δικαίωμα `catalog.promos.approve-finance`. Νέοι ρόλοι `commercial-director` «Εμπορική διεύθυνση» (`catalog.promos.write`, `catalog.promos.approve`, `catalog.products.read`, `reports.read`) και `finance-director` «Οικονομική διεύθυνση» (`catalog.promos.approve-finance`, `catalog.products.read`, `reports.read`).
- Όλες οι σελίδες: δικαίωμα `catalog.promos.write`· ελληνικά κείμενα· στοιχεία ≥44px στο κινητό (`min-h-11 md:min-h-9`), μεγέθη γραμματοσειράς μόνο με `var(--fs-…)`· καμία οριζόντια κύλιση από 360px· `data-help="…"` κυριολεκτικά στα κύρια σημεία.
- Help/wiki μετά από κάθε αλλαγή στη διαχείριση: `lib/help/content/index.ts` + `npm run help:gen` + `npm run help:shots -- <διαδρομή>` (οι σελίδες καμπανιών δεν έχουν προσωπικά δεδομένα).
- Commits με `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`· push μόνο μετά από «push it».

## Review Focus

- Προσφορά που ήδη ανήκει σε άλλη καμπάνια και προστίθεται σε νέα → μετακινείται, με προειδοποίηση «μετακινείται από KAM-…» (Task 3, Task 4).
- Αλλαγή ημερομηνιών καμπάνιας μετά τη δημοσίευση → οι προσφορές που πήραν τις ημερομηνίες της καμπάνιας ακολουθούν· όσες έχουν δικές τους εκτός ορίων εμφανίζονται ως προειδοποίηση (Task 2, Task 3).
- Δημοσίευση καμπάνιας όπου κάποιες προσφορές θέλουν έγκριση → η καμπάνια δημοσιεύεται, οι προσφορές αυτές μένουν «Για έγκριση» και η καρτέλα το λέει με πλήθος (Task 3, Task 4).
- Αρχειοθέτηση καμπάνιας ΔΕΝ διαγράφει / αρχειοθετεί τις προσφορές της· απλώς λήγουν όσες είναι ζωντανές (Task 3).
- Budget κενό ή 0 → καμία διαίρεση με το μηδέν· δαπάνη πάνω από budget → κόκκινη ένδειξη «υπέρβαση» (Task 2, Task 4).

---

### Task 1: Σχήμα, δικαίωμα και ρόλοι

**Files:**
- Modify: `prisma/schema.prisma` (model `Campaign` γραμμή ~1547, `Promotion` ~2264, `LandingPage` ~2409, `AdPlacement` ~2431)
- Modify: `lib/rbac/permissions.ts` (μετά το `catalog.promos.approve`)
- Modify: `prisma/roles.ts` (δύο νέοι ρόλοι μετά τον `marketer`)
- Create: `scripts/apply-campaigns.ts`

**Interfaces:**
- Produces: `Campaign { id, slug, title, tagSlug?, code @unique, goal @default("sales"), brief?, startsAt, endsAt, status @default("draft"), budgetEur Decimal(12,2)?, ownerId?, createdById?, version @default(1), approvals Json?, submittedAt?, createdAt, updatedAt, promotions Promotion[], landings LandingPage[], ads AdPlacement[] }`· `Promotion.campaignId String?` (+ `@@index([campaignId])`), `LandingPage.campaignId String?`, `AdPlacement.campaignId String?` με `onDelete: SetNull`.

- [ ] **Step 1:** Επέκτεινε τα models όπως παραπάνω (ο `slug` μένει υποχρεωτικός: = κωδικός σε πεζά).
- [ ] **Step 2:** Τρέξε `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/diff.sql` και κράτα ΜΟΝΟ τις εντολές για `Campaign`, `Promotion.campaignId`, `LandingPage.campaignId`, `AdPlacement.campaignId` (+ index / FK). Γράψε τες στο `scripts/apply-campaigns.ts` ως `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / FK με έλεγχο ύπαρξης, ώστε το script να ξανατρέχει χωρίς σφάλμα.
- [ ] **Step 3:** Στο ίδιο script: upsert του δικαιώματος `catalog.promos.approve-finance` και δημιουργία των δύο ρόλων **μόνο αν δεν υπάρχουν** (δεν αγγίζει άλλους ρόλους). Σύνδεση με `DIRECT_URL`.
- [ ] **Step 4:** `npx tsx scripts/apply-campaigns.ts` δύο φορές. Αναμενόμενο: 1η «εφαρμόστηκε», 2η «τίποτα να γίνει», χωρίς σφάλμα. Μετά `npx prisma generate` και `npx tsc --noEmit -p .` καθαρό.
- [ ] **Step 5:** Επιβεβαίωση: ερώτημα στις στήλες `information_schema.columns` για τους 4 πίνακες δείχνει τις νέες στήλες· `/admin/roles` δείχνει τους δύο ρόλους.
- [ ] **Step 6:** Commit `Καμπάνιες (Φ1): σχήμα, δικαίωμα οικονομικής έγκρισης, ρόλοι Εμπορική / Οικονομική διεύθυνση`.

### Task 2: Καθαρή λογική καμπάνιας

**Files:**
- Create: `lib/promo/campaign-core.ts`
- Test: `lib/promo/campaign-core.test.ts`

**Interfaces:**
- Produces:
  - `type CampaignGoal = "sales" | "clearance" | "acquisition" | "launch" | "seasonal"`
  - `CAMPAIGN_GOALS: Record<CampaignGoal, { label: string; help: string; measures: string }>` (π.χ. clearance → «Εκκαθάριση αποθέματος» · «Μετράμε τεμάχια που έφυγαν και απόθεμα που έμεινε»)
  - `type CampaignStatus = "draft" | "review" | "approved" | "scheduled" | "live" | "paused" | "ended" | "archived" | "rejected"`
  - `CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad" }>`
  - `liveState(start: Date, end: Date, now: Date): "scheduled" | "live" | "ended"`
  - `interface CampaignDraft { id?: string; title: string; goal: CampaignGoal; brief?: string; startsAt: string | null; endsAt: string | null; budgetEur: number | null; ownerId?: string | null }`
  - `validateCampaign(d: CampaignDraft, promos: { id: string; name: string; startsAt: Date | null; endsAt: Date | null }[], opts: { publish: boolean; now: Date }): { errors: string[]; warnings: string[] }`
  - `nextCampaignCode(existing: string[], year: number): string`
  - `budgetUse(spent: number, budget: number | null): { pct: number | null; over: boolean; left: number | null }`

- [ ] **Step 1: Tests**
```ts
test("κωδικός: επόμενος της χρονιάς, ξεκινά από 001", () => {
  assert.equal(nextCampaignCode([], 2026), "KAM-2026-001");
  assert.equal(nextCampaignCode(["KAM-2026-007", "KAM-2026-002", "KAM-2025-030"], 2026), "KAM-2026-008");
});
test("κατάσταση από ημερομηνίες", () => {
  const s = new Date("2026-11-20"), e = new Date("2026-11-30");
  assert.equal(liveState(s, e, new Date("2026-11-01")), "scheduled");
  assert.equal(liveState(s, e, new Date("2026-11-25")), "live");
  assert.equal(liveState(s, e, new Date("2026-12-01")), "ended");
});
test("έλεγχος: όνομα, ημερομηνίες, λήξη πριν την έναρξη", () => {
  const now = new Date("2026-10-16");
  const r = validateCampaign({ title: "", goal: "sales", startsAt: "2026-11-30", endsAt: "2026-11-20", budgetEur: null }, [], { publish: true, now });
  assert.ok(r.errors.some((e) => e.includes("όνομα")));
  assert.ok(r.errors.some((e) => e.includes("λήξη")));
});
test("έλεγχος: δημοσίευση χωρίς προσφορές = λάθος, πρόχειρο = προειδοποίηση", () => {
  const d = { title: "Black Friday 2026", goal: "sales" as const, startsAt: "2026-11-20", endsAt: "2026-11-30", budgetEur: 10000 };
  const now = new Date("2026-10-16");
  assert.ok(validateCampaign(d, [], { publish: true, now }).errors.some((e) => e.includes("προσφορά")));
  assert.ok(validateCampaign(d, [], { publish: false, now }).warnings.some((e) => e.includes("προσφορά")));
});
test("έλεγχος: προσφορά με δικές της ημερομηνίες εκτός καμπάνιας → προειδοποίηση με το όνομά της", () => {
  const d = { title: "BF", goal: "sales" as const, startsAt: "2026-11-20", endsAt: "2026-11-30", budgetEur: null };
  const r = validateCampaign(d, [{ id: "p1", name: "TV −20%", startsAt: new Date("2026-11-10"), endsAt: new Date("2026-11-25") }], { publish: true, now: new Date("2026-10-16") });
  assert.ok(r.warnings.some((w) => w.includes("TV −20%")));
});
test("έλεγχος: λήξη στο παρελθόν μπλοκάρει τη δημοσίευση", () => {
  const r = validateCampaign({ title: "Παλιά", goal: "sales", startsAt: "2026-01-01", endsAt: "2026-01-10", budgetEur: null }, [{ id: "p", name: "x", startsAt: null, endsAt: null }], { publish: true, now: new Date("2026-10-16") });
  assert.ok(r.errors.some((e) => e.includes("παρελθόν")));
});
test("budget: χωρίς budget, κανονικό, υπέρβαση", () => {
  assert.deepEqual(budgetUse(500, null), { pct: null, over: false, left: null });
  assert.deepEqual(budgetUse(0, 0), { pct: null, over: false, left: null });
  assert.deepEqual(budgetUse(2500, 10000), { pct: 25, over: false, left: 7500 });
  assert.equal(budgetUse(12000, 10000).over, true);
});
```
- [ ] **Step 2:** `npx tsx --test lib/promo/campaign-core.test.ts` → FAIL (δεν υπάρχει το module).
- [ ] **Step 3:** Υλοποίηση στο `lib/promo/campaign-core.ts` (χωρίς server-only, χωρίς δίκτυο).
- [ ] **Step 4:** Ίδια εντολή → PASS· `npm test` όλα πράσινα.
- [ ] **Step 5:** Commit.

### Task 3: Server λογική καμπανιών

**Files:**
- Create: `lib/promo/campaigns.ts`
- Modify: `lib/promo/admin.ts` (`PromoDraft` + `dataOf` + `draftOf` δέχονται `campaignId?: string | null`)

**Interfaces:**
- Consumes: Task 2 (`validateCampaign`, `nextCampaignCode`, `liveState`, `budgetUse`), `savePromotion(d, staff, "publish")`, `draftOf(p)`, `bulkPromotions(ids, action, staffId)` από `lib/promo/admin.ts`.
- Produces:
  - `type CampaignRow = { id; code; title; goal; status: CampaignStatus; startsAt: Date; endsAt: Date; budgetEur: number | null; spent: number; counts: { promos: number; pending: number; landings: number; ads: number; coupons: number } }`
  - `listCampaigns(f: { status?: string; q?: string }): Promise<{ rows: CampaignRow[]; counts: Record<string, number> }>`
  - `getCampaign(id: string)` → καμπάνια + προσφορές (`id, code, name, status, mechanism, startsAt, endsAt, usedCount`), landings, ads, κουπόνια των προσφορών, `spent`, και `available` (προσφορές / landings / ads που μπορούν να προστεθούν, με `campaignCode` αν ανήκουν σε άλλη)
  - `saveCampaign(d: CampaignDraft, staffId: string): Promise<{ ok: true; id: string; code: string } | { ok: false; errors: string[] }>`
  - `setMembership(campaignId: string, kind: "promotion" | "landing" | "ad", ids: string[], attach: boolean): Promise<{ moved: string[] }>` (όσα μετακινήθηκαν από άλλη καμπάνια: κωδικοί)
  - `publishCampaign(id: string, staff: { id: string; canApprove: boolean }): Promise<{ ok: boolean; errors: string[]; warnings: string[]; published: number; pending: number }>` — προσφορές χωρίς ημερομηνίες παίρνουν τις ημερομηνίες της καμπάνιας· κάθε πρόχειρη προσφορά → `savePromotion(draftOf(p), staff, "publish")`· landings / ads της καμπάνιας με κενές ημερομηνίες παίρνουν τις ίδιες· `status = liveState(...)`
  - `setCampaignState(id: string, action: "pause" | "resume" | "end" | "archive", staffId: string): Promise<{ ok: boolean; error?: string }>` — pause/resume/end εφαρμόζονται και στις ζωντανές προσφορές (`bulkPromotions`)· archive = end + `status: "archived"`, ΧΩΡΙΣ αρχειοθέτηση / διαγραφή προσφορών
  - `syncCampaignDates(id: string)` — όταν αλλάζουν οι ημερομηνίες καμπάνιας, ενημερώνει όσες προσφορές είχαν τις ίδιες με τις παλιές της καμπάνιας

- [ ] **Step 1:** Υλοποίηση. `spent` = άθροισμα `PromotionUsage.amount` των προσφορών της καμπάνιας (ένα groupBy για τη λίστα). Κάθε αλλαγή γράφει `audit(staffId, "campaign.<ενέργεια>", "Campaign", id, before, after)` και καλεί `refreshStorefront()` όταν αλλάζει κάτι ζωντανό.
- [ ] **Step 2:** Επαλήθευση με προσωρινό script (`scripts/tmp-campaign.ts`, `--conditions=react-server`): δημιουργία καμπάνιας «ΔΟΚΙΜΗ Φ1» με μία ΠΡΟΧΕΙΡΗ προσφορά «ΔΟΚΙΜΗ Φ1» (στόχος ένα προϊόν, −5 %, ημερομηνίες σε 2030), `setMembership` (και μετακίνηση από 2η καμπάνια → `moved` περιέχει τον κωδικό), `publishCampaign` → `published: 1` και η προσφορά παίρνει τις ημερομηνίες, `setCampaignState("pause")` → η προσφορά σε παύση, `archive` → η προσφορά ΔΕΝ είναι archived. Στο τέλος διαγραφή όλων των δοκιμαστικών (καμπάνιες, προσφορά, εκδόσεις, audit γραμμές με entityId τους) και του script. Ημερομηνίες 2030 ώστε να μην εμφανιστεί τίποτα στο live.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npx eslint lib/promo` καθαρά. Commit.

### Task 4: Σελίδες καμπανιών και οδηγός 5 βημάτων

**Files:**
- Create: `app/admin/(shell)/prosfores/kampanies/page.tsx` (λίστα)
- Create: `app/admin/(shell)/prosfores/kampanies/[id]/page.tsx` (καρτέλα / οδηγός· `id === "new"` για νέα)
- Create: `app/admin/(shell)/prosfores/kampanies/actions.ts`
- Create: `components/admin/promos/CampaignWizard.tsx` (client)
- Modify: `components/admin/promos/PromoTabs.tsx` (νέα ομάδα «Καμπάνιες» πρώτη: `{ key: "campaigns", href: "/admin/prosfores/kampanies", label: "Καμπάνιες", Icon: FolderKanban }`)
- Modify: `lib/promo/help.ts` (`PAGE_HELP.campaigns`)

**Interfaces:**
- Consumes: Task 2 (`CAMPAIGN_GOALS`, `CAMPAIGN_STATUS`, `budgetUse`), Task 3 (όλα).
- Produces: server actions `saveCampaignAction(d: CampaignDraft)`, `membershipAction(id, kind, ids, attach)`, `publishCampaignAction(id)`, `campaignStateAction(id, action)` — όλα με `requirePermission("catalog.promos.write")`, `revalidatePath("/admin/prosfores/kampanies")`.

Λίστα: λεπτή κεφαλίδα (τίτλος, πλήθος, «Νέα καμπάνια»), φίλτρα κατάστασης με πλήθη (Σε εξέλιξη · Προγραμματισμένες · Πρόχειρες · Σε παύση · Έληξαν · Όλες), αναζήτηση (όνομα / κωδικός)· πίνακας στο desktop, κάρτες στο κινητό: κωδικός, όνομα, στόχος, ημερομηνίες, κατάσταση, περιεχόμενα (προσφορές · landing · banners, «N για έγκριση»), μπάρα budget (`budgetUse`, κόκκινη σε υπέρβαση). Κενή κατάσταση με εξήγηση και κουμπί.

Οδηγός (ui-ux-pro-max: «Βήμα Χ από 5», πίσω / μπροστά χωρίς απώλεια, αυτόματη αποθήκευση προχείρου, λάθη δίπλα στο πεδίο, ορατή εξήγηση κάτω από κάθε πεδίο, πλαϊνή σύνοψη που στο κινητό αναδιπλώνεται):
1. **Στόχος & ημερομηνίες** — όνομα, στόχος (κάρτες επιλογής με `help` + «τι μετράμε»), σύντομη περιγραφή, έναρξη / λήξη. Εξήγηση: η λήξη οδηγεί κάθε αντίστροφη μέτρηση· οι προσφορές χωρίς δικές τους ημερομηνίες τις ακολουθούν.
2. **Budget** — μέγιστο κόστος εκπτώσεων (προαιρετικό) με εξήγηση τι μετράει («το άθροισμα των εκπτώσεων που δόθηκαν»), τρέχουσα δαπάνη. Σημείωση ότι η εκτίμηση κόστους και η χρηματοδότηση κατασκευαστών έρχονται με την έγκριση (Φάση 2–3).
3. **Περιεχόμενα** — τρεις ενότητες (Προσφορές, Landing pages, Banners): λίστα με όσα ανήκουν + «Προσθήκη» από αναζητήσιμη λίστα των διαθέσιμων (με ετικέτα «σε KAM-… — θα μετακινηθεί»), «Αφαίρεση», «Νέα προσφορά σε αυτή την καμπάνια» → `/admin/prosfores/new?campaign=<id>`.
4. **Προβολή** — για κάθε landing / banner: κατάσταση, θέση, ημερομηνίες, σύνδεσμος προεπισκόπησης / επεξεργασίας· προειδοποίηση αν η καμπάνια δεν έχει καμία προβολή.
5. **Έλεγχος & δημοσίευση** — `validateCampaign` (λάθη / προειδοποιήσεις με σύνδεσμο στο βήμα τους), σύνοψη, «Δημοσίευση» (ή «Αποθήκευση πρόχειρου»)· μετά τη δημοσίευση: μήνυμα «Δημοσιεύτηκαν N · M περιμένουν έγκριση». Σε δημοσιευμένη καμπάνια: Παύση / Συνέχεια / Λήξη / Αρχειοθέτηση με επιβεβαίωση μέσα στη σελίδα.

- [ ] **Step 1:** Υλοποίηση λίστας, καρτέλας, οδηγού, actions, PromoTabs, PAGE_HELP.
- [ ] **Step 2:** Έλεγχος στο τοπικό (`localhost:3111`, συνδεδεμένος χρήστης): δημιουργία καμπάνιας «ΔΟΚΙΜΗ Φ1» από το UI, όλα τα βήματα, προσθήκη μιας πρόχειρης δοκιμαστικής προσφοράς, δημοσίευση με ημερομηνίες 2030, παύση, αρχειοθέτηση· 360px (`resize_window` mobile) χωρίς οριζόντια κύλιση (`scrollWidth - innerWidth === 0`), κονσόλα χωρίς σφάλματα. Διαγραφή των δοκιμαστικών στο τέλος.
- [ ] **Step 3:** `tsc`, `eslint`, `npm test` καθαρά. Commit.

### Task 5: Προσφορές ↔ καμπάνια

**Files:**
- Modify: `app/admin/(shell)/prosfores/new/page.tsx` (διαβάζει `?campaign=` και το περνά στον οδηγό)
- Modify: `components/admin/promos/PromoWizard.tsx` (πεδίο «Καμπάνια» στο βήμα «Έλεγχος» — επιλογή από καμπάνιες σε πρόχειρο / προγραμματισμένες / σε εξέλιξη, με «Χωρίς καμπάνια»· με `?campaign` προεπιλεγμένη)
- Modify: `app/admin/(shell)/prosfores/page.tsx` + `components/admin/promos/PromoTable.tsx` (στήλη / ετικέτα καμπάνιας με σύνδεσμο, φίλτρο `?c=<campaignId>`)
- Modify: `app/admin/(shell)/prosfores/[id]/page.tsx` (γραμμή «Καμπάνια: KAM-… · όνομα →»)
- Modify: `app/admin/(shell)/prosfores/selides/page.tsx`, `app/admin/(shell)/prosfores/theseis/page.tsx` (ετικέτα καμπάνιας)

**Interfaces:**
- Consumes: `PromoDraft.campaignId` (Task 3).

- [ ] **Step 1:** Υλοποίηση. Προσφορά μέσα σε καμπάνια που ΔΕΝ έχει δημοσιευτεί: το κουμπί «Δημοσίευση» του οδηγού προσφοράς γράφει «Αποθήκευση — δημοσιεύεται με την καμπάνια» και αποθηκεύει ως πρόχειρο.
- [ ] **Step 2:** Έλεγχος στο τοπικό: νέα προσφορά από την καμπάνια → εμφανίζεται στη λίστα της καμπάνιας και με ετικέτα στη λίστα προσφορών· φίλτρο `?c=` δουλεύει. Διαγραφή δοκιμαστικών.
- [ ] **Step 3:** `tsc`, `eslint`, `npm test`. Commit.

### Task 6: Ορολογία — τέλος στη σύγχυση

**Files:**
- Modify: `components/admin/nav.ts:75` — label «Key visuals κατασκευαστών»
- Modify: `lib/cms/home-sections.ts:56` — label «Key visuals κατασκευαστών» (και το help της ενότητας)
- Modify: `lib/rbac/permissions.ts` — περιγραφή `cms.campaigns.write` → «Key visuals κατασκευαστών (CMS)»
- Modify: `app/admin/(shell)/prosfores/anafores/page.tsx` + `lib/promo/help.ts` — «ανά καμπάνια» → «ανά προσφορά» όπου εννοείται μία προσφορά

- [ ] **Step 1:** `grep -rn "καμπάνι" app components lib` και αλλαγή μόνο όπου η λέξη σημαίνει «μία προσφορά» ή τις κάρτες του CMS. Το νέο «Καμπάνιες» στις Προσφορές μένει.
- [ ] **Step 2:** `tsc`, `eslint`, `npm test`. Commit.

### Task 7: Βοήθεια, screenshots, τελικός έλεγχος

**Files:**
- Modify: `lib/help/content/index.ts` (νέοι οδηγοί `/admin/prosfores/kampanies` και `/admin/prosfores/kampanies/[id]` με parts για κάθε `data-help` και tasks «Φτιάχνω καμπάνια», «Προσθέτω προσφορές», «Δημοσιεύω / σταματώ»· ενημέρωση `/admin/prosfores` και `/admin/roles` για τους νέους ρόλους)
- Modify: `lib/help/generated.json`, `help-shots/**` (παράγονται)

- [ ] **Step 1:** Οδηγοί + `npm run help:gen` χωρίς «χωρίς περιγραφή» / «δεν υπάρχει πια».
- [ ] **Step 2:** `npm run help:shots -- /admin/prosfores/kampanies` (συνδέεται ο χρήστης αν έχει λήξει η συνεδρία).
- [ ] **Step 3:** Τελικό `tsc`, `eslint`, `npm test`, έλεγχος desktop + 360px. Commit `Καμπάνιες (Φ1): …` και αναφορά στον χρήστη· push μόνο με «push it».
