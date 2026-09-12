# Δυναμικά components — data contract για τη σύνδεση με ERP / CMS

Κάθε component του demo που σήμερα διαβάζει fixtures έχει σχόλιο `@dynamic` στην κορυφή του με την πηγή του. Ο παρακάτω πίνακας είναι το συμβόλαιο: ίδιες υπογραφές συναρτήσεων στο `lib/data/repo.ts`, ίδια props στα components. Η σύνδεση γίνεται μόνο μέσα στο repository (κανένα page δεν καλεί ERP απευθείας).

| Component / σελίδα | Repository | Πηγή παραγωγής | Cache |
|---|---|---|---|
| Αρχική — ζώνες (`lib/cms/home.layout.ts`) | `getHomeLayout()` | CMS zones (schedule, ορατότητα, A/B) | ISR 60s |
| `NewsBand`, `/nea`, `/nea/[slug]` | `getNews({category, limit})`, `getNewsItem(slug)` | CMS «Νέα & ανακοινώσεις» (ή SoftOne Ανακοινώσεις) | ISR 300s, revalidate on publish |
| `CampaignSpotlight` (ζώνη 8 — καμπάνιες κατασκευαστών) | `getHomeLayout()` → widget `campaign-spotlight` | CMS ζώνη: μάρκα, τίτλος, κείμενο, CTA, σύνδεσμος, key visual του κατασκευαστή (upload), σειρά & χρονοπρόγραμμα· σήμερα με τα 4 KV που τρέχουν στο euronics.gr (Samsung Vision AI, OLED S95F, Miele 25 χρόνια εγγύηση μοτέρ, Dell οθόνες) | ISR 60s |
| `ProductCard` v4 — cutout, stickers (`Stickers.tsx`) | `cutoutFor(image)`, `stickersFor(product, dealEndsAt)` | DAM/PIM: cutout rendition ανά SKU (demo: rembg → `public/img/cutouts`)· stickers από κανόνες τιμολόγησης (PRCRULES), απόθεμα web (MTRSTORE `stockLeft`), λήξη καμπάνιας, επιλογή καταστήματος (store portal) | ISR 60s |
| «Ο χώρος μου» (`MySpaceProvider`, `MySpaceSheet`) + `FitBadge` | `fitVerdict(dims, space)` · `dimsFor(product)` | Διαστάσεις από χαρακτηριστικά ERP / EPREL / Icecat (fallback ανά κατηγορία, σημαίνεται «τυπικές»)· ο χώρος του πελάτη στο προφίλ λογαριασμού (demo: localStorage) | client |
| `EnergyCost` (Ρεύμα σε ευρώ) | `estimateKwh(product)` | Ετήσια κατανάλωση από δελτίο προϊόντος / EPREL, πίνακας κατηγορίας × κλάσης ως εκτίμηση, τιμή kWh από ρυθμίσεις admin | ISR 60s |
| `ArButton` («Δες το στον χώρο σου») | `/models/<id>.glb` + `.usdz` | 3D asset ανά SKU από PIM/κατασκευαστή, αλλιώς κουτί σε κλίμακα από τις διαστάσεις (`scripts/gen-models.py`) | static |
| `AdvisorOrb` (AI σύμβουλος) | `AdvisorContext` (προϊόν σελίδας) → `/api/advisor` (SSE) | AI Sales Engine: OpenRouter routing, pgvector retrieval, εργαλεία Fit-My-Space / Energy / απόθεμα, hand-off σε κατάστημα· demo: τοπικές απαντήσεις από δεδομένα καταλόγου | no-store |
| `CinematicHero` | `getHeroSlides()` (+ `cutout`, `productHref`) | CMS slides με cutout προϊόντος καμπάνιας | ISR 60s |
| `SearchBox` advisor mode (πρόταση αντί για λέξη, φωνή, κάμερα) | `/api/advisor?q&door` → `advisorAnswer()` | Demo: κανόνες πρόθεσης (κατηγορία, όριο τιμής, πόρτα, θόρυβος, kg, ίντσες) πάνω στον κατάλογο· παραγωγή: AI Sales Engine (LLM tool-calling + pgvector + Fit/Energy tools), streamed | no-store |
| `SnapSheet` (Snap & Find) | tesseract.js στη συσκευή → `/api/search` → `/api/advisor` | Παραγωγή: vision model του AI Sales Engine (αναγνώριση συσκευής και πινακίδας, φωτογραφία εσοχής) | client |
| `CompareVerdict` («Εξήγησέ μου τη διαφορά») | `compareRows()`, `estimateKwh()` | Παραγωγή: LLM σύνοψη από τα ίδια χαρακτηριστικά + reviews summary, streamed | client |
| `StoreHandoff` (άνθρωπος από το κατάστημα) | `AdvisorOrb` → lead | SoftOne TRDR + SRVJOB lead, ειδοποίηση καταστήματος (tablet/SMS), σύνοψη συνομιλίας | no-store |
| `/admin/radar` («Ραντάρ ζήτησης») | `radar` fixture | Νυχτερινή συγκέντρωση από ChatSession/ChatMessage + search logs × απόθεμα SoftOne (MTRSTORE) × κατάλογος· εβδομαδιαίο email CEO | ISR 3600s |
| `WalletSheet` (Apple Pay / Google Pay / Revolut Pay) | `Checkout` express + payment list | Payment Request API / Apple Pay JS / Google Pay API / Revolut Checkout μέσω PSP (Viva, ePay, Adyen)· tokens μόνο στον PSP | client |
| `SocialLogin` (Google, Microsoft, Facebook, Apple) | `AuthForm`, `Checkout` βήμα 1 | Auth.js v5 providers (OAuth/OIDC), account linking με επαληθευμένο email, συγκατάθεση στο ledger | no-store |
| `DeviceWallet` («Οι συσκευές μου»), `ServiceRequest` | `getOrders()` × `getDevices()` | Παραγγελίες (SALDOC) × service (SRVJOB) × PIM/EPREL (εγχειρίδιο, ετικέτα) × έγγραφα (απόδειξη/πιστοποιητικό PDF)· αίτημα service → SRVJOB + ημερολόγιο καταστήματος | no-store |
| `NearestStoreCard`, `geoFromRequest()` | `getNearestStoreWithGeo()` · `/api/stores/near` | IP → πόλη (ipapi.co demo· παραγωγή MaxMind/CDN geo headers), GPS μόνο μετά από άδεια, haversine στα 350 καταστήματα | per request |
| `ExitIntent` («Πριν φύγεις…») | `CartProvider`, session | Λόγος → Ραντάρ ζήτησης· email καλαθιού μέσω Klaviyo/Brevo με cart token (transactional) | client |
| `AdvisorOrb` mascot «Άρης» | `public/img/advisor/mascot*.png` | Χαρακτήρας brand (OpenArt, cutout)· παραγωγή: ίδιο asset από το brand kit, animation states | static |
| `CategoryOpener` + `AskAris` chips | `listProducts()` top 3, `getCategories()` no, `ASK_FOR` | Ερωτήσεις ανά κατηγορία από το Ραντάρ ζήτησης (CMS override), cutouts από το DAM, πλήθος live | ISR 60s |
| `AdvisorGreeting` («Γεια! Είμαι ο Άρης») | session | Κείμενο/χρόνος από CMS, προσωποποίηση από λογαριασμό, 1 φορά ανά session | client |
| `DealOfDayTile`, `StoreTile`, `ServicesTile` (hero δεξιά) | `getDealOfDay()`, `getNearestStoreWithGeo()`, `getServices(6)` | CMS deal schedule + ERP τιμή/Omnibus· IP→GPS κατάστημα· υπηρεσίες CMS | ISR 60s / per request |
| `DealsRail`, `DealOfDayTile` | `listProducts({tag})`, `getDealOfDay()` | SoftOne MTRL + τιμοκατάλογος προσφορών (PRCRULES), Omnibus 30 ημερών από ιστορικό τιμών | ISR 60s |
| `ProductCard`, `ProductGrid`, `Facets` | `listProducts(filter)` | SoftOne MTRL + χαρακτηριστικά (CCCSUBGROUP2 / extra fields) → `lib/data/attributes` | ISR 60s, facets από search index |
| `ProductHeader`, `BuyBox`, `SpecsTable`, `CompareSimilar` | `getProductBySlug`, `getRelated`, `getAccessoriesFor` | SoftOne MTRL, απόθεμα ανά κατάστημα (MTRSTORE), σχετικά/συμπληρωματικά από ITEGROUP mapping | ISR 60s· απόθεμα live (no-store) |
| `SmartGuide` | `listProducts({l1,l2})` + `lib/guides/smart.ts` | Ίδια χαρακτηριστικά· τα βάρη των κριτηρίων στο CMS | ISR 60s |
| `SearchBox` (autosuggest 4 ομάδων) + `/api/search` | `searchSuggest(q, cat)` | Meilisearch index (typo tolerance, synonyms, Greeklish) — ίδιο JSON | edge cache 30s |
| `MegaNav` (3 επίπεδα: υποκατηγορίες, μάρκες/γρήγορα φίλτρα/οδηγός, προωθούμενο προϊόν) | `getMegaMenuData()` | CMS ζώνη «menu» ανά κατηγορία με fallback από τον κατάλογο | ISR 300s |
| `StoreFinder`, `/katastimata` | `getStores(q)` | SoftOne BRANCH/κατάστημα μέλους + ωράρια από CMS | ISR 3600s |
| `ServicesBand`, `/ypiresies` | `getServicesFull()` | CMS υπηρεσίες με τιμές (τιμές από SoftOne SRV items) | ISR 3600s |
| Λογαριασμός — Επισκόπηση | `getCustomer`, `getOrders`, `getInstalmentPlans`, `getAppointments` | SoftOne CUSTOMER (TRDR), SALDOC, FINDOC, SRVJOB | no-store (session) |
| Λογαριασμός — Τα στοιχεία μου (`ProfileForm`) | `getCustomer` · `PATCH /api/account/profile` | SoftOne CUSTOMER · auth provider (κωδικός, 2FA) · DPO workflow για GDPR | no-store |
| Λογαριασμός — Παραγγελίες & παρακολούθηση (`OrderTimeline`) | `getOrders`, `getOrder(no)` | SoftOne SALDOC + courier tracking API (ACS/Γενική) | no-store, polling 60s σε «σε διανομή» |
| Λογαριασμός — Πληρωμές & δόσεις | `getPaymentMethods`, `getInstalmentPlans` | PSP token vault (μόνο masked), FINDOC / Eurobank consumer credit | no-store |
| Λογαριασμός — Ραντεβού & service | `getAppointments` | SoftOne Service (SRVJOB) + ημερολόγιο καταστήματος | no-store |
| Λογαριασμός — Ειδοποιήσεις (`ConsentsForm`) | `getConsents` · `POST /api/account/consents` | Consent ledger (GDPR άρθρο 7): topic, channel, value, timestamp, source | no-store |
| Λογαριασμός — Διευθύνσεις, Επιστροφές, Εγγυήσεις | `getOrders`, demo address | SoftOne TRDR addresses, RMA module, εγγυήσεις από SALDOC + add-ons | no-store |
| `/entopismos` (δημόσια παρακολούθηση) | `getOrder(no)` + έλεγχος κινητού/email | SALDOC + courier API | no-store |
| SEO · AEO · GEO (`lib/seo/product.ts`) | από `Product` | Παράγεται από το record — καμία χειρόγραφη εργασία ανά SKU | ίδιο με το προϊόν |

## Κανόνες

1. **Το UI δεν αλλάζει** όταν συνδεθεί η πηγή: μόνο το σώμα των συναρτήσεων στο `lib/data/repo.ts`.
2. **Adaptive παντού**: κάθε component είναι container (`eu-container`), οι στήλες προκύπτουν από το διαθέσιμο πλάτος (`auto-fill/auto-fit minmax`), τα rails από `CardCarousel`, ποτέ εσωτερικοί scrollers.
3. **Εικόνες** μόνο μέσα από `ProductImage` (σταθερό πλαίσιο) και τοπικά αντίγραφα / CDN της Euronics — όχι hotlink σε thumbs που αλλάζουν.
4. **Κείμενα σχεδιαστικής αιτιολόγησης** δεν εμφανίζονται στο site· ζουν στο `docs/design-notes-client.md` και στην παρουσίαση `/protasi`.
