import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { emailThumbOf } from "@/lib/media/process";
import { getBunny } from "@/lib/media/cdn";

/**
 * Email-safe image on demand: `/api/img/email?src=/img/cutouts/x.webp` →
 * 360px JPEG on white. Used by the email templates for catalogue images that
 * are WebP/AVIF/SVG and for older media assets without `emailUrl`. Only
 * local public files and the configured CDN host are accepted. Cached 30 days.
 */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (!src) return new NextResponse("src required", { status: 400 });
  let bytes: Buffer | null = null;
  try {
    if (src.startsWith("/") && !src.startsWith("//")) {
      const safe = path.normalize(src).replace(/^(\.\.[/\\])+/, "");
      bytes = await readFile(path.join(process.cwd(), "public", safe));
    } else {
      const b = await getBunny();
      const u = new URL(src);
      if (!b.cdnUrl || !src.startsWith(b.cdnUrl)) return new NextResponse("host not allowed", { status: 403 });
      const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return new NextResponse("upstream", { status: 502 });
      bytes = Buffer.from(await r.arrayBuffer());
    }
    const jpg = await emailThumbOf(bytes);
    return new NextResponse(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=2592000, immutable" } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
