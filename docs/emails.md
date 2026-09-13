# Customer emails

**Design system** `lib/email/layout.ts`: 600px table layout, navy header with the white logo, white card, yellow primary / navy secondary rounded buttons, Manrope with system fallback, text ≥ 14px, notes (info/success/warning/danger), OTP block, order lines, totals, store card, product cards, «Ο Άρης λέει» block, footer with company / contact / legal links (+ unsubscribe for marketing mails). `renderEmail()` returns subject, HTML and a plain-text twin. Images use the absolute base URL from Settings → Γενικά (`baseUrl`), so the site must serve `/design/euronics-logo-white.png`, product images and `/img/advisor/mascot-head.webp` publicly.

**Images**: `emailImg(ctx, url)` — JPEG/PNG/GIF pass through; WebP/AVIF/SVG (catalogue cutouts, mascot) are served through `/api/img/email?src=…` as 360px JPEG on white (cached 30 days; local public files or the configured Bunny host only). Media-library assets carry a ready `emailUrl` from upload.

**Templates** `lib/email/templates.ts` (typed data + sample per template), grouped by job:
| Group | Keys |
|---|---|
| Λογαριασμός | account-welcome · password-otp · password-changed · login-new-device |
| Newsletter | newsletter-confirm · newsletter-welcome · newsletter-unsubscribed |
| Παραγγελίες | order-confirmation · order-shipped · order-ready-for-pickup · order-delivered · order-cancelled · order-return |
| Service | service-received · appointment-confirmed · appointment-reminder · service-done · warranty-expiring |
| Καλάθι | cart-abandoned · cart-emailed |
| Αγαπημένα | wishlist-price-drop · wishlist-back-in-stock |
| Loyalty | loyalty-points · loyalty-birthday |
| GDPR | gdpr-export-ready · gdpr-erased |
`marketing: true` templates are sent only with an active consent and carry the unsubscribe link.

**Sending**: `renderTemplate(key, data, ctx?)` → `sendMail({ to, template, ...m })` (`lib/email/send.ts`, SMTP / Resend / SendGrid from Settings → Email & SMS, every attempt in `EmailLog`). Wired: password OTP / changed, newsletter confirm / welcome / unsubscribed. Order, service, wishlist, loyalty and GDPR templates are ready for their triggers (order status changes, ticket updates, price sync, crons).

**Admin** `/admin/emails` (permission `marketing.emails.write`): gallery per job with live thumbnails, per-template page with desktop / mobile / plain-text / sample-data views, trigger description, «Δοκιμαστική αποστολή» to any address (logged as `test:<key>`), dispatch log. Previews render assets from the current origin; real sends use the configured base URL.
