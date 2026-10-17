# Newsletter προσφοράς: αυτόματο εικαστικό email με άμεση ή προγραμματισμένη αποστολή

Ημερομηνία: 17/10/2026 · Κατάσταση: σχέδιο εγκρίθηκε ανά ενότητα στη συζήτηση· αναμένει έγκριση του γραπτού spec · UI με ui-ux-pro-max

## 1. Στόχος

Από μια προσφορά ή καμπάνια, ο διαχειριστής φτιάχνει με ένα πάτημα ένα έτοιμο εικαστικό newsletter (key visual, προϊόντα με τιμές,
κουμπί στη landing), το διορθώνει, κάνει δοκιμαστική αποστολή και το στέλνει **τώρα** ή σε **ημερομηνία και ώρα** που επιλέγει.

Αποφάσεις χρήστη (17/10):
- Παραλήπτες: επιβεβαιωμένοι συνδρομητές **και** πελάτες με συναίνεση, χωρίς διπλά emails.
- Περιεχόμενο: αυτόματο + κείμενα από AI, όλα επεξεργάσιμα.
- Έγκριση: την αποστολή την κάνει ο ίδιος ο δημιουργός, με δικλείδες (όχι δεύτερο πρόσωπο).
- Αποστολή: δικό μας σύστημα με Mailgun batch (όχι εξωτερική πλατφόρμα).

## 2. Τι υπάρχει ήδη

- `NewsletterSubscriber` (double opt-in, `status` pending | subscribed | unsubscribed | bounced | complained, `token`, `lists`) και `lib/newsletter` (`subscribe`, `confirm`, `unsubscribe`).
- Ledger συναινέσεων `Consent` (topic newsletter / offers, channel email) και `marketingAllowed(customerIds)` (lib/promo/issue.ts): η τελευταία συναίνεση offers/newsletter, αλλιώς το `Customer.newsletter`.
- Αποστολή email: `sendMail` (lib/email/send.ts) μέσω Ρυθμίσεις → Email (σήμερα **Mailgun**), `EmailLog`, σχέδιο email `lib/email/layout.ts` (`emailCtx`, BRAND).
- Κοινά πελατών `Segment` + `membersOf` (lib/promo/segments.ts).
- Προσφορές (`Promotion.status` draft | pending | scheduled | active | paused | ended | archived, `held`), καμπάνιες (`Campaign`), landing pages (`LandingPage`, /prosfores/<slug>), διαφημιστικές θέσεις (`AdPlacement.image`), έτοιμες τιμές `ProductOffer` και `promotionProductIds`.
- Cron ανά λεπτό: `GET /api/cron/promos` με `CRON_SECRET`.
- AI μέσω `lib/ai` (openrouter, tasks).
- Σήμερα 0 συνδρομητές στη νέα λίστα· οι περισσότεροι παραλήπτες θα είναι πελάτες με συναίνεση (εισαγωγή nopCommerce).

## 3. Μοντέλο δεδομένων (μόνο προσθήκες, SQL μέσω DIRECT_URL — ποτέ db push)

**`Newsletter`**
- `id`, `title` (εσωτερικός τίτλος), `promotionId?`, `campaignId?`
- `subject`, `preheader`, `blocks Json` (βλ. §4), `audience Json` = `{ segmentId?: string }`
- `status`: draft | scheduled | sending | paused | sent | cancelled
- `scheduledAt?`, `startedAt?`, `finishedAt?`, `cancelReason?`
- `contentHash` (αποτύπωμα θέματος + blocks) · `testHash?`, `testSentAt?`, `testSentTo?` — η δοκιμή ισχύει μόνο όταν `testHash = contentHash`
- μετρητές: `recipients`, `sent`, `failed`, `delivered`, `opened`, `clicked`, `unsubscribed`, `bounced`, `complained`
- `createdById`, `sentById?`, `createdAt`, `updatedAt`
- `log Json` (ιστορικό: π.χ. «αφαιρέθηκε προϊόν Χ — εκτός προσφοράς» στην αποστολή)

