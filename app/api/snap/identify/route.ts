import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { captureEvidence } from "@/lib/gdpr/evidence";
import { identifyFromPhoto, recordSnapAction } from "@/lib/snap/identify";

export const maxDuration = 60;

/** POST { image: dataURL, hint?: string } → identification + replacements. The photo is processed in memory only. 10 scans / hour / IP. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { image?: string; hint?: string; scanId?: string; action?: string };
  if (b.scanId && b.action) { await recordSnapAction(b.scanId, b.action); return NextResponse.json({ ok: true }); }
  if (!b.image) return NextResponse.json({ error: "image required" }, { status: 400 });
  const ev = await captureEvidence();
  if (ev.ipHash) { const n = await db.snapScan.count({ where: { ipHash: ev.ipHash, at: { gte: new Date(Date.now() - 3600000) } } }); if (n >= 10) return NextResponse.json({ error: "Πολλές αναγνωρίσεις σε μία ώρα. Δοκίμασε αργότερα ή γράψε το μοντέλο.", aiAvailable: false }, { status: 429 }); }
  const r = await identifyFromPhoto(b.image, b.hint);
  return NextResponse.json(r, { status: "error" in r ? 503 : 200 });
}
