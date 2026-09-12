# Πρόταση CMS collections (για μετά την έγκριση)

Στόχος: κάθε τι που βλέπει ο πελάτης να αλλάζει από το CMS χωρίς κώδικα. Ο κώδικας ξέρει μόνο **σχήματα** (types) και **renderers**. Τα παρακάτω αντιστοιχούν 1:1 σε αρχεία του demo, ώστε η μετάβαση να είναι μηχανική.

| Collection | Τι περιέχει | Σχήμα στο demo | Renderer / consumer | Cache |
|---|---|---|---|---|
| **Settings › Site** | facts, επικοινωνία, όρια εμπορίου (δωρεάν μεταφορικά, επιστροφή, δόσεις, αντικαταβολή, kWh), ζώνη όρων, social | `SiteSettings` (`lib/cms/settings.ts`) | header, footer, announcement, ServicesBand, EnergyCost, CartProvider, Checkout | ISR 300s |
| **Settings › Motion** | durations, easings, stagger, autoplay, on/off ανά κίνηση | `MotionSettings` | Reveal, AutoReveal, Tilt, CountUp, CinematicHero, CampaignSpotlight, ServicesTile, flyToCart | ISR 300s |
| **Settings › Advisor (Άρης)** | όνομα, avatar, κείμενα, ερωτήσεις ανά context, exit-intent, cart tips, greeting, thank-you, 404 | `AdvisorSettings` | AdvisorOrb, AdvisorGreeting, SearchBox, CategoryOpener, Answers, ExitIntent, CartAdvisorTip, OrderSuccess, not-found | ISR 300s |
| **Settings › Stickers** | labels, όρια «Τελευταία N», «Λήγει σε N» | `StickerSettings` | Stickers.tsx | ISR 300s |
| **Copy** | κάθε label UI ανά namespace/key, πολυγλωσσικό | `lib/cms/copy.generated.ts` (77 namespaces, 477 keys) | `copyOf(ns)` σε 77 components | ISR 300s |
| **Home zones** | 13 ζώνες: widget type, props, query, schedule, A/B, ορατότητα ανά συσκευή | `Zone`/`WidgetInstance` (`lib/cms/zones.ts`, `home.layout.ts`) | `renderZones()` | ISR 60s |
| **Hero slides** | kicker, τίτλος 3 γραμμών, κείμενο, CTA, φωτογραφία, cutout, video, link προϊόντος | `HeroSlide` | CinematicHero | ISR 60s |
| **Campaigns** | key visuals κατασκευαστών: μάρκα, τίτλος, κείμενο, CTA, εικόνα, σειρά, schedule | `VendorCampaign` | CampaignSpotlight | ISR 60s |
| **Brand stores** | θέμα, hero, blocks (new-arrivals/series/offers/story/tech/support/video), προϊόντα με id | `BrandStore` (`lib/cms/brand-store.ts`, `docs/brand-store-schema.md`) | `renderBrandStore()` | ISR 300s |
| **Menu** | ανά κατηγορία: υποκατηγορίες + descriptors, μάρκες, γρήγορα φίλτρα, οδηγός, promo προϊόν | `getMegaMenuData()` | MegaNav | ISR 300s |
| **Categories** | no, τίτλος, break, count (live), meta, featured, facets | `Category` | CategoryGrid, CategoryOpener, listings | ISR 300s |
| **Services** | 13 υπηρεσίες: τίτλος, blurb, τιμή, add-on σημεία, sourceUrl | `Service` | ServicesBand/Tile, BuyBox, Checkout, Cart | ISR 3600s |
| **Guides / Smart guides** | οδηγοί blog + κριτήρια/βάρη έξυπνων οδηγών | `Guide`, `lib/guides/smart.ts` | GuidesBand, SmartGuide | ISR 300s |
| **News** | νέα με κατηγορία, εικόνα, CTA | `NewsItem` | NewsBand, /nea | ISR 300s |
| **Policies** | αυτούσια κείμενα (όροι, απόρρητο, cookies, πληρωμές, αποστολές, επιστροφές) | `Policy` | PolicyPage | ISR 3600s |
| **FAQ** | γενικές και ανά κατηγορία | `Faq`, CategoryFaq | CategoryFaq, /syxnes-erotiseis | ISR 3600s |
| **Stores** | 350 καταστήματα: στοιχεία, ωράρια, υπηρεσίες, lat/lng (από SoftOne BRANCH + CMS ωράρια) | `Store` | StoreFinder, StoreTile, /katastimata, handoff | ISR 3600s |
| **Promo rules** | Product.promo (1+1, bundle, contest, cashback), storePick, stockLeft (ERP) | `Product` fields | Stickers | ISR 60s |
| **Radar (read-only)** | συγκεντρωτικά από συνομιλίες/αναζητήσεις | `RadarSummary` | /admin/radar | nightly |

## Κανόνες σχεδίασης των collections

1. **Προϊόντα μόνο με id** σε κάθε collection· τιμές/απόθεμα/stickers έρχονται live από τον κατάλογο (SoftOne).
2. **Schedule** (`from`/`to`) και **enabled** σε κάθε widget/block/campaign/slide· ο renderer φιλτράρει με `blockActive`.
3. **Assets** ως URLs του DAM· cutouts με manifest ανά SKU.
4. **Θέματα** ως tokens (hex + mode), ποτέ CSS.
5. **Validator** ανά collection (`validateBrandStore` ως πρότυπο): λάθος εγγραφή = warning + παράλειψη, όχι σπασμένη σελίδα.
6. **Copy**: ένα key ανά label, namespace = component· γλώσσες ως στρώματα override.
7. **Motion**: κάθε κίνηση έχει on/off και σέβεται `prefers-reduced-motion` ανεξάρτητα από το CMS.