**`NewsletterRecipient`**
- `id`, `newsletterId`, `email` (πεζά), `subscriberId?`, `customerId?`, `firstName?`
- `token` (μοναδικό, για διαγραφή / one-click), `status`: queued | sent | failed | skipped
- `messageId?`, `attempts`, `error?`, `sentAt?`, `deliveredAt?`, `openedAt?`, `clickedAt?`, `unsubscribedAt?`, `bouncedAt?`, `complainedAt?`
- `@@unique([newsletterId, email])`, δείκτες σε `(newsletterId, status)` και `token`

**`NewsletterEvent`** (ιδεμπότητα webhooks): `id` = id γεγονότος Mailgun, `recipientId`, `type`, `url?`, `at`.

## 4. Περιεχόμενο

Blocks (με σειρά, όλα προαιρετικά εκτός από το footer):
- `hero`: `{ image?, alt, href, headline, sub }` — εικόνα από landing / διαφημιστική θέση / βιβλιοθήκη· χωρίς εικόνα: κεφαλίδα σε χρώματα μάρκας (HTML) με τίτλο και λήξη.
- `text`: `{ body }` (απλό κείμενο σε παραγράφους).
- `products`: `{ ids: string[] }` — έως 12, προεπιλογή 6.
- `cta`: `{ label, href }`.
- Footer πάντα: στοιχεία εταιρείας, «Το λαμβάνετε γιατί…», διαγραφή, «Προβολή στον browser».

**Αυτόματο πρόχειρο** (`draftFromPromotion` / `draftFromCampaign`):
- Hero από την landing ή τη διαφημιστική θέση της προσφοράς/καμπάνιας.
- Προϊόντα: `promotionProductIds(..., "discount")` — μόνο προϊόντα του καταλόγου που φαίνονται στο site (ενεργά, πωλούνται μόνα τους ή σετ, με τιμή και φωτογραφία)· για καμπάνια: η ένωση των προσφορών της.
- Κουμπί: landing της προσφοράς/καμπάνιας, αλλιώς `/prosfores/<slug>` ή η κατηγορία.
- AI: θέμα (≤ 60 χαρακτήρες), preheader (≤ 110), εισαγωγή (≤ 400), κείμενο κουμπιού (≤ 24). Είσοδος **μόνο** τα στοιχεία της προσφοράς (όνομα, μηχανισμός με `autoLabel`, ποσοστά/ποσά, λήξη, όροι, τίτλοι και τιμές προϊόντων).
- **Έλεγχος γεγονότων**: κάθε αριθμός (%, €, ημερομηνία) στο κείμενο AI πρέπει να υπάρχει στα στοιχεία· αλλιώς (ή αν το AI δεν απαντήσει) χρησιμοποιείται σταθερό πρότυπο (π.χ. «Έως −20 % σε κλιματιστικά, μέχρι 31/10»).
- Όλοι οι σύνδεσμοι με UTM: `utm_source=newsletter&utm_medium=email&utm_campaign=<κωδικός καμπάνιας ή προσφοράς>&utm_content=<block>`.

**Απόδοση** (`lib/newsletter/render.ts`, καθαρή συνάρτηση, tests): blocks + ctx + τιμές → `{ html, text }` με το υπάρχον σχέδιο email (πίνακες, inline styles, Gmail/Outlook)· διαφυγή HTML σε κάθε κείμενο· κάρτες προϊόντων 2 στήλες σε υπολογιστή, 1 σε κινητό· διαγραφή ως placeholder ανά παραλήπτη (`%recipient.unsub%` στο Mailgun). Η «Προβολή στον browser» (`/newsletter/v/<id>`) δείχνει την ίδια απόδοση χωρίς προσωπικά στοιχεία, μόνο για newsletters που στάλθηκαν ή προγραμματίστηκαν.

**Στην έναρξη της αποστολής**: οι τιμές ξαναδιαβάζονται από `ProductOffer`· προϊόν που βγήκε από την προσφορά, δεν φαίνεται πια στο site ή δεν έχει απόθεμα αφαιρείται και γράφεται στο `log`. Αν δεν μείνει κανένα προϊόν και υπήρχε block προϊόντων → η αποστολή δεν ξεκινά (`paused`, ειδοποίηση).

