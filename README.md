# demo-euronics

Πλήρες demo eshop euronics.gr (DGSOFT, Σεπτέμβριος 2026): όλες οι σελίδες και όλα τα flows με στατικό dummy περιεχόμενο βασισμένο σε **πραγματικά στοιχεία του υφιστάμενου euronics.gr** (32 προϊόντα με επαληθευμένες εικόνες, 41 καταστήματα-μέλη, πολιτικές, υπηρεσίες, blog). Χωρίς ενδιάμεση πλατφόρμα ηλεκτρονικού εμπορίου, χωρίς B2B. Επίσημο Euronics branding.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
```


## Νέα σε αυτή την έκδοση (v3 — «λίστα, σύγκριση, οδηγοί»)

| Διαδρομή | Τι είναι |
|---|---|
| `/proionta` | **Λίστα όλων των προϊόντων** με facets στο URL: κατηγορία (`?k=`), μάρκα, τιμή, διαθεσιμότητα, ενεργειακή κλάση και **χαρακτηριστικά** (`f_Διαγώνιος=55"|65"`, `f_Απόδοση (BTU)=…`). Τα χαρακτηριστικά υπολογίζονται από `lib/data/attributes.ts` (κανονικοποίηση συνωνύμων «Εύρος Οθόνης» / «Διαγώνιος» / «Μέγεθος Οθόνης» κ.λπ.). |
| `/sygkrisi` | **Σύγκριση βάσει χαρακτηριστικών** έως 4 προϊόντων: γραμμές ανά ομάδα, «μόνο διαφορές», sticky πρώτη στήλη, «Φθηνότερο». Το «Σύγκριση» υπάρχει σε κάθε κάρτα, στο PDP και στον οδηγό. |
| `/proion/[slug]` | PDP ξαναγραμμένο: header με key facts, sticky buy box (παράδοση / κατάστημα με απόθεμα / ραντεβού, «Ολοκληρωμένη λύση» με υπηρεσίες + αξεσουάρ, «Προσθήκη όλων»), sticky section nav, χαρακτηριστικά σε κάρτες, **σύγκριση με παρόμοια in-page**, υπηρεσίες & παράδοση, σχετικά σε grid (τίποτα δεν κόβεται). |
| `/kalathi` | Καλάθι: κάρτες με εικόνα, υπηρεσίες ως chips, «κράτα για αργότερα», μπάρα δωρεάν μεταφορικών, σύνοψη με navy header, express πληρωμές. |
| `/checkout` | Checkout κατά την πρόταση: express (Apple/Google Pay/IRIS), αριθμημένες ενότητες 1–4 με «Αλλαγή», επιλογή παράδοσης με κόστος/χρόνο, ΑΑΔΕ lookup, δόσεις ως chips, sticky σύνοψη με εικόνες, mobile sticky σύνολο + CTA, inline validation. |
| `/odigos-agoras` | **Έξυπνοι οδηγοί αγοράς**: `tileoraseis`, `ypologistes`, `klimatistika`. 5–6 ερωτήσεις → βαθμολόγηση κάθε μοντέλου στα πραγματικά χαρακτηριστικά του (`lib/guides/smart.ts`) → «Τι χρειάζεσαι», πρόταση με **αιτιολόγηση** (✓ γιατί / ⚠ τι να έχεις υπόψη), 2 εναλλακτικές, σύγκριση, λίστα με τα φίλτρα του οδηγού. Είσοδοι: αρχική (ζώνη 11), mega menu, σελίδες κατηγορίας, άδειο καλάθι, footer. |

### v3.1 — mini cart, quick view, SEO · AEO · GEO, χωρίς scrollers

| Τι | Πού |
|---|---|
| **Mini cart slider** στο επίπεδο του buy box/checkout: navy header, η γραμμή που μόλις προστέθηκε επισημασμένη, μπάρα δωρεάν μεταφορικών, «Ταιριάζει με το καλάθι σου», σύνοψη με μεταφορικά/δόσεις, κίτρινο CTA, trust strip | `components/commerce/MiniCart.tsx` |
| **Quick view** από κάθε κάρτα (εικονίδιο ματιού): φωτογραφίες, key facts, τιμή + Omnibus, δόσεις, διαθεσιμότητα, ποσότητα, αγορά/καλάθι/λίστα/σύγκριση, σύνδεσμος στη σελίδα | `components/commerce/QuickViewSheet.tsx` |
| **SEO · AEO · GEO ανά προϊόν**: title/description/canonical/OG/Twitter, JSON-LD graph (Organization, Product+Offer με Omnibus, shipping, return policy, ενεργειακή ετικέτα, BreadcrumbList, FAQPage, WebPage speakable), ορατή ενότητα «Γρήγορες απαντήσεις» (AEO) και σύνοψη οντότητας μιας πρότασης (GEO). Demo panel στο τέλος κάθε PDP δείχνει τα σήματα | `lib/seo/product.ts`, `components/pdp/Answers.tsx` |
| **Στήλες ανά πλάτος**: `repeat(auto-fill, minmax(220px, 1fr))` — 2 στο κινητό, 3–5 ανάλογα με τον διαθέσιμο χώρο | `ProductGrid`, `ProductRail`, `DealsRail` |
| **Κανένας εσωτερικός scroller**: φίλτρα με «+ N ακόμη» αντί για scroll, chips/breadcrumbs/thumbs/side nav σε wrap, deals σε grid, buy box χωρίς max-height, πίνακες σύγκρισης → stacked layout σε στενά πλάτη (`CompareStacked`) | παντού |

### v4.7 (branch v2, τοπικά) — UI copy dictionary, tablet fixes, CMS collections

- `lib/cms/copy.ts` + `copy.generated.ts` (77 namespaces, 477 keys), `scripts/extract-copy.py`, `copyOf(ns)` σε 77 components. Tablet: announcement bar, bento breakpoint @5xl, touch targets έως 1023px. `docs/cms-collections.md`.

### v4.6 (branch v2, τοπικά) — Settings layer & component registry

- `lib/cms/settings.ts`: `site` / `motion` / `advisor` / `stickers` singletons + `SettingsProvider`/`useSettings()`. Motion primitives (Reveal, AutoReveal, Tilt, CountUp, hero, campaigns, services tile), ο Άρης (κείμενα, ερωτήσεις ανά context, exit-intent, cart tips, greeting), header/footer/announcement/facts, kWh, όριο μεταφορικών διαβάζουν από εκεί.
- `docs/component-registry.md`: 128 components με ρόλο, props, συνδέσεις, πεδία CMS, κίνηση, κατάσταση.

### v4.5 (branch v2, τοπικά) — Brand stores

- Σχήμα CMS `lib/cms/brand-store.ts` (θέμα, hero, blocks: new-arrivals / series / offers / story / tech / support / video, schedule, validator), renderer `lib/cms/brand-render.tsx`, components `components/brand/*`, δείγματα LG / Samsung / Apple στο `lib/data/fixtures/brandStores.ts`, `/brands/{slug}` (λίστα με `?all=1`), tiles στο `/brands`. Τεκμηρίωση: `docs/brand-store-schema.md`.

### v4.2–4.3 (branch v2, τοπικά) — Opener κατηγορίας, chips «Ρώτα τον Άρη», flicker-free reveals, καταστήματα από IP, WebP cutouts

- `CategoryOpener` (αριθμός-υδατογράφημα, live πλήθος, 3 cutouts, chips), `AskAris` (event `eu:ask` → AdvisorOrb με την ερώτηση), ελεύθερες ερωτήσεις στον Άρη μέσω `/api/advisor`.
- `Reveal`/`AutoReveal`: layout effect, ό,τι είναι ήδη ορατό δεν κρύβεται (τέλος στο flicker)· `CinematicHero`: πρώτο slide στατικό, χωρίς 3D.
- `/katastimata` «Κοντά σου» από IP, `/logariasmos/pliromes` κάρτες, `/logariasmos/rantevou` chip ημερών, Άρης σε 404/Snap/PDP.
- Cutouts σε WebP (`scripts/cutouts-manifest.mjs` → `.webp`), `HeroSlide.video` για ambient loop.

### v4.1 — Ζωντάνια παντού, «Άρης», Snap & Find, checkout wallets, λογαριασμός συσκευών

- `AutoReveal` (κάθε section κάθε σελίδας), tactile buttons, cutouts παντού μέσω `ProductImage`, `ProductGrid` stagger.
- **Σύμβουλος «Άρης»** (comic χαρακτήρας, `public/img/advisor`): orb, πάνελ, `SearchBox` advisor mode (`/api/advisor`, `lib/advisor/answer.ts`) με φωνή (Web Speech) και κάμερα, `SnapSheet` (tesseract.js), `CompareVerdict`, `StoreHandoff`, `ExitIntent`.
- **Stickers καμπανιών**: `Product.promo` (bogo / bundle / contest / cashback) → `BurstSticker`, `ContestSticker`, ribbon «Δώρο μαζί».
- **Checkout**: `WalletSheet` (Apple Pay / Google Pay / Revolut Pay), `SocialLogin` (Google / Microsoft / Facebook / Apple) στο βήμα 1 και στο `AuthForm`, `BrandMarks`.
- **Λογαριασμός**: `DeviceWallet` (δακτύλιος εγγύησης, έγγραφα, ιστορικό service, tips, hotline, ανταλλαγή), `ServiceRequest`, νέο dashboard.
- **Κοντινό κατάστημα από IP** (`lib/geo/ip.ts`, `NearestStoreCard`, `/api/stores/near`) με GPS refinement.
- **Ραντάρ ζήτησης** `/admin/radar` (demo, χωρίς auth).

### v4.0 — «Το αστέρι φωτίζει το προϊόν»: wow layer, Fit-My-Space, AR, AI σύμβουλος

- **Οπτική υπογραφή**: το αστέρι του λογότυπου ως πηγή φωτός (`components/motion/StarLight`, ακτίνες, ambient φως σε navy ζώνες, cursor spotlight), cutout φωτογραφίες προϊόντων (`public/img/cutouts`, rembg birefnet, manifest από `scripts/cutouts-manifest.mjs`), τεράστια τυπογραφία (`--fs-80…150`), ρυθμός navy/λευκό ανά ζώνη.
- **Κίνηση**: `Reveal` (κάθε ζώνη ανεβαίνει στο scroll), `CountUp`, `Tilt` (3D tilt με τον δείκτη), `CinematicHero` (τίτλος λέξη-λέξη, προϊόν που ακολουθεί τον δείκτη, γραμμή προόδου), fly-to-cart (`lib/motion/flyToCart`), shared-element View Transition κάρτα → σελίδα προϊόντος. Όλα απενεργοποιούνται με `prefers-reduced-motion`.
- **Stickers από δεδομένα** (`components/commerce/Stickers.tsx`): έκπτωση με ποσό κέρδους, «Λήγει σε N ημ.», «Τελευταία N», κορδέλα «Δώρο», «Επιλογή καταστήματος».
- **Fit-My-Space**: «Ο χώρος μου» (πόρτα, ασανσέρ, εσοχή· `components/space`), `FitBadge` σε κάθε κάρτα και στη σελίδα προϊόντος, διαστάσεις από specs ή κατηγορία (`lib/data/dims.ts`).
- **Ρεύμα σε ευρώ** (`components/pdp/EnergyCost`, `lib/energy/estimate.ts`): παλιά vs νέα συσκευή, κέρδος 3/5/8 ετών.
- **AR** (`components/ar/ArButton`): `<model-viewer>` με GLB (Android/WebXR) και USDZ (iOS Quick Look) ανά SKU από τις διαστάσεις — `scripts/gen-models.ts` + `scripts/gen-models.py` (pillow, usd-core) → `public/models`. QR για συνέχεια στο κινητό.
- **AI σύμβουλος** (`components/advisor`): αστέρι στη γωνία, σκηνή με έτοιμες ερωτήσεις ανά σελίδα (χωράει; ρεύμα; διαφορά;), hand-off σε κατάστημα. Demo απαντήσεις από τον κατάλογο· παραγωγή: AI Sales Engine (βλ. πρόταση DGSoft).

### v3.6 — Ζώνη καμπανιών κατασκευαστών & καθαρό λεκτικό αγοράς

- **Ζώνη 8 «Καμπάνιες κατασκευαστών»** (`components/widgets/CampaignSpotlight.tsx`, widget `campaign-spotlight`): τα 4 key visuals που τρέχουν σήμερα στο euronics.gr (Samsung Vision AI, Samsung OLED S95F, Miele 25 χρόνια εγγύηση μοτέρ, Dell οθόνες — `public/img/campaigns/`) σε φωτεινή ζώνη: λίστα καμπανιών με μικρογραφία αριστερά, το visual ολόκληρο σε λευκό «πόστερ» δεξιά. Hover/focus αλλάζει το πόστερ (hover intent 90 ms, κατευθυντική εναλλαγή με GSAP), χωρίς hover προχωρά μόνο του κάθε 7" με κίτρινη γραμμή προόδου, reveal στο scroll· `prefers-reduced-motion` απενεργοποιεί όλα. Κάτω από 768px: γραμμές με μικρογραφία, όλες ορατές, χωρίς tabs. Αντικατέστησε την επεξήγηση «Αγορά με 1 κλικ».
- **Λεκτικό αγοράς**: το «Παραγγελία με υποχρέωση πληρωμής» έγινε «Πληρωμή {ποσό} & ολοκλήρωση» με απλή σημείωση χρέωσης· η «υπαναχώρηση» παντού «Επιστροφή μέσα σε 14 ημέρες».
- **Υπηρεσία φύλαξης**: λεκτικό όπως στο live site («μέχρι να ετοιμαστεί ο χώρος σου»), χωρίς διάρκεια που δεν αναφέρεται εκεί.

### v3.5 — Αυτούσιες πολιτικές και footer από το live site

Όροι χρήσης, Πολιτική απορρήτου, Πολιτική cookies, Τρόποι πληρωμής, Τρόποι αποστολής/παράδοσης, Πολιτική επιστροφών και Οικονομικά στοιχεία (ισολογισμοί 2014–2018) αντιγράφηκαν **αυτούσια** από το euronics.gr στις 8/9/2026 (`lib/data/fixtures/policies.live.ts`, σήμα «Κείμενο αυτούσιο από το euronics.gr» με σύνδεσμο πηγής). Ο footer έχει τα «Χρήσιμα links», τα τηλέφωνα, το email και τα social (Facebook, Instagram, YouTube, Google Maps, Euronics International) του live site.

### v3.3 — Mega menu 3 επιπέδων & αναζήτηση με ζωντανά αποτελέσματα

- **Mega menu**: υποκατηγορίες με πλήθος, δημοφιλείς μάρκες, γρήγορα φίλτρα από τα χαρακτηριστικά, έξυπνος οδηγός και **προωθούμενο προϊόν με φωτογραφία, τιμή και «Αγορά με 1 κλικ»** ανά κατηγορία (`getMegaMenuData`, CMS-ready).
- **Αναζήτηση**: πεδίο με εύρος κατηγορίας και ζωντανά αποτελέσματα σε 4 ομάδες — προϊόντα με φωτογραφία/τιμή/δόση/διαθεσιμότητα, κατηγορίες με πλήθος, μάρκες, οδηγοί — highlight, πλοήγηση με βέλη, πρόσφατες & δημοφιλείς αναζητήσεις, προσφορά ημέρας στο κενό state (`/api/search`, Meilisearch-ready).

### v3.2 — Νέα, πλήρης λογαριασμός, δυναμικά components

| Τι | Πού |
|---|---|
| **Νέα & ανακοινώσεις**: `/nea` (φίλτρο κατηγορίας στο URL, featured + grid), `/nea/[slug]` (NewsArticle JSON-LD, CTA, σχετικά), ζώνη 12 στην αρχική, footer | `lib/data/fixtures/news.ts`, `components/news`, `components/widgets/NewsBand.tsx` |
| **Λογαριασμός**: Επισκόπηση με 6 πλακίδια + live timeline, Τα στοιχεία μου (προφίλ, κωδικός, 2FA, GDPR), Παραγγελίες & παρακολούθηση, Πληρωμές & δόσεις (masked κάρτες, προγράμματα δόσεων), Ραντεβού & service, Ειδοποιήσεις & συγκαταθέσεις (matrix θέμα × κανάλι) | `app/(shop)/logariasmos/*`, `components/account/*`, `lib/data/fixtures/account.ts` |
| **Data contract** για κάθε δυναμικό component (πηγή ERP/CMS, repository, cache) | [`docs/dynamic-components.md`](docs/dynamic-components.md) — κάθε component έχει σχόλιο `@dynamic` |
| **Σημειώσεις σχεδιασμού για τον πελάτη** (η αιτιολόγηση έφυγε από τα labels του site) | [`docs/design-notes-client.md`](docs/design-notes-client.md) |

Τυπογραφία: όλα τα κείμενα ≥ 14px (body 16px), fluid tokens `--fs-*`.

## Routes

| Περιοχή | Routes |
|---|---|
| Αρχική (12 ζώνες marketing) | `/` · `/?zones=1` δείχνει τους αριθμούς ζωνών |
| Κατάλογος | `/proionta` · `/k/{l1}` · `/k/{l1}/{l2}?brand=&min=&max=&avail=&sale=&energy=&sort=&page=&view=` · `/anazitisi?q=` · `/prosfores` · `/renew` · `/brands` · `/brands/{slug}` |
| Προϊόν | `/proion/{slug}` (gallery, sticky buy box, variants, δόσεις, απόθεμα ανά κατάστημα, add-ons, reviews, Q&A, related) · `/sygkrisi` · `/lista` |
| Αγορά | `/kalathi` → `/checkout` (στοιχεία & παράδοση → πληρωμή με κάρτα/δόσεις/IRIS/κατάθεση/αντικαταβολή → SCA) → `/checkout/epityxia?no=` · `/entopismos` (public tracking) · `/kartes-dorou` |
| Λογαριασμός | `/eisodos` · `/eggrafi` · `/logariasmos` · `/logariasmos/paraggelies` · `/logariasmos/paraggelies/{no}` · `/logariasmos/dieythynseis` · `/logariasmos/epistrofes` (RMA) · `/logariasmos/eggyiseis` |
| Δίκτυο & υπηρεσίες | `/katastimata?q=&region=&service=` · `/katastimata/{slug}` (LocalBusiness JSON-LD) · `/ypiresies` · `/ypiresies/{slug}` (κράτηση) |
| Περιεχόμενο | `/odigoi` · `/odigoi/{slug}` · `/tropoi-pliromis` · `/tropoi-apostolis` · `/epistrofes` · `/oroi-chrisis` · `/aporrito` · `/cookies` · `/etaireia` · `/syxnes-erotiseis` · `/epikoinonia` |
| Πρόταση | `/protasi` — παρουσίαση ανασχεδιασμού 18 σελίδων A4, εκτυπώσιμη |

Demo δεδομένα για tracking/λογαριασμό: παραγγελίες `EUR-20260904-0417`, `EUR-20260812-0093`, `EUR-20260620-1188`. Κουπόνι `EURONICS10`.

## Δομή

- `lib/data/fixtures/` — προϊόντα (`products.real.ts` = scraped από euronics.gr 8/9/2026, `products.ts` = design fixtures), καταστήματα, υπηρεσίες, οδηγοί, πολιτικές/FAQ, παραγγελίες.
- `lib/data/repo.ts` — repository (ίδιες υπογραφές με τη μελλοντική Prisma υλοποίηση).
- `lib/cms/` — μοντέλο ζωνών/widgets (schedule, ορατότητα ανά συσκευή, A/B) + registry.
- `components/fluid/` — device class από server, container queries, `FluidContent`.
- `components/commerce/CartProvider.tsx` — καλάθι/wishlist/σύγκριση με persistence (localStorage).
- `prisma/schema.prisma` — commerce core (ERP-direct).
- `docs/` — audits euronics.gr / web.kolleris.com / kotsovolos.gr και τα αρχεία Claude Design.

Stack: Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · Motion · Manrope (Greek+Latin) · Prisma/MySQL (schema only).

## Deploy (Coolify)

Το repo έχει `Dockerfile` (Next.js standalone, node:24-alpine, non-root, healthcheck στο `/`). Στο Coolify:

1. New Resource → **Public Repository** → `https://github.com/cloudzeus/demo-euronics`, branch `master`.
2. Build Pack: **Dockerfile** (αυτόματα εντοπίζεται). Port **3000**. Καμία μεταβλητή περιβάλλοντος δεν χρειάζεται — τα δεδομένα είναι στατικά fixtures και οι εικόνες τοπικές.
3. Deploy. Το image είναι ~55 MB runtime (standalone) και ξεκινά με `node server.js`.

Εναλλακτικά με Nixpacks: build `npm run build`, start `npm start`, port 3000.
