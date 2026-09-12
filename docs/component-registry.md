# Component registry — συμβόλαιο για το CMS

Παράγεται από `scripts` σάρωση + σχολιασμό (12/9/2026). Ενημέρωση 12/9 (v4.7): τα κείμενα UI βγήκαν στο `lib/cms/copy.generated.ts` (77 namespaces, 477 κλειδιά) μέσω `scripts/extract-copy.py`· κάθε component διαβάζει `copyOf("<namespace>")`. Στήλες: **Ρόλος**, **Props** (όπως δηλώνονται), **Συνδέσεις** (repo/API/settings), **Πεδία CMS** (τι επεξεργάζεται ο διαχειριστής), **Κίνηση** (αν χρησιμοποιεί τα motion primitives → ρυθμίζεται από `settings.motion`), **Κατάσταση**: ✅ παραμετροποιημένο/δυναμικό, 🔶 παίρνει props αλλά έχει σκληρά κείμενα, ⬜ στατικό UI.

Οι κεντρικές ρυθμίσεις (`lib/cms/settings.ts`): `site` (facts, επικοινωνία, όρια εμπορίου, ζώνη όρων), `motion` (durations/easings/stagger/autoplay/on-off), `advisor` (Άρης: όνομα, avatar, κείμενα, ερωτήσεις ανά context, exit-intent, cart tips), `stickers` (labels, όρια). Τα brand stores στο `docs/brand-store-schema.md`, οι ζώνες αρχικής στο `lib/cms/home.layout.ts`.

