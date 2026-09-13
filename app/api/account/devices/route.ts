import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { ingest } from "@/lib/media/repo";
import { recordSnapAction } from "@/lib/snap/identify";
import { recordConsent } from "@/lib/gdpr/consent";

/** POST: register an owned appliance (from Snap & Find or manually); optional photo is stored in the media library (folder «Snap») with a consent row. */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { brand?: string; title?: string; model?: string; serial?: string; purchasedAt?: string; energyClass?: string; photo?: string; scanId?: string; notes?: string };
  if (!b.brand?.trim() || !b.title?.trim()) return NextResponse.json({ ok: false, error: "Μάρκα και είδος είναι υποχρεωτικά." }, { status: 400 });
  let invoiceUrl: string | null = null;
  if (b.photo?.startsWith("data:image")) {
    let folder = await db.mediaFolder.findFirst({ where: { name: "Snap", parentId: null } });
    if (!folder) folder = await db.mediaFolder.create({ data: { name: "Snap" } });
    const bytes = Buffer.from(b.photo.replace(/^data:[^;]+;base64,/, ""), "base64");
    const asset = await ingest({ bytes, filename: `snap-${me.number}-${Date.now()}.jpg`, mime: "image/jpeg", folderId: folder.id, createdBy: me.id, title: `${[b.brand, b.title].filter((x) => x && x !== "Άγνωστη μάρκα").join(" ")} — πελάτης #${me.number}` });
    await db.mediaAsset.update({ where: { id: asset.id }, data: { tags: ["snap", "customer-device"] } });
    invoiceUrl = asset.url;
    await recordConsent({ customerId: me.id, email: me.email, topic: "profiling", channel: "web", granted: true, method: "checkbox", source: "snap", evidence: { step: "keep-photo", assetId: asset.id } });
  }
  const purchasedAt = b.purchasedAt ? new Date(b.purchasedAt) : null;
  const dev = await db.customerDevice.create({ data: { customerId: me.id, brand: b.brand.trim(), title: b.title.trim(), model: b.model?.trim() || null, serial: b.serial?.trim() || null, purchasedAt, warrantyMonths: 24, warrantyUntil: purchasedAt ? new Date(new Date(purchasedAt).setMonth(purchasedAt.getMonth() + 24)) : null, registeredBy: "manual", invoiceUrl, notes: [b.energyClass ? `Ενεργειακή κλάση ${b.energyClass}` : null, b.notes].filter(Boolean).join(" · ") || null } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "device", meta: { by: "customer", id: dev.id, title: dev.title, source: b.scanId ? "snap" : "manual" } } }).catch(() => null);
  if (b.scanId) await recordSnapAction(b.scanId, "register", invoiceUrl);
  return NextResponse.json({ ok: true, id: dev.id });
}
