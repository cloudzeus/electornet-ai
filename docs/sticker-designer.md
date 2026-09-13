# Sticker designer (`/admin/stickers`)

SVG stickers for product cards, designed in the admin and rendered by the **same** component on the storefront.

## Pieces
- `lib/stickers/model.ts` — `StickerParams` (the JSON the CMS stores), brand palette, 8 templates (1+1, −20%, Δώρο μαζί, Νέο, Διαγωνισμός, Cashback, Επιλογή καταστήματος, Flash).
- `components/stickers/StickerSvg.tsx` — pure renderer: shapes (burst, circle, seal, hex, badge, pill, ribbon, tag), up to 3 auto-fitted text lines (Manrope 700/800/900, uppercase, letter-spacing), icon (gift, %, star, zap, trophy, tag, heart, truck), fill/gradient, border, drop shadow, rotation. Position (`stickerPositionClass`) and animation (`stickerAnimationClass`: shimmer, breathe, wiggle, bump; reduced-motion safe).
- `components/admin/stickers/StickerDesigner.tsx` — live preview (isolated + on a real product card with hover), all controls, save, download SVG / PNG @4x, export to the media library (folder «Stickers», tag `sticker`), copy params JSON.
- `Sticker` table: key (unique), name, params, svg snapshot, active.

## Storefront use
`Product.promo = { kind: "sticker", params }` → `stickersFor()` yields `{ kind: "custom" }` → `ProductCard` renders `<CustomSticker>` at `params.position` with `params.animation`. Campaign / promo rules in the CMS will reference a sticker by `key` and embed its params at publish time (no join on the storefront).

## Rules baked in
- Red only for discounts (palette note in the designer).
- Text never overflows: auto-fit uses the shape's inner box; manual size is capped by the operator.
- Everything exported is vector; PNG is a 4× raster for marketplaces / newsletters.

## Permissions
`catalog.promos.write` (design/save), `cms.media.write` (export to library). Audit: `sticker.*`.
