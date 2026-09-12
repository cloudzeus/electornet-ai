# Brand Store — σχήμα για το CMS

Μια σελίδα κατασκευαστή (`/brands/{slug}`) περιγράφεται **μόνο με δεδομένα**. Ο κώδικας (`lib/cms/brand-store.ts`, `lib/cms/brand-render.tsx`, `components/brand/*`) δεν αλλάζει όταν προστίθεται μάρκα ή αλλάζει περιεχόμενο. Δείγματα: LG, Samsung, Apple στο `lib/data/fixtures/brandStores.ts`.

## Εγγραφή `BrandStore`

| Πεδίο | Τύπος | Σημείωση |
|---|---|---|
| `slug` | string | ίδιο με το slug της μάρκας στον κατάλογο |
| `name`, `wordmark`, `tagline` | string | το wordmark είναι κείμενο μέχρι να αδειοδοτηθεί το επίσημο asset |
| `theme` | `{ bg, bg2, ink, muted, accent, accentInk, mode }` | 6 hex χρώματα + `light`/`dark`. Γίνονται CSS variables `--bs-*`· κανένα χρώμα μάρκας στον κώδικα |
| `hero` | `{ kicker, title[], body, cta, productId, image?, video? }` | το `productId` δίνει το cutout που αιωρείται· `image` = key visual πίσω, θαμπό |
| `blocks[]` | `BrandBlock[]` | με τη σειρά εμφάνισης |
| `seo` | `{ title, description }` | |

## Blocks (`type` → props)

| `type` | Props | Τι δείχνει |
|---|---|---|
| `new-arrivals` | `productIds[]`, `lead?` | 3 μεγάλα cutouts σε σκηνές με το accent, «Νέο» |
| `series` | `items[{ name, blurb, image, productIds[], href? }]` | κάρτες σειρών με φωτογραφία και chips προϊόντων |
| `offers` | `productIds[]`, `endsAt` | rail με τις κάρτες Euronics (stickers, fit, quick buy) + πραγματική λήξη |
| `story` | `image, body, cta?, align?` | editorial split |
| `tech` | `items[{ icon, title, blurb }]` | πλακίδια τεχνολογίας (icons: cpu, eye, zap, wifi, shield, sparkles, leaf, camera) |
| `support` | `facts[]`, `askAris[]?` | εγγύηση/service + chips «Ρώτα τον Άρη» |
| `video` | `src, poster, caption?` | muted loop |

Κοινά σε κάθε block: `id`, `enabled?`, `schedule?{from,to}`, `kicker?`, `title?`.

## Κανόνες

- Προϊόντα **μόνο με id**· ο renderer τα διαβάζει από τον κατάλογο σε μία κλήση (τιμές, stickers, απόθεμα πάντα live).
- Εικόνες = URLs από το DAM. Cutouts βρίσκονται αυτόματα από το manifest.
- `validateBrandStore()` ελέγχει τη δομή (χρώματα hex, γνωστοί τύποι, πίνακες)· άγνωστο block παραλείπεται με warning, δεν σπάει η σελίδα.
- Το Euronics chrome (header, footer, Άρης) μένει σε χρώματα Euronics· το θέμα της μάρκας ισχύει μόνο μέσα στο `BrandFrame`.
- Η λίστα με φίλτρα παραμένει στο `?all=1`.
- Νέος τύπος block = μία γραμμή στο union + ένα component + μία γραμμή στο registry.
