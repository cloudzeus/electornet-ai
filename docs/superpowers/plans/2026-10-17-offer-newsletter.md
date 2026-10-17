# Newsletter προσφοράς Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Από μια προσφορά ή καμπάνια φτιάχνεται αυτόματο εικαστικό newsletter (AI κείμενα + προϊόντα + key visual), επεξεργάζεται, δοκιμάζεται και στέλνεται τώρα ή σε προγραμματισμένη ώρα μέσω Mailgun batch, με διαγραφή one-click, webhooks και στατιστικά.

**Architecture:** Καθαρή λογική σε `lib/newsletter/core.ts` (κοινό, έλεγχος γεγονότων AI, ώρα, πακέτα, υπογραφή) και `lib/newsletter/render.ts` (blocks → HTML/text). Server: `draft.ts` (πρόχειρο από προσφορά/καμπάνια + AI), `dispatch.ts` (διεκδίκηση, ουρά παραληπτών, πακέτα Mailgun, `tickNewsletters` στο cron ανά λεπτό). Routes για διαγραφή, webhooks Mailgun και προβολή στον browser· διαχείριση κάτω από τις Προσφορές.

**Tech Stack:** Next.js 16, Prisma (Postgres κοινός με live), node:test, Mailgun HTTP API, lib/ai (openrouter).

**Spec:** `docs/superpowers/specs/2026-10-17-offer-newsletter-design.md`