## 5. Παραλήπτες

Υπολογίζονται **στην έναρξη** της αποστολής (καθαρή συνάρτηση `audienceOf`, tests) και παγώνουν σε `NewsletterRecipient`:
1. `NewsletterSubscriber` με `status = subscribed`.
2. Πελάτες με email για τους οποίους `marketingAllowed` = ναι.
3. Αν ορίστηκε `segmentId`: μόνο όσοι από τα 1–2 είναι μέλη του κοινού (για συνδρομητές χωρίς λογαριασμό: εκτός, όταν υπάρχει κοινό).
4. Ένα email ανά διεύθυνση (πεζά, χωρίς κενά)· προτεραιότητα στη γραμμή συνδρομητή (έχει token).
5. Εξαιρούνται πάντα: email με συνδρομητή σε unsubscribed / bounced / complained· πελάτες με τελευταία συναίνεση «όχι»· email χωρίς έγκυρη μορφή.

## 6. Αποστολή

**Δικλείδες** (ελέγχονται και στον server):
- «Αποστολή τώρα» / «Προγραμματισμός» μόνο αν υπάρχει δοκιμή μετά την τελευταία αλλαγή (`testHash = contentHash`).
- Η προσφορά πρέπει να είναι scheduled ή active (όχι `held`)· η καμπάνια scheduled ή live. Ξανά έλεγχος στην έναρξη: αλλιώς `cancelled` με λόγο.
- Επιβεβαίωση με το πλήθος παραληπτών (προεκτίμηση με `audienceOf`) και το θέμα.
- Προγραμματισμός: 5′ έως 30 ημέρες μπροστά, ώρα Ελλάδας· προειδοποίηση για 22:00–08:00.
- Ακύρωση όσο είναι scheduled· «Διακοπή» στη διάρκεια (οι υπόλοιποι γίνονται `skipped`).
- Ατομική διεκδίκηση (`updateMany where status`) — κάθε newsletter στέλνεται μία φορά· νέα αποστολή = «Αντίγραφο».
- Δικαίωμα `marketing.newsletter.write`· audit σε δημιουργία, δοκιμή, προγραμματισμό, αποστολή, ακύρωση, διακοπή.

**Εκτέλεση**: `tickNewsletters()` από το cron ανά λεπτό (`/api/cron/promos`), με κλείδωμα:
1. Newsletters με `scheduled` και `scheduledAt ≤ τώρα` (και όσα πατήθηκαν «τώρα») → έλεγχοι, ανανέωση τιμών, παραλήπτες σε ουρά, `sending`.
2. Για κάθε `sending`: έως 5 πακέτα των 1.000 ανά λεπτό (ρύθμιση). Mailgun: `to` + `recipient-variables` (unsub URL, όνομα), `h:List-Unsubscribe: <https://…/api/newsletter/u/<token>>` (χωρίς mailto — απόφαση τελικής αναθεώρησης), `h:List-Unsubscribe-Post: List-Unsubscribe=One-Click`, `o:tag`, `v:newsletter`, `o:tracking-opens/clicks = yes`. Χωρίς Mailgun: ένα-ένα με `sendMail` (έως 60 ανά λεπτό). Ένα `EmailLog` ανά πακέτο.
3. Αποτυχία πακέτου: έως 3 προσπάθειες· μόνιμη → `failed`. Πάνω από 20 % αποτυχίες → `paused` και ειδοποίηση στη σελίδα.
4. Όταν αδειάσει η ουρά → `sent`, `finishedAt`.

## 7. Διαγραφή και webhooks

