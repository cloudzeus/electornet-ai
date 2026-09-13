
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSetting } from "@/lib/settings/store";

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml"];
export const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];
export const kindOf = (mime: string): "image" | "video" | "file" => (IMAGE_MIMES.includes(mime) ? "image" : VIDEO_MIMES.includes(mime) ? "video" : "file");

export interface ProcessedImage {
  main: Buffer;
  ext: string;
  mime: string;
  width: number;
  height: number;
  thumb: Buffer;
  /** email-safe thumbnail: JPEG, 360px longest side, transparency flattened on white */
  emailThumb: Buffer;
  blur: string;
}
export const emailThumbOf = (input: Buffer) => sharp(input).resize({ width: 360, height: 360, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

export interface ImageOpts {
  keepFormat?: boolean;
  quality?: number;
  /** Product frame: longest side ≤ `max` including a `margin` on every side (white, or transparent when the image has alpha). */
  frame?: { max: number; margin: number } | null;
}
export const PRODUCT_FRAME = { max: 1920, margin: 30 };

/**
 * Normalises an uploaded image: EXIF-rotate, convert JPEG/PNG to WebP (alpha
 * kept), optional product frame (1920 max side, 30px margin), leave SVG/GIF
 * untouched; 480px WebP thumb; 16px blur.
 */
export async function processImage(input: Buffer, mime: string, opts: ImageOpts = {}): Promise<ProcessedImage> {
  if (mime === "image/svg+xml" || mime === "image/gif") {
    const meta = await sharp(input, { animated: mime === "image/gif" }).metadata();
    const thumb = await sharp(input).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const emailThumb = await emailThumbOf(input);
    const blur = (await sharp(input).resize(16).webp({ quality: 40 }).toBuffer()).toString("base64");
    return { main: input, ext: mime === "image/gif" ? "gif" : "svg", mime, width: meta.width ?? 0, height: meta.height ?? 0, thumb, emailThumb, blur: `data:image/webp;base64,${blur}` };
  }
  let base = sharp(input).rotate();
  if (opts.frame) {
    const inner = opts.frame.max - opts.frame.margin * 2;
    const { hasAlpha } = await sharp(input).metadata();
    const m = opts.frame.margin;
    base = sharp(await base.resize({ width: inner, height: inner, fit: "inside", withoutEnlargement: false }).toBuffer()).extend({ top: m, bottom: m, left: m, right: m, background: hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 } });
  } else {
    base = base.resize({ width: 4000, height: 4000, fit: "inside", withoutEnlargement: true });
  }
  const q = opts.quality ?? 85;
  let main: Buffer;
  let ext: string;
  let outMime: string;
  if (opts.keepFormat && mime === "image/png") {
    main = await base.png({ compressionLevel: 9 }).toBuffer();
    ext = "png";
    outMime = "image/png";
  } else if (opts.keepFormat && mime === "image/jpeg") {
    main = await base.jpeg({ quality: q, mozjpeg: true }).toBuffer();
    ext = "jpg";
    outMime = "image/jpeg";
  } else {
    main = await base.webp({ quality: q, effort: 4 }).toBuffer();
    ext = "webp";
    outMime = "image/webp";
  }
  const meta = await sharp(main).metadata();
  const thumb = await sharp(main).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const emailThumb = await emailThumbOf(main);
  const blur = (await sharp(main).resize(16).webp({ quality: 40 }).toBuffer()).toString("base64");
  return { main, ext, mime: outMime, width: meta.width ?? 0, height: meta.height ?? 0, thumb, emailThumb, blur: `data:image/webp;base64,${blur}` };
}

function run(cmd: string, args: string[], input?: Buffer): Promise<{ code: number; out: Buffer; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => resolve({ code: -1, out: Buffer.alloc(0), err: e.message }));
    p.on("close", (code) => resolve({ code: code ?? -1, out: Buffer.concat(out), err }));
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

/** ffprobe → duration/size; ffmpeg → poster frame at `at` seconds. Both optional (null when the binaries are missing). */
export async function probeVideo(bytes: Buffer, at = 1): Promise<{ width: number | null; height: number | null; duration: number | null; poster: Buffer | null }> {
  const dir = await mkdtemp(path.join(tmpdir(), "eu-video-"));
  const src = path.join(dir, "in.mp4");
  await writeFile(src, bytes);
  try {
    const probe = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", src]);
    let width: number | null = null, height: number | null = null, duration: number | null = null;
    if (probe.code === 0) {
      const j = JSON.parse(probe.out.toString()) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
      width = j.streams?.[0]?.width ?? null;
      height = j.streams?.[0]?.height ?? null;
      duration = j.format?.duration ? Number(j.format.duration) : null;
    }
    const posterPath = path.join(dir, "poster.jpg");
    const t = duration ? Math.min(at, Math.max(0, duration - 0.1)) : at;
    const ff = await run("ffmpeg", ["-y", "-ss", String(t), "-i", src, "-frames:v", "1", "-q:v", "3", posterPath]);
    const poster = ff.code === 0 ? await readFile(posterPath) : null;
    return { width, height, duration, poster };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Background removal: local rembg CLI (birefnet-general, same as the catalogue cutouts) or remove.bg API. Returns PNG with alpha. */
export async function removeBackground(bytes: Buffer): Promise<Buffer> {
  const { data, secrets } = await getSetting("ai");
  const provider = String(data.bgRemoval ?? "rembg");
  if (provider === "off") throw new Error("Η αφαίρεση φόντου είναι ανενεργή (Ρυθμίσεις → AI & υπηρεσίες).");
  if (provider === "removebg") {
    const key = secrets.removeBgApiKey;
    if (!key) throw new Error("Λείπει το remove.bg API key.");
    const fd = new FormData();
    fd.append("image_file", new Blob([new Uint8Array(bytes)]), "image.png");
    fd.append("size", "auto");
    fd.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": key }, body: fd, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`remove.bg: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const cmd = String(data.rembgCommand || process.env.REMBG_CMD || "rembg");
  // file based (not stdin/stdout): robust across environments; onnxruntime may abort on teardown after writing — trust the PNG bytes.
  const dir = await mkdtemp(path.join(tmpdir(), "eu-rembg-"));
  const src = path.join(dir, "in.png"), dst = path.join(dir, "out.png");
  try {
    await writeFile(src, bytes);
    const r = await run(cmd, ["i", "-m", "birefnet-general", src, dst]);
    const out = await readFile(dst).catch(() => Buffer.alloc(0));
    const isPng = out.length > 8 && out.readUInt32BE(0) === 0x89504e47;
    if (!isPng) throw new Error(`rembg απέτυχε (${cmd}, exit ${r.code}): ${(r.err || r.out.toString("utf8")).trim().slice(-300) || "δεν βρέθηκε το πρόγραμμα"}`);
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
