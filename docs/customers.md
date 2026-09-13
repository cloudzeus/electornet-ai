# Customers, consent evidence, newsletter, GDPR

## Models (prisma/schema.prisma)
| Model | Purpose |
|---|---|
| `Customer` | Retail account: type (individual/business), identity (ΑΦΜ/ΔΟΥ), contact, status (active/blocked/anonymised), source, tags, newsletter flag, loyalty (points/tier/card), preferred store, ERP link (`erpTrdr`, `erpCode`, `erpSyncStatus`, `erpSyncedAt`, `erpLastError`), `number` (auto → ERP CODE `WEB000123`). |
| `SocialAccount` | Google / Microsoft / Facebook / Apple identities. |
| `Address` | Shipping/billing addresses (recipient, floor, doorbell, notes, lat/lng); extra addresses → SoftOne `CUSBRANCH` (`erpBranch` = LINENUM). |
| `Consent` | **Append-only ledger**: topic × channel × granted, method (checkbox / double-opt-in / account-toggle / admin / store-form), source, wording (`textKey`, `textVersion`, `textHash`), `url`, `ip` + `ipHash`, `userAgent`, `os`, `browser`, `device`, `locale`, `timezone`, `referer`, `confirmedAt`, `staffId`, free `evidence`. |
| `ConsentText` | Versioned wordings with sha256 — what the person actually saw. |
| `LoginEvent` | Every auth attempt (customer or staff): success/failure + reason, method, ip/ipHash, os, browser, device. |
| `NewsletterSubscriber` | Audience with double opt-in token, status (pending/subscribed/unsubscribed/bounced/complained), source, lists, external id for Mailchimp/Klaviyo. |
| `GdprRequest` | Data-subject requests (access, portability, rectification, erasure, restriction, objection, withdraw-consent) with 30-day `dueAt`, identity verification, timeline, outcome. |
| `CustomerDevice` | Warranty wallet: product, serial, purchase, warranty/extension, invoice, source. |
| `ServiceTicket` | Repair / installation / delivery / pickup / warranty claim with status, appointment, technician, timeline, SoftOne job. |
| `LoyaltyTransaction`, `CustomerNote`, `CustomerEvent`, `EmailLog` | Points ledger, internal notes, activity timeline, outgoing mail proof. |

## Evidence (`lib/gdpr/evidence.ts`)
`captureEvidence()` reads the real client IP (`cf-connecting-ip` → `x-real-ip` → first `x-forwarded-for`), user agent (parsed to OS · browser · device), accept-language, referer, page URL and the client timezone. `ipHash` = sha256(EVIDENCE_SALT|AUTH_SECRET + ip) survives erasure. `recordConsent()` / `recordLogin()` (`lib/gdpr/consent.ts`) write the rows.

## Newsletter (`lib/newsletter`, `/api/newsletter/*`)
Footer form → `POST /api/newsletter/subscribe` (sends the exact wording, URL, timezone) → subscriber `pending` + consent row (method double-opt-in) → confirmation email (`lib/email/send.ts`: SMTP / Resend / SendGrid from Settings → Email & SMS; logged in `EmailLog`, «skipped» until configured) → `GET /api/newsletter/confirm?token` → `subscribed` + consent row with `confirmedAt` and confirm IP → `/newsletter?ok=confirmed`. Unsubscribe link `GET /api/newsletter/unsubscribe?token` → consent row granted=false. Admin `/admin/newsletter`: stats, filters, CSV export (audited), add with double opt-in, «Επιβεβαίωση» with written evidence (store form), unsubscribe with reason.

## Admin customers (`/admin/customers`)
Tabs: Προφίλ · Διευθύνσεις · Παραγγελίες · Συσκευές & εγγυήσεις · Service · Συναινέσεις (current matrix + full ledger + **printable proof** `/admin/customers/[id]/consent-proof`) · Συνδέσεις (login log) · Πόντοι · Σημειώσεις · SoftOne · GDPR. Every write is a `CustomerEvent` + `AuditLog`.

## SoftOne (`lib/softone/customers.ts`)
| Shop | SoftOne CUSTOMER (TRDR) |
|---|---|
| `erpCode` / `<prefix><number>` | `CODE` (required) |
| company or `LASTNAME FIRSTNAME` | `NAME` (required) |
| `vatNumber` / `doy` | `AFM` / `IRSDATA` (ERP wins once linked) |
| default address street+number / zip / city / region | `ADDRESS` / `ZIP` / `CITY` / `DISTRICT` |
| `phone` / `mobile` / `email` / `profession` | `PHONE01` / `PHONE02` / `EMAIL` / `JOBTYPETRD` |
| status active | `ISACTIVE`, `ISPROSP=0` |
| settings | `COUNTRY` (1000), `SOCURRENCY` (100), `VATSTS` (1), `TRDCATEGORY`, `PAYMENT` |
| extra addresses | `CUSBRANCH` lines (LINENUM kept; new ≥ 9000001) |
Push = getData (echo) → setData → getData read-back → status/log. Pull = getData → identity/contact. Link = browser `CUSTOMER` filtered by `AFM` / `EMAIL` / `NAME*` → getBrowserData → choose TRDR. Settings → SoftOne: prefix, defaults, «Αυτόματη αποστολή νέων πελατών».

