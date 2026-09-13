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
