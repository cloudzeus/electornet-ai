# Media library (`components/admin/media`)

One component, two roles: the page **/admin/media** and the **picker** behind every «choose image / video / file» field of the CMS.

## Storage
- **Bunny CDN** (Settings → Bunny CDN, enabled + storage zone + password + pull zone URL): every upload goes to Bunny Storage and is served from the pull zone. Deletes purge the CDN.
- Otherwise **local** `public/uploads/yyyy/mm/` (dev only, gitignored). The toolbar shows a yellow notice while local.
- Path scheme `yyyy/mm/<id>-<slug>.<ext>`; thumbs `…thumb.webp`, video posters `…poster.webp`.

## Processing on upload (`lib/media/process.ts`)
- Images → **WebP** (quality 85), EXIF-rotated. With «Πλαίσιο 1920 / 30px» (default on): longest side 1920 **including** a 30px margin on every side (white, or transparent when the source has alpha). Off: cap 4000px, no frame.
- 480px WebP thumbnail + 16px blur placeholder for every image/video.
- Videos: ffprobe (size, duration) + ffmpeg poster at 1s; poster re-selectable from the drawer.
- Files (PDF, docs): stored as-is.
- Editor exports and cutouts keep their format (`keepFormat`), PNG for transparency.

## Editing
- **ImageEditor** (canvas, no library): crop with drag/handles/aspect presets (1:1, 4:3, 3:2, 16:9, 3:4, 21:9), rotate 90°, flip, brightness/contrast/saturation (pixel-based, Safari-safe), max width, WebP/PNG/JPEG + quality. «Αποθήκευση ως νέο» or «Αντικατάσταση αρχικού» (same id → every reference updates).
- **Focal point**: click on the preview; cards, `MediaField` and the storefront use it as `object-position`.
- **Αφαίρεση φόντου**: Settings → AI: `rembg` CLI (birefnet-general, same model as the catalogue cutouts; install `rembg[cpu,cli]` on the server, set the command path) or remove.bg API. Produces a new PNG asset tagged `cutout`.
- Replace file, copy URL, download, tags, caption, alt, folder.

## Organisation
Folders (tree, drag-and-drop of cards onto folders), search (name/title/alt/tag), type filter, sort, grid/list, multi-select with bulk move / tag / delete, pagination 60/page.

## Props contract
```ts
<MediaLibrary
  mode="manage" | "picker"
  accept={["image","video","file"]}   // picker: allowed kinds
  multiple={true}
  canWrite={can(perms, "cms.media.write")}
  initialFolderId={null}
  onSelect={(assets: MediaAssetDTO[]) => …}  // picker
  onClose={() => …}
/>
<MediaField label="Εικόνα hero" value={asset|null} accept={["image"]} canWrite onChange={(a) => …} />
```
`MediaAssetDTO` (`lib/media/types.ts`) is what CMS documents store (id, url, thumbUrl, blur, width, height, focalX/Y, alt) so the storefront renders without a join.

## Permissions
`cms.media.read` (view/pick) · `cms.media.write` (upload/edit/delete). Every write is audit-logged (`media.*`).

## API
`POST /api/admin/media/upload` multipart: `file`, `folderId?`, `replaceId?`, `frame?=1`, `keepFormat?=1`, `posterAt?` → `MediaAssetDTO`. Max 500 MB.