| Component | Ρόλος | Props | Συνδέσεις | Πεδία CMS | Κίνηση | Κατάσταση |
|---|---|---|---|---|---|---|
| `account/AccountNav.tsx` | AccountNav | — | — | — | — | ✅ |
| `account/AuthForm.tsx` | AuthForm | — | — | — | — | ✅ |
| `account/ConsentsForm.tsx` | ConsentsForm | — | — | — | — | ✅ |
| `account/DeviceWallet.tsx` | Οι συσκευές μου | WarrantyRing(pct, daysLeft, years, size); DeviceCard(d, compact) | orders × devices (SRVJOB/PIM) | λεκτικά | settings.motion | ✅ |
| `account/OrderTimeline.tsx` | StatusChip, OrderTimeline | OrderTimeline(order) | — | — | — | ✅ |
| `account/ProfileForm.tsx` | ProfileForm | ProfileForm(customer) | — | — | — | ✅ |
| `account/ReturnForm.tsx` | ReturnForm | ReturnForm(orders) | — | — | — | 🔶 |
| `account/ServiceRequest.tsx` | Δήλωση βλάβης | — | SRVJOB | λεκτικά, slots | — | ✅ |
| `advisor/AdvisorContext.tsx` | AdvisorProvider, useAdvisor | — | — | — | — | ⬜ |
| `advisor/AdvisorGreeting.tsx` | Καλωσόρισμα | — | settings.advisor.greeting | κείμενα, χρόνοι | — | ✅ |
| `advisor/AdvisorOrb.tsx` | Ο Άρης (orb + πάνελ) | — | /api/advisor · settings.advisor · MySpace | όνομα, avatar, κείμενα, ερωτήσεις | settings.motion | ✅ |
| `advisor/AskAris.tsx` | Chip ερώτησης | AskAris(q, tone) | event eu:ask | — | — | ⬜ |
| `advisor/StoreHandoff.tsx` | Παράδοση σε κατάστημα | StoreHandoff(summary, onClose) | nearest store · SoftOne lead | λεκτικά | — | ✅ |
| `ar/ArButton.tsx` | AR | ArButton(id, title, dims, className) | /models/{id}.glb|usdz | λεκτικά | — | ✅ |
| `brand/BrandBlocks.tsx` | Brand store blocks | NewArrivals(b); Series(b); Offers(b); Support(b) | BrandStore (CMS) | όλα | settings.motion | ✅ |
| `brand/BrandFrame.tsx` | BrandFrame, BlockHead | BrandFrame(theme); BlockHead(kicker, title) | — | — | — | ⬜ |
| `brand/BrandHero.tsx` | Brand store hero | BrandHero(store) | BrandStore (CMS) | όλα | — | ✅ |
| `brand/BrandStoreTiles.tsx` | BrandStoreTiles | — | getProductsByIds | — | settings.motion | ✅ |
| `catalog/CategoryFaq.tsx` | CategoryFaq | — | — | — | — | ⬜ |
| `catalog/CategoryOpener.tsx` | Opener κατηγορίας | CategoryOpener(kicker, title, no, count, lead, products) | listProducts top3 · settings.advisor.suggestions.byCategory | ερωτήσεις, lead | settings.motion | ✅ |
| `catalog/CompareStacked.tsx` | CompareStacked | CompareStacked(products, rows, val) | — | — | — | ✅ |
| `catalog/CompareTable.tsx` | CompareTable | — | — | — | — | ✅ |
| `catalog/CompareVerdict.tsx` | Εξήγησέ μου τη διαφορά | — | compareRows · estimateKwh | λεκτικά | — | ✅ |
| `catalog/Facets.tsx` | Facets | Facets(result, showCategories) | — | — | — | ✅ |
| `catalog/Pagination.tsx` | Pagination | Pagination(page, pages, basePath) | — | — | — | ✅ |
| `catalog/ProductGrid.tsx` | ProductGrid | ProductGrid(products, view) | — | — | settings.motion | ✅ |
| `catalog/SortBar.tsx` | SortBar | SortBar(total, page) | — | — | — | ✅ |
| `catalog/WishlistGrid.tsx` | WishlistGrid | — | — | — | — | ✅ |
| `checkout/BrandMarks.tsx` | AppleMark, GoogleMark | AppleMark(className); GoogleMark(className); MicrosoftMark(className); FacebookMark(className); RevolutMark(className); FaceIdMark(className) | — | — | — | ⬜ |
| `checkout/CartAdvisorTip.tsx` | Ο Άρης στο καλάθι | CartAdvisorTip(lines, subtotal) | settings.advisor.cartTips · upsell rules | κείμενα, κανόνες | — | ✅ |
| `checkout/CartView.tsx` | Σελίδα καλαθιού | CartView(services) | CartProvider · services · crossSell | λεκτικά, trust strip | — | ✅ |
| `checkout/Checkout.tsx` | Checkout 3 βημάτων | — | CartProvider · stores · PSP · Auth.js | λεκτικά, τρόποι παράδοσης/πληρωμής, όρια (settings.site.commerce) | — | ✅ |
| `checkout/OrderSuccess.tsx` | Επιτυχία παραγγελίας | — | lastOrder · settings.advisor.thankYou | λεκτικά | — | ✅ |
| `checkout/SocialLogin.tsx` | Social login | SocialLogin(onSignedIn, compact, false, providers) | Auth.js providers | providers list | — | ✅ |
| `checkout/Stepper.tsx` | Stepper | — | — | — | — | ✅ |
| `checkout/WalletSheet.tsx` | Apple/Google/Revolut Pay | WalletSheet(kind, total, itemsLabel, address, onDone, onClose) | PSP (Payment Request API) | brand copy | — | ✅ |
| `commerce/AddButton.tsx` | AddButton | AddButton(product, label) | — | — | — | ⬜ |
| `commerce/CardCarousel.tsx` | Rail με βέλη | CardCarousel(children, minItem, 240, minItemNarrow, 300, gap, 16, label) | — | ελάχιστο πλάτος κάρτας | settings.motion | ✅ |
| `commerce/CartProvider.tsx` | Καλάθι/λίστα/σύγκριση state | — | localStorage · settings.site.commerce | όριο δωρεάν μεταφορικών | — | ✅ |
| `commerce/CompareTray.tsx` | CompareTray | — | — | — | — | ✅ |
| `commerce/Countdown.tsx` | Countdown | Countdown(endsAt, variant, tone, className) | getTime | — | — | ⬜ |
| `commerce/EnergyChip.tsx` | EnergyChip | EnergyChip(cls, fiche, compact) | — | — | — | ✅ |
| `commerce/FreeShippingProgress.tsx` | FreeShippingProgress | FreeShippingProgress(subtotal, threshold) | — | — | — | ⬜ |
| `commerce/GiftCardBuilder.tsx` | GiftCardBuilder | — | — | — | — | ✅ |
| `commerce/MiniCart.tsx` | Mini cart | MiniCart(suggestions) | CartProvider · cross-sell ids | λεκτικά, προτάσεις | — | ✅ |
| `commerce/ProductCard.tsx` | Κάρτα προϊόντος | ProductCard(product, p, priority, false, dealEndsAt, tone) | Product (ERP) · cutouts · stickersFor · MySpace | stickers (settings.stickers), λεκτικά κουμπιών | settings.motion | ✅ |
| `commerce/ProductImage.tsx` | Πλαίσιο φωτογραφίας | ProductImage(src, alt, sizes, priority, false, className, pad, rounded, frame, true, cutout) | cutouts manifest (DAM) | — | — | 🔶 |
| `commerce/ProductRow.tsx` | ProductRow | ProductRow(product) | — | — | — | ✅ |
| `commerce/QuickBuySheet.tsx` | Αγορά με 1 κλικ | — | CartProvider · PSP | λεκτικά, τρόποι πληρωμής | — | ✅ |
| `commerce/QuickViewSheet.tsx` | Γρήγορη προβολή | — | Product | λεκτικά | — | ✅ |
| `commerce/Stickers.tsx` | Σύστημα stickers | CornerSticker(s, compact) | Product.badge/promo/stockLeft/storePick · settings.stickers | labels, όρια | — | ✅ |
| `commerce/WishlistButton.tsx` | WishlistButton, CompareCheckbox | WishlistButton(id, className) | — | — | — | ✅ |
| `doc/DocPage.tsx` | DocPage, PageHead | DocPage(children, no, tone, label, className); PageHead(title, section, no, tone); Kicker(children, tone); Body(children, className, dark); Callout(title, children, tone); Finding(no, title); Table(head, rows, widths, headTone, dense); Tag(children, tone) | — | — | — | ⬜ |
| `fluid/DeviceProvider.tsx` | widthToDevice, DeviceProvider | DeviceProvider(initial, children) | — | — | — | ⬜ |
| `fluid/Fluid.tsx` | sizeOf, FluidContent | FluidContent(children, fallback, className, Tag); ForDevice(devices, children, className) | — | — | — | ⬜ |
| `fluid/StickySidebar.tsx` | StickySidebar | StickySidebar(children, top, topProp, gap, 16, className) | getBoundingClientRect, getComputedStyle, getPropertyValue | — | — | ⬜ |
| `guides/SmartGuide.tsx` | SmartGuide | SmartGuide(kind) | — | — | — | ✅ |
| `motion/AutoReveal.tsx` | Reveal σε κάθε σελίδα | — | settings.motion | on/off | settings.motion | ✅ |
| `motion/CountUp.tsx` | Count-up | CountUp(value, suffix, prefix, duration, durationProp, className) | settings.motion.countUp | duration | settings.motion | ✅ |
| `motion/Reveal.tsx` | Reveal στο scroll | Reveal(Tag, children, className, stagger, staggerProp, y, yProp, delay, 0, once) | settings.motion.reveal | duration, y, stagger | settings.motion | ✅ |
| `motion/Spotlight.tsx` | Cursor spotlight | Spotlight(className) | settings.motion.hero.spotlight | on/off | — | ⬜ |
| `motion/StarLight.tsx` | Αστέρι-φως | StarLight(size, 56, className, rays, true, glow) | — | size | — | ⬜ |
| `motion/Tilt.tsx` | 3D tilt | Tilt(children, className, max, maxProp, scale, scaleProp, disabled) | settings.motion.tilt | max, scale, on/off | settings.motion | ✅ |
| `news/NewsCard.tsx` | NewsCard | NewsCard(item, priority, false, featured) | getNewsCategories | — | — | ✅ |
| `pdp/Answers.tsx` | AEO/GEO απαντήσεις | Answers(product); SeoPanel(product, p) | lib/seo/product · settings.advisor.suggestions.product | ερωτήσεις | — | ✅ |
| `pdp/BuyBox.tsx` | Buy box | BuyBox(product, p, addons, stores) | Product · services · stores · CartProvider | λεκτικά, add-ons | — | ✅ |
| `pdp/CompactRail.tsx` | CompactRail | CompactRail(title) | — | — | — | ⬜ |
| `pdp/CompareSimilar.tsx` | CompareSimilar | CompareSimilar(product, p) | — | — | — | ✅ |
| `pdp/EnergyCost.tsx` | Ρεύμα σε ευρώ | EnergyCost(product) | estimateKwh · settings.site.commerce.kwhPrice | τιμή kWh, πίνακες | settings.motion | ✅ |
| `pdp/Gallery.tsx` | Gallery + View Transition | Gallery(productId, images, title, badge, energy, actions) | Product.images · cutouts | — | settings.motion | ✅ |
| `pdp/ProductHeader.tsx` | keyFacts, ProductHeader | ProductHeader(product, p) | — | — | — | ✅ |
| `pdp/ProductRail.tsx` | ProductRail | ProductRail(title) | — | — | — | ⬜ |
| `pdp/Questions.tsx` | Questions | Questions(product) | — | — | — | ✅ |
| `pdp/RecentlyViewed.tsx` | RecentlyViewed | — | getItem | — | — | ✅ |
| `pdp/Reviews.tsx` | Reviews | Reviews(product) | — | — | — | ✅ |
| `pdp/SectionNav.tsx` | SectionNav | — | getElementById | — | — | ✅ |
| `pdp/ServicesDelivery.tsx` | ServicesDelivery | ServicesDelivery(product, p) | — | — | — | ✅ |
| `pdp/SpecsTable.tsx` | SpecsTable | SpecsTable(specs) | — | — | — | ✅ |
| `pdp/StickyBar.tsx` | StickyBar | StickyBar(product) | — | — | — | ✅ |
| `services/ServiceBooking.tsx` | ServiceBooking | — | — | — | — | 🔶 |
| `site/AnnouncementBar.tsx` | Ζώνη όρων | AnnouncementBar(left, right, accent, zoneNo) | settings.site.announcement | κείμενα | — | ⬜ |
| `site/Breadcrumbs.tsx` | Breadcrumbs | — | — | — | — | ✅ |
| `site/CartButton.tsx` | CartButton | — | — | — | — | ⬜ |
| `site/ContactForm.tsx` | ContactForm | — | — | — | — | ✅ |
| `site/CookieConsent.tsx` | CookieConsent | — | getItem | — | — | ✅ |
| `site/ExitIntent.tsx` | Πριν φύγεις | — | settings.advisor.exitIntent · email service | λόγοι, απαντήσεις, χρόνοι | — | ✅ |
| `site/MegaNav.tsx` | Mega menu | MegaNav(data) | getMegaMenuData (CMS menu) | ανά κατηγορία: υποκατηγορίες, μάρκες, promo | settings.motion | ✅ |
| `site/MobileMenu.tsx` | MobileMenu | — | — | — | — | ✅ |
| `site/PageIntro.tsx` | PageIntro | PageIntro(kicker, title, lead, right, tone) | — | — | — | ⬜ |
| `site/PolicyPage.tsx` | PolicyPage | PolicyPage(policy, children) | — | — | — | ✅ |
| `site/SearchBox.tsx` | Αναζήτηση + σύμβουλος | SearchBox(compact) | /api/search, /api/advisor · settings.advisor.suggestions.search | προτάσεις, placeholder | — | ✅ |
| `site/SettingsProvider.tsx` | SettingsProvider, useSettings | SettingsProvider(settings) | settings | — | — | ✅ |
| `site/SiteFooter.tsx` | Footer | — | live links · settings.site.contact/social (προς σύνδεση) | links, social | — | ✅ |
| `site/SiteHeader.tsx` | Header | — | settings.site.contact | τηλέφωνο, labels | — | ✅ |
| `site/StickyHeader.tsx` | StickyHeader | — | — | — | — | ⬜ |
| `site/ZoneBadge.tsx` | ZoneBadge | — | — | — | — | ⬜ |
| `site/ZonesToggle.tsx` | ZonesToggle | — | — | — | — | ⬜ |
| `snap/SnapSheet.tsx` | Snap & Find | — | tesseract.js → /api/search → /api/advisor | λεκτικά | — | ✅ |
| `space/FitBadge.tsx` | Χωράει; | FitBadge(product, size, prompt) | dimsFor · fitVerdict | κείμενα ενδείξεων | — | ✅ |
| `space/MySpaceProvider.tsx` | MySpaceProvider, useMySpace | — | getItem | — | — | ✅ |
| `space/MySpaceSheet.tsx` | Ο χώρος μου | MySpaceButton(className) | localStorage → προφίλ | λεκτικά, προεπιλογές | — | ✅ |
| `stores/NearestStoreCard.tsx` | Κοντινό κατάστημα | NearestStoreCard(initial, geoCity, geoSource, variant) | IP → GPS → /api/stores/near | λεκτικά | — | ✅ |
| `stores/StoreMap.tsx` | StoreMap | — | — | — | — | 🔶 |
| `ui/badge.tsx` |  | — | — | — | — | ⬜ |
| `ui/button.tsx` |  | — | — | — | — | ⬜ |
| `ui/checkbox.tsx` |  | — | — | — | — | ⬜ |
| `ui/dialog.tsx` |  | — | — | — | — | ⬜ |
| `ui/input.tsx` |  | — | — | — | — | ⬜ |
| `ui/separator.tsx` |  | — | — | — | — | ⬜ |
| `ui/sheet.tsx` |  | — | — | — | — | ⬜ |
| `widgets/BentoHero.tsx` | Bento ζώνης 4 | BentoHero(slides, deal, store, geoCity, geoSource, services, intervalMs, zoneNo) | getHeroSlides, getDealOfDay, getNearestStoreWithGeo, getServices | σειρά/ορατότητα tiles | — | ✅ |
| `widgets/CampaignSpotlight.tsx` | Καμπάνιες κατασκευαστών | CampaignSpotlight(campaigns, zoneNo, title, kicker) | CMS campaigns · motion.campaigns | καμπάνιες, KV, autoplay | settings.motion | ✅ |
| `widgets/CategoryGrid.tsx` | Κατηγορίες 01–09 | CategoryGrid(categories, featured) | getCategories · CMS featured | τίτλοι, featured | — | ⬜ |
| `widgets/CinematicHero.tsx` | Hero ζώνης 4 | CinematicHero(slides, intervalMs) | CMS slides (κείμενα, cutout, video, links) · motion.hero | κείμενα, εικόνες, video, interval | settings.motion | ✅ |
| `widgets/DealOfDayTile.tsx` | Προσφορά ημέρας | DealOfDayTile(product, p) | CMS deal schedule + ERP τιμή/Omnibus | προϊόν, λήξη, λεκτικά | settings.motion | ✅ |
| `widgets/DealsRail.tsx` | Προσφορές εβδομάδας | DealsRail(products, endsAt, label, title) | listProducts(tag) + endsAt | τίτλος, query, λήξη | — | ⬜ |
| `widgets/GuidesBand.tsx` | Οδηγοί | GuidesBand(guides) | getGuides | οδηγοί | — | ✅ |
| `widgets/HeroSlider.tsx` | HeroSlider | HeroSlider(slides, intervalMs) | — | — | — | ⬜ |
| `widgets/NewsBand.tsx` | Νέα | NewsBand(items) | getNews | νέα | — | ✅ |
| `widgets/NewsletterBand.tsx` | Newsletter | — | CMS copy · consent ledger | λεκτικά | — | ✅ |
| `widgets/QuickBuyExplainer.tsx` | QuickBuyExplainer | QuickBuyExplainer(product, p) | — | — | — | 🔶 |
| `widgets/SectionHead.tsx` | SectionHead | SectionHead(id, kicker, title, link, tone) | — | — | — | ⬜ |
| `widgets/ServicesBand.tsx` | Υπηρεσίες + facts | ServicesBand(services) | getServices · settings.site.facts | facts, τίτλοι | settings.motion | ✅ |
| `widgets/ServicesTile.tsx` | Εναλλαγή υπηρεσιών | ServicesTile(services, total) | getServices · motion.servicesTile | υπηρεσίες, interval | settings.motion | ✅ |
| `widgets/SmartGuidesBand.tsx` | SmartGuidesBand | — | — | — | — | ✅ |
| `widgets/StoreFinder.tsx` | Δίκτυο καταστημάτων | StoreFinder(store, image, zoneNo, geoCity, geoSource) | IP geo · settings.site | λεκτικά, εικόνα | — | ✅ |
| `widgets/StoreTile.tsx` | Κατάστημα-ραντάρ | StoreTile(initial, geoCity) | IP → GPS, stores | λεκτικά | — | ✅ |
| `widgets/Ticker.tsx` | Ticker | Ticker(items) | CMS items | μηνύματα | — | ✅ |
