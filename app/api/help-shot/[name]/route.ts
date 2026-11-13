import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/lib/auth";

/**
 * Εικόνες και video του wiki: μόνο για συνδεδεμένο προσωπικό (δείχνουν τη διαχείριση — όχι δημόσια).
 * Screenshots: `<σελίδα>-d.jpg` / `-m.jpg`. Video-ξεναγήσεις: `v.<όνομα>.mp4` και το εξώφυλλό τους `v.<όνομα>.jpg` (φάκελος help-shots/video).
 */
export async function GET(req: Request, { params }: RouteContext<"/api/help-shot/[name]">) {
  if (!(await auth())?.user) return new Response("unauthorized", { status: 401 });
  const { name } = await params;
  const video = name.match(/^v\.([a-z0-9-]+)\.(mp4|jpg)$/);
  if (!video && !/^[a-z0-9.-]+-(d|m)\.jpg$/.test(name)) return new Response("not found", { status: 404 });
  try {
    const buf = await readFile(video ? join(process.cwd(), "help-shots", "video", `${video[1]}.${video[2]}`) : join(process.cwd(), "help-shots", name));
    const type = video?.[2] === "mp4" ? "video/mp4" : "image/jpeg";
    const base = { "content-type": type, "cache-control": "private, max-age=3600", "accept-ranges": "bytes" };
    // το Safari παίζει video μόνο με αιτήματα τμημάτων (Range)
    const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
      if (start > end || start >= buf.length) return new Response(null, { status: 416, headers: { "content-range": `bytes */${buf.length}` } });
      return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${buf.length}`, "content-length": String(end - start + 1) } });
    }
    return new Response(new Uint8Array(buf), { headers: { ...base, "content-length": String(buf.length) } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
