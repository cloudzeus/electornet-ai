# Stores (`/admin/stores`, `/katastimata`)

## Data
- **Source of truth: `Store` table.** One-time import from the euronics.gr store locator (`prisma/seed-stores.ts` → `lib/stores/import.ts`, snapshot in `prisma/data/stores.json`): 252 member stores with name, type, street, city, ZIP, prefecture, phone / mobile / fax / email and the site's coordinates (`geocoded = "site"`). Prefecture is derived from the postal code (most reliable), city names normalised with accents.
- **Coordinates**: `lat/lng` used by the storefront; `geocoded` = site | nominatim | manual. Every store also carries an independent OpenStreetMap geocode (`geoLat/geoLng/geoLabel`) and `geoDeltaKm` = distance from the published point, for QA. Batch: `npx tsx prisma/geocode-stores.ts` (Nominatim, 1 req/s); admin button «Γεωκωδικοποίηση» does 20 at a time; editor buttons «Έλεγχος» / «Χρήση σημείου OSM».
- Hours (`[{day 0-6, open, close}]`, default Mon–Fri 09–21, Sat 09–18), services (click-collect, installation, service-point, recycling, parking, delivery, showroom, b2b), photo (media library), ERP branch code, notes, active, sort.

## Admin
- List: search, prefecture chips, QA filters (απόκλιση >2 km, χωρίς συντεταγμένες, χειροκίνητα, ανενεργά), Leaflet map with every store (red = QA delta >2 km, yellow = inactive), table.
- Editor: details, contact, hours grid, services, photo (MediaField), map with draggable marker / click-to-place, OSM point drawn as a hollow circle with dashed link, Lat/Lng inputs, geocode buttons, Google Maps link. Manual moves set `geocoded = "manual"` so later imports never overwrite them.
- Permissions: `stores.read` (view), `stores.write` (edit, geocode, import). Audit: `store.*`.

## Storefront
`lib/stores/repo.ts`: `findStores`, `findStoreBySlug`, `storeRegions`, `nearestStores` (Haversine from visitor geo-IP or Syntagma), `openUntilToday` from hours; `lib/stores/open.ts` `openLabel` («Ανοιχτό έως 21:00» / «Κλειστό σήμερα»). Fixture fallback only while the table is empty.

## Visitor location (`lib/geo`)
Three precision levels, one point for the whole site:
1. **Cookie `eu_geo`** (client-side only, 30 days) — set when the visitor shares GPS («Χρήση της τοποθεσίας μου») or types a place («Κοντά σε: πόλη / Τ.Κ. / διεύθυνση», geocoded by `/api/geo/geocode` via Nominatim). `useVisitorGeo()` (`lib/geo/client.ts`) writes it and refreshes the route so every server-rendered distance follows.
2. **CDN headers** (Cloudflare `cf-iplatitude` / `cf-ipcity`).
3. **IP lookup** with the provider from Settings → AI (`geoProvider`: ipapi.co with optional key, MaxMind GeoIP2 «accountId:licenseKey», or Cloudflare headers only), 1.5 s timeout, 12 h cache. Fallback: Athens.

`geoFromRequest()` returns `{ lat, lng, city?, source: gps | manual | ip | fallback }`; `geoSourceLabel()` explains it to the visitor. Consumers: locator (distances, «κοντά σου», map visitor marker, `LocateBar`), home store tile, StoreFinder, product page nearest store. Nothing is stored server-side.
