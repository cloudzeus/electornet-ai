"use client";

/**
 * PDF → μία εικόνα ανά σελίδα, μέσα στον browser (pdf.js): ο server δεν χρειάζεται βιβλιοθήκες PDF και ο χρήστης
 * βλέπει αμέσως τις σελίδες. Κάθε σελίδα αποδίδεται σε πλάτος ~1800 px — αρκετό για καθαρό κείμενο στο OCR.
 */
export async function pdfToImages(file: File, opts: { maxPages?: number; width?: number; onPage?: (n: number, total: number) => void } = {}): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const total = Math.min(doc.numPages, opts.maxPages ?? 12), out: File[] = [];
  for (let n = 1; n <= total; n++) {
    opts.onPage?.(n, total);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, (opts.width ?? 1800) / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.93));
    if (blob) out.push(new File([blob], `${file.name.replace(/\.pdf$/i, "")} · σελίδα ${n}.jpg`, { type: "image/jpeg" }));
  }
  await doc.destroy();
  return out;
}