## Global Constraints
- Σχήμα μόνο με SQL μέσω `DIRECT_URL` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), ποτέ `db push` / seed· μετά `prisma generate` + επανεκκίνηση dev server.
- Παραλήπτες = `NewsletterSubscriber.status = subscribed` ∪ πελάτες με `marketingAllowed`, ένα ανά email (πεζά), εξαιρέσεις unsubscribed / bounced / complained / τελευταία συναίνεση «όχι».
- Αποστολή μόνο με δοκιμή μετά την τελευταία αλλαγή (`testHash === contentHash`)· προσφορά scheduled|active και όχι `held`, καμπάνια scheduled|live· προγραμματισμός 5′–30 ημέρες, ώρα Ελλάδας.
- Πακέτα 1.000, έως 5 ανά λεπτό (Mailgun)· χωρίς Mailgun έως 60 ανά λεπτό με `sendMail`· 3 προσπάθειες· > 20 % αποτυχίες → `paused`.
- Headers: `h:List-Unsubscribe: <https://…/api/newsletter/u/<token>>, <mailto:…>`, `h:List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- UTM: `utm_source=newsletter&utm_medium=email&utm_campaign=<κωδικός>&utm_content=<block>`.
- Όρια κειμένων AI: θέμα ≤ 60, preheader ≤ 110, εισαγωγή ≤ 400, κουμπί ≤ 24 χαρακτήρες.
- Πραγματικά emails μόνο στο email του χρήστη (δοκιμή / Mailgun `o:testmode`)· ποτέ σε πελάτες χωρίς ρητή εντολή. Δοκιμαστικά newsletters με τίτλο «ΔΟΚΙΜΗ 2030», διαγραφή μετά.
- Μυστικά (Mailgun webhook signing key) τα περνά ο χρήστης στις Ρυθμίσεις· ποτέ στη συζήτηση.
- UI: ui-ux-pro-max, `min-h-11 md:min-h-9`, `var(--fs-…)`, χωρίς οριζόντια κύλιση από 360px, `data-help` κυριολεκτικά, `npm run help:gen`.
- Push μόνο με «push it».

## Review Focus
- Ίδιο email σε συνδρομητή (unsubscribed) και πελάτη με συναίνεση «ναι» → **εξαιρείται** (η διαγραφή κερδίζει) — test στο Task 2.
- Διπλό tick του cron την ίδια στιγμή → ένα newsletter δεν διεκδικείται / δεν στέλνεται δύο φορές — test στο Task 5 (`claimDue` με δύο κλήσεις).
- Κείμενο AI με ποσοστό ή ημερομηνία που δεν υπάρχει στην προσφορά → πρότυπο, όχι το κείμενο AI — test στο Task 2.
- Τίτλος προϊόντος / κείμενο διαχειριστή με `<script>` ή `&` → διαφυγή στο HTML — test στο Task 3.
- Προσφορά που έληξε ή μπήκε σε αναμονή μεταξύ προγραμματισμού και ώρας αποστολής → `cancelled` με λόγο, κανένα email — test στο Task 5 (`startCheck`).

---

### Task 1: Σχήμα και ρύθμιση
**Files:** Modify `prisma/schema.prisma` · Create `scripts/apply-newsletter.ts` · Modify `lib/settings/schema.ts` (email: νέο πεδίο)
**Produces:** μοντέλα `Newsletter`, `NewsletterRecipient`, `NewsletterEvent` ακριβώς όπως §3 του spec (σχέσεις: `Newsletter.recipients`, `NewsletterRecipient.newsletter` onDelete Cascade, `NewsletterEvent.recipientId` χωρίς FK)· πεδίο ρυθμίσεων `mailgunWebhookKey` (type secret, group transport, showIf transport mailgun, help «Mailgun → Sending → Webhooks → HTTP webhook signing key»).
- [ ] Μοντέλα στο schema · script με `CREATE TABLE IF NOT EXISTS` + δείκτες/unique (δύο εκτελέσεις χωρίς σφάλμα) · `npx prisma generate` · `npx tsc --noEmit` καθαρό · commit.

### Task 2: Καθαρή λογική
**Files:** Create `lib/newsletter/core.ts`, test `lib/newsletter/core.test.ts`
**Produces:**
- `type Block = { type: "hero"; image?: string | null; alt: string; href: string; headline: string; sub: string } | { type: "text"; body: string } | { type: "products"; ids: string[] } | { type: "cta"; label: string; href: string }`
- `contentHash(n: { subject: string; preheader: string; blocks: Block[] }): string` (sha256 σταθερού JSON)
- `audienceOf(input: { subscribers: { id: string; email: string; status: string; firstName?: string | null; customerId?: string | null }[]; customers: { id: string; email: string | null; firstName?: string | null; allowed: boolean }[]; segment?: Set<string> | null }): { email: string; subscriberId: string | null; customerId: string | null; firstName: string | null }[]`
- `factCheck(text: string, facts: string[]): boolean` — κάθε `\d+([.,]\d+)?\s?(%|€)` και κάθε ημερομηνία `\d{1,2}/\d{1,2}` του κειμένου υπάρχει (κανονικοποιημένη) σε κάποιο από τα facts
- `validateSchedule(at: Date, now: Date): { ok: true; night: boolean } | { ok: false; error: string }` (night = 22:00–08:00 ώρα Ελλάδας)
- `batches<T>(rows: T[], size: number): T[][]`
- `recipientVariables(rows: { email: string; token: string; firstName: string | null }[], base: string): Record<string, { unsub: string; name: string }>`
- `verifyMailgun(sig: { timestamp: string; token: string; signature: string }, key: string, nowSec: number): boolean` (HMAC-SHA256 hex, timing-safe, απόρριψη > 900 s)
- [ ] Tests (RED): `audienceOf` — διπλό email σε διαφορετικά κεφαλαία → μία γραμμή με subscriberId· pending συνδρομητής εκτός· **unsubscribed συνδρομητής + πελάτης allowed ίδιο email → εκτός**· πελάτης allowed=false εκτός· με segment: πελάτης εκτός κοινού εκτός, συνδρομητής χωρίς customerId εκτός· άκυρο email εκτός. `factCheck("Έως −20% έως 31/10", ["20%", "31/10/2026"]) === true`, `factCheck("−30% μόνο σήμερα", ["20%"]) === false`, κείμενο χωρίς αριθμούς → true. `validateSchedule` 4′ μπροστά → error, 31 ημέρες → error, 23:30 Αθήνα → night true. `batches` 2.500/1.000 → [1000,1000,500]. `recipientVariables` → unsub `<base>/api/newsletter/u/<token>`. `verifyMailgun` σωστή υπογραφή true, λάθος false, timestamp 1000 s πίσω false. `contentHash` ίδιο για ίδια είσοδο, διαφορετικό όταν αλλάζει ένα block.
- [ ] GREEN · `npm test` · commit.

### Task 3: Απόδοση email
**Files:** Create `lib/newsletter/render.ts`, test `lib/newsletter/render.test.ts`
**Consumes:** `Block` (Task 2), `BRAND`, `EmailCtx` από `lib/email/layout.ts` (το ctx περνιέται ως όρισμα — η render δεν διαβάζει ρυθμίσεις, ώστε να είναι καθαρή).
**Produces:** `renderNewsletter(input: { subject: string; preheader: string; blocks: Block[]; products: Map<string, { title: string; brand: string; image: string | null; href: string; price: number; listPrice: number | null }>; ctx: EmailCtx; utm: string; unsubscribe: string; viewUrl: string | null }): { html: string; text: string }` — `unsubscribe` είναι URL ή το placeholder `%recipient.unsub%`.
- [ ] Tests (RED): τίτλος προϊόντος `<script>&` → `&lt;script&gt;&amp;` στο HTML· κάθε `href` προς το site έχει το `utm` (και `utm_content` = τύπος block)· το unsubscribe εμφανίζεται στο HTML και στο text· preheader στο κρυφό div· προϊόν με listPrice > price → διαγραμμένη τιμή· id προϊόντος που λείπει από το map παραλείπεται· text χωρίς HTML tags.
- [ ] GREEN (πίνακες + inline styles, 2 στήλες με fallback 1 σε στενή οθόνη μέσω `@media` στο `<style>`) · commit.

### Task 4: Πρόχειρο από προσφορά / καμπάνια
**Files:** Create `lib/newsletter/draft.ts` (server-only)
**Consumes:** `promotionProductIds` (lib/promo/landing.ts), `autoLabel` (lib/promo/catalog.ts), `chat`/`getAi`/`overBudget`/`parseJson` (lib/ai/openrouter.ts), `factCheck`, `Block`.
**Produces:**
- `draftFromPromotion(promotionId: string, staffId: string): Promise<{ id: string }>` και `draftFromCampaign(campaignId: string, staffId: string): Promise<{ id: string }>` — δημιουργούν `Newsletter` (status draft, `contentHash`).
- `newsletterFacts(n): Promise<string[]>` (όνομα, μηχανισμός, ποσά/ποσοστά, λήξη dd/mm/yyyy, όροι, τιμές προϊόντων)
- `aiCopy(facts: string[], field?: "subject" | "preheader" | "intro" | "cta"): Promise<{ subject: string; preheader: string; intro: string; cta: string }>` — feature `"newsletter"`, json, reasoning low· κάθε πεδίο κόβεται στο όριο και περνά `factCheck`, αλλιώς το πρότυπο (`«${label} — έως ${λήξη}»` κ.λπ.).
- `productCards(ids: string[]): Promise<Map<...>>` (ίδιο σχήμα με το `products` του Task 3· μόνο ενεργά προϊόντα που φαίνονται στο site, με τιμή από `ProductOffer` αλλιώς `price`, πρώτη φωτογραφία).
- Hero: πρώτη published `LandingPage` της προσφοράς/καμπάνιας (εικόνα από block hero αν υπάρχει) ή ενεργή `AdPlacement.image`· κουμπί στη landing, αλλιώς `/prosfores/<slug>`.
- [ ] Επαλήθευση με script (`npx tsx --conditions=react-server scripts/tmp-nl-draft.ts`): πρόχειρο για μία ενεργή προσφορά → εκτύπωση θέματος, πλήθους προϊόντων, hero· αποτυχημένο AI (κενό κλειδί μέσω override) → πρότυπα· διαγραφή του προχείρου και του script · commit.

### Task 5: Αποστολή
**Files:** Create `lib/newsletter/dispatch.ts` (server-only) · Modify `lib/newsletter/core.ts` + `core.test.ts` (καθαρά τμήματα `startCheck`, `failRatio`) · Modify `app/api/cron/promos/route.ts` (κλήση `tickNewsletters()` με `.catch`)
**Consumes:** Tasks 2–4, `sendMail`, `getSetting("email")`, `marketingAllowed`, `membersOf`.
**Produces:**
- (core) `startCheck(n: { promotion?: { status: string; held: boolean; endsAt: Date | null } | null; campaign?: { status: string } | null }, now: Date): string | null` — λόγος ακύρωσης ή null.
- (core) `failRatio(sent: number, failed: number): boolean` (> 0.2 και τουλάχιστον 50 προσπάθειες)
- `sendTest(id: string, to: string[], staffId: string): Promise<{ ok: boolean; error?: string }>` — γράφει `testHash`, `testSentAt`, `testSentTo`· θέμα με πρόθεμα «[ΔΟΚΙΜΗ] ».
- `scheduleNewsletter(id: string, at: Date | "now", staffId: string): Promise<{ ok: boolean; error?: string; recipients?: number }>` · `cancelNewsletter(id, staffId)` · `stopNewsletter(id, staffId)`
- `claimDue(now: Date): Promise<string[]>` — `updateMany({ where: { id, status: "scheduled" }, data: { status: "sending" } })` ανά υποψήφιο, επιστρέφει μόνο όσα διεκδίκησε.
- `startSending(id: string)`: `startCheck` (λόγος → `cancelled`) → ανανέωση προϊόντων (αφαιρέσεις στο `log`· block προϊόντων που άδειασε → `paused` με λόγο) → `audienceOf` (0 → `cancelled` «κανένας με συναίνεση») → `createMany` παραληπτών (token = cuid) → `recipients`.
- `sendBatches(id: string, maxBatches = 5)`: Mailgun `POST /v3/<domain>/messages` (form-data: from, to (λίστα), subject, html, text, `recipient-variables`, headers του Global Constraints, `o:tag`=`newsletter`, `v:newsletter`=id, `o:tracking`=yes, `o:testmode` όταν `NEWSLETTER_TESTMODE=1`)· αλλιώς `sendMail` ένα-ένα (60)· ενημέρωση γραμμών και μετρητών· 429 / 5xx → το πακέτο μένει queued (`attempts`+1, μετά από 3 → failed)· άλλο 4xx → `paused` με το μήνυμα του παρόχου· `failRatio` → `paused`.
- `tickNewsletters(now = new Date())`: κλείδωμα (`pg_try_advisory_lock`), `claimDue` → `startSending` → `sendBatches` για όλα τα `sending`.
- [ ] Tests (RED → GREEN): `startCheck` — προσφορά ended → λόγος· held → λόγος· active → null· καμπάνια paused → λόγος. `failRatio(100, 30) === true`, `(10, 5) === false`.
- [ ] Επαλήθευση με script: newsletter «ΔΟΚΙΜΗ 2030» με κοινό μόνο το email του χρήστη (περνιέται στο script ως όρισμα, όχι hard-coded), `NEWSLETTER_TESTMODE=1`: `scheduleNewsletter(id,"now")` → δύο ταυτόχρονες κλήσεις `claimDue` → μόνο μία επιστρέφει το id· `sendBatches` → status sent, 1 παραλήπτης sent· διαγραφή δεδομένων δοκιμής · commit.

### Task 6: Διαγραφή, webhooks, προβολή στον browser
**Files:** Create `app/api/newsletter/u/[token]/route.ts` (GET σελίδα, POST one-click), `app/(shop)/newsletter/u/[token]/page.tsx` (επιβεβαίωση με κουμπί), `app/api/webhooks/mailgun/route.ts`, `app/(shop)/newsletter/v/[id]/page.tsx`, `lib/newsletter/events.ts` (server-only)
**Consumes:** `verifyMailgun`, `unsubscribe` (lib/newsletter), `recordConsent` (lib/gdpr/consent), `renderNewsletter`.
**Produces:** `unsubscribeRecipient(token: string, via: "link" | "one-click" | "mailgun"): Promise<{ ok: boolean; email?: string }>` · `applyMailgunEvent(e: { id: string; event: string; recipient: string; newsletterId?: string; url?: string; severity?: string; timestamp: number }): Promise<"applied" | "duplicate" | "ignored">`
- [ ] `unsubscribeRecipient`: συνδρομητής → `unsubscribe(subscriber.token, "newsletter")`· πελάτης → `recordConsent` granted false (topics offers και newsletter, method one-click, source api) + `customer.newsletter = false`· `unsubscribedAt` + μετρητής· ιδεμπότητα (δεύτερη κλήση δεν ξαναμετρά).
- [ ] Webhook: 401 χωρίς έγκυρη υπογραφή· `NewsletterEvent` με το id του γεγονότος (διπλό → 200 «duplicate»)· delivered/opened/clicked (μόνο το πρώτο ανεβάζει μετρητή)· `failed` με `severity=permanent` → bounced (+ συνδρομητής bounced)· `complained` → complained + consent false· `unsubscribed` → `unsubscribeRecipient(…, "mailgun")`.
- [ ] Προβολή: μόνο status scheduled|sending|sent|paused, render με `unsubscribe` = σύνδεσμος της σελίδας συνδρομής, χωρίς προσωπικά.
- [ ] Επαλήθευση: curl στο webhook με λάθος υπογραφή → 401· τοπική υπογραφή με δοκιμαστικό κλειδί από env `MAILGUN_WEBHOOK_TEST_KEY` → 200, δεύτερη φορά «duplicate»· GET/POST διαγραφής σε παραλήπτη δοκιμής → unsubscribedAt· καθαρισμός · commit.

### Task 7: Διαχείριση και βοήθεια
**Files:** Create `app/admin/(shell)/prosfores/newsletter/page.tsx` (λίστα), `app/admin/(shell)/prosfores/newsletter/[id]/page.tsx`, `app/admin/(shell)/prosfores/newsletter/actions.ts`, `components/admin/promos/NewsletterEditor.tsx`, `components/admin/promos/NewsletterStats.tsx` · Modify `components/admin/promos/PromoTabs.tsx` (σελίδα «Newsletter» στην ομάδα με τις διαφημιστικές θέσεις), `app/admin/(shell)/prosfores/[id]/page.tsx` και `app/admin/(shell)/prosfores/kampanies/[id]/page.tsx` (κουμπί «Newsletter»), `app/admin/(shell)/newsletter/page.tsx` (σύνδεσμος «Αποστολές»), `lib/help/content/index.ts`
**Consumes:** Tasks 4–6. Δικαίωμα `marketing.newsletter.write` σε κάθε action· audit `newsletter.create|update|test|schedule|send|cancel|stop|copy`.
**Produces (actions):** `createFromPromotion(id)`, `createFromCampaign(id)`, `saveNewsletter(id, { title, subject, preheader, blocks, audience })` (ξαναϋπολογίζει `contentHash`), `rewriteWithAi(id, field)`, `previewHtml(id, mode)`, `testSend(id)` (στο email του χρήστη + προαιρετικά emails προσωπικού), `estimateRecipients(id)`, `schedule(id, atIso | "now")`, `cancel(id)`, `stop(id)`, `duplicate(id)`, `searchProducts(q)`.
- [ ] Editor (ui-ux-pro-max): αριστερά πεδία με μετρητές χαρακτήρων και εξήγηση κάτω από το καθένα, προϊόντα με αναζήτηση / ↑ ↓ / αφαίρεση (πληκτρολόγιο), hero (εικόνα από βιβλιοθήκη ή URL), κουμπί, κοινό (όλοι με συναίνεση / κοινό πελατών)· δεξιά iframe προεπισκόπησης υπολογιστής / κινητό (σε κινητό καρτέλα)· κάτω μπάρα ενεργειών (χωρίς πάροχο email: απενεργοποιημένες με σύνδεσμο στις Ρυθμίσεις → Email): «Δοκιμαστική αποστολή», «Αποστολή τώρα», «Προγραμματισμός» (απενεργοποιημένα με αιτιολογία μέχρι τη δοκιμή), επιβεβαίωση με πλήθος παραληπτών και θέμα, προειδοποίηση νύχτας· αποθήκευση με «Αποθήκευση» και προειδοποίηση μη αποθηκευμένων.
- [ ] Λίστα: κάρτες σε κινητό / πίνακας σε υπολογιστή, κατάσταση σε λέξεις, φίλτρο κατάστασης· στατιστικά μετά την αποστολή (μπάρα προόδου, μετρητές, κλικ ανά σύνδεσμο από `NewsletterEvent`, ιστορικό `log`, «Αντίγραφο»).
- [ ] Βοήθεια: οδηγοί για τις δύο σελίδες (σύνοψη, «Πώς στέλνω newsletter προσφοράς», σημεία με `data-help`, συμβουλές για συναίνεση / ώρα)· `npm run help:gen` χωρίς κενά.
- [ ] Έλεγχος στον browser (υπολογιστής + 375px): δημιουργία από προσφορά «ΔΟΚΙΜΗ 2030», αλλαγή κειμένου → η αποστολή κλειδώνει μέχρι νέα δοκιμή, δοκιμαστική αποστολή στο email του χρήστη (testmode), προγραμματισμός και ακύρωση· διαγραφή δεδομένων δοκιμής · `tsc`, `eslint`, `npm test` · commit.