## GDPR (`/admin/gdpr`, customer tab «GDPR»)
- Access/portability: JSON export (no notes, no password hash), audited.
- Rectification: profile edit; restriction: status «blocked».
- **Erasure (right to be forgotten)**: pseudonymises identity (email → `anon-…@anonymised.invalid`, names, phones, ΑΦΜ, birthday, password, cards, social, addresses, serials), keeps orders (tax law), the consent ledger and login log with `ipHash` as proof (art. 17(3)), writes a final «withdrawn» consent row, audit + event.
- Requests: number `GDPR-00001`, 30-day deadline with overdue highlighting, identity method, timeline, outcome; evidence (staff, ip, ua) captured at creation.
- Consent texts in force listed with hash; change = new version (`prisma/seed-gdpr.ts`).

Seeds: `prisma/seed-customers.ts` (3 demo customers, tag `demo`), `prisma/seed-gdpr.ts` (7 wordings v2026-09).

## Lost password (email OTP) & customer login
- `POST /api/account/password/forgot` {email} → always 200 (no enumeration); creates `PasswordReset` (6-digit code hashed with AUTH_SECRET, 10 min, one live code per customer) with request evidence (ip/ipHash/os/browser/device) and emails the code (`password-otp`, shows the requesting IP/device). Rate limits: 3 / 15 min per email, 10 / h per IP.
- `POST /api/account/password/verify` {email, code} → max 5 attempts, returns a single-use token (30 min).
- `POST /api/account/password/reset` {token, password} → bcrypt hash, invalidates open codes, `CustomerEvent password-reset`, notification email `password-changed`.
- UI `/ksexasa-kodiko` (3 steps, OTP boxes with paste/autofill, resend after 60 s, password rules) · `/syndesi` (email + password, social buttons) · staff button «Αποστολή κωδικού επαναφοράς (OTP)» in the customer profile (staff never sees codes).
- Session: `lib/account/session.ts` — HS256 JWT cookie `eu_session` (30 days, httpOnly); `getCustomerSession()` for server components; every login attempt → `LoginEvent`.

## Favourites (wishlist)
- Models `WishlistList` (several named lists per customer; `key="default"` is the main one, unique per customer → atomic upsert; `visibility` private|link, `shareToken`) and `WishlistItem` (product, `priceAtAdd`, note, priority, `notifyPriceDrop`, `notifyBackInStock`, source web|merge|admin).
- Guests keep ids in localStorage (CartProvider). After login the provider merges the device list into the account (`POST /api/wishlist {add, source:"merge"}`) and mirrors every heart toggle; `GET /api/wishlist` returns ids + lists.
- `/lista`: guest grid with sign-in banner, or the `WishlistManager` for customers: lists (create/rename/delete), price-drop badge vs price when saved, stock, notes, priority stars, per-item alert switches, move between lists, share by link (`/lista/k/[token]`, read-only, noindex), add to cart.
- `priceDropSubscribers(productId, newPrice)` (`lib/wishlist/repo.ts`) feeds the notification job when the catalogue sync lowers a price (respecting the `price-drop` consent).
- Admin: customer tab «Αγαπημένα»; report `/admin/reports/wishlist` (top saved products, customers with lists, waiting for price drop).

## Address geocoding & location segmentation
- Every customer address (admin `saveAddress`, storefront `POST /api/account/addresses`) is geocoded server-side (`lib/customers/geocode-address.ts`, Nominatim GR with street → zip+city → city fallbacks) and stores `lat/lng`, `geoLabel`, `geoSource` (nominatim | manual | client), `geocodedAt`, `nearestStoreId`, `nearestKm`. Coordinates from the device (GPS in the address book, `client`) or set by staff (`manual`) are kept. The default address suggests `preferredStoreId` when the customer has none. Backfill: `npx tsx prisma/geocode-addresses.ts`.
- Storefront address book `/logariasmos/dieythynseis` (signed-in): add / edit / delete, «Χρήση της θέσης μου», shows the nearest store and distance per address.
- Admin customers list: segmentation by prefecture, by store catchment (nearest store), or by radius around a place (geocoded; bounding box in SQL then exact Haversine), «Χάρτης πελατών» (Leaflet, default address navy / others green), «Εξαγωγή segment (CSV)» (`customers.export`, audited). Customer tab «Διευθύνσεις» shows coordinates, source and nearest store with a re-geocode button.
