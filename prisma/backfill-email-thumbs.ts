/** Generate the email JPEG thumbnail for media assets uploaded before the feature. Run: npx tsx prisma/backfill-email-thumbs.ts */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { emailThumbOf } from "../lib/media/process";
import { storeBytes, mediaPath } from "../lib/media/storage";
const db = new PrismaClient();
async function main() {
  const rows = await db.mediaAsset.findMany({ where: { emailUrl: null, kind: "image" } });
  let n = 0;
  for (const a of rows) {
    try {
      const bytes = a.url.startsWith("/") ? await readFile(path.join(process.cwd(), "public", a.url)) : Buffer.from(await (await fetch(a.url)).arrayBuffer());
      const e = await storeBytes(mediaPath(a.id, a.filename, "email.jpg"), await emailThumbOf(bytes), "image/jpeg");
      await db.mediaAsset.update({ where: { id: a.id }, data: { emailUrl: e.url } });
      n++;
    } catch (err) { console.log("skip", a.filename, (err as Error).message); }
  }
  console.log(`email thumbnails: ${n}/${rows.length}`);
}
main().finally(() => db.$disconnect());