- `/api/newsletter/u/<token>`: GET = σελίδα επιβεβαίωσης, POST = one-click. Συνδρομητής → `unsubscribe(token)` του `lib/newsletter`· πελάτης χωρίς συνδρομή → `Consent` granted=false (topic offers + newsletter, method one-click) και `Customer.newsletter = false`. Γραμμή παραλήπτη `unsubscribedAt`, μετρητής.
- `/api/webhooks/mailgun`: έλεγχος υπογραφής (HMAC-SHA256 του `timestamp + token` με το Webhook signing key — νέο μυστικό πεδίο στις Ρυθμίσεις → Email), απόρριψη παλιών (> 15′). Γεγονότα: delivered, opened, clicked (με URL), failed permanent → `bounced` (και ο συνδρομητής), complained → `complained` + `Consent` false, unsubscribed → όπως η διαγραφή. Ιδεμπότητα με `NewsletterEvent.id`.

## 8. Διαχείριση (ui-ux-pro-max)

- **Προσφορές → «Newsletter»** (`/admin/prosfores/newsletter`): λίστα με κατάσταση σε λέξεις, προσφορά/καμπάνια, ώρα, παραλήπτες, ανοίγματα, κλικ· φίλτρα κατάστασης.
- **Κουμπί «Newsletter»** στην καρτέλα προσφοράς και καμπάνιας → νέο πρόχειρο.
- **Επεξεργασία** (`/admin/prosfores/newsletter/[id]`): αριστερά τα πεδία (θέμα / preheader με μετρητή, εισαγωγή, προϊόντα με προσθήκη / αφαίρεση / σειρά, hero, κουμπί, κοινό), «Ξαναγράψε με AI» ανά κείμενο· δεξιά ζωντανή προεπισκόπηση υπολογιστής / κινητό· σε κινητό καρτέλα «Προεπισκόπηση». Κάτω: δοκιμαστική αποστολή (στο email του χρήστη ή σε διευθύνσεις προσωπικού), «Αποστολή τώρα», «Προγραμματισμός».
- **Μετά την αποστολή**: μπάρα προόδου, μετρητές, κλικ ανά σύνδεσμο / προϊόν, ιστορικό, «Αντίγραφο».
- Η σελίδα «Newsletter» (συνδρομητές) αποκτά σύνδεσμο στις αποστολές.
- Βοήθεια: οδηγοί, `data-help`, `help:gen`, `help:shots` (η λίστα και ο editor δεν έχουν προσωπικά στοιχεία· η λίστα παραληπτών δεν φωτογραφίζεται).

## 9. Λάθη και όρια

- Ρυθμίσεις email χωρίς πάροχο → «Αποστολή» απενεργοποιημένη με εξήγηση και σύνδεσμο στις Ρυθμίσεις.
- AI εκτός → σταθερά πρότυπα (§4), χωρίς μπλοκάρισμα.
- 0 παραλήπτες στην έναρξη → `cancelled` («κανένας με συναίνεση»).
- Mailgun 429 / 5xx → επανάληψη στο επόμενο λεπτό· 4xx (π.χ. λάθος κλειδί) → `paused` με το μήνυμα του παρόχου.

## 10. Έλεγχος

- Tests: απόδοση (διαφυγή, UTM, placeholder διαγραφής, κείμενο), `audienceOf` (διπλά, εξαιρέσεις, κοινό), έλεγχος γεγονότων AI, επικύρωση ώρας, χτίσιμο πακέτων / recipient-variables, υπογραφή webhook, μεταβάσεις κατάστασης (διπλή διεκδίκηση).
- Πραγματική επαλήθευση: Mailgun `o:testmode` και δοκιμαστική αποστολή **μόνο** στο email του χρήστη· κανένα πραγματικό newsletter σε πελάτες χωρίς ρητή εντολή.
- Βάση κοινή με το live: πίνακες μόνο με προσθήκες· δοκιμαστικά newsletters με τίτλο «ΔΟΚΙΜΗ 2030» και διαγραφή μετά.

## 11. Εκτός πεδίου

A/B θέματος, εξατομικευμένα προϊόντα ανά παραλήπτη, απόδοση πωλήσεων σε newsletter (τα UTM ετοιμάζουν τις αναφορές καμπανιών), SMS, επεξεργαστής ελεύθερου σχεδίου (drag & drop).
