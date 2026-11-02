import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { addCustomerInput, cancelByCustomer, requestReschedule } from "@/lib/service/tickets";
import { checkUploads, storeUploads } from "@/lib/service/uploads";

export const maxDuration = 120;

/**
 * PATCH { action: "cancel" } — ακύρωση πριν ξεκινήσει η εργασία.
 * PATCH { action: "reschedule", date?, slot?, note? } — αίτημα αλλαγής ώρας (το κατάστημα απαντά).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as { action?: string; date?: string; slot?: string; note?: string };
  const r = b.action === "cancel" ? await cancelByCustomer(me.id, id) : b.action === "reschedule" ? await requestReschedule(me.id, id, b) : { ok: false as const, status: 400, error: "Μη έγκυρη ενέργεια." };
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}

/** POST (multipart: note, files[]) — μήνυμα ή φωτογραφίες / βίντεο σε ανοιχτό αίτημα. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "Μη έγκυρο αίτημα." }, { status: 400 });
  const up = checkUploads(fd.getAll("files"));
  if (!up.ok) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
  const note = String(fd.get("note") ?? "");
  if (!note.trim() && !up.files.length) return NextResponse.json({ ok: false, error: "Γράψε μήνυμα ή πρόσθεσε φωτογραφία." }, { status: 400 });
  const attachments = await storeUploads(up.files, me, "Αίτημα service").catch(() => null);
  if (attachments === null) return NextResponse.json({ ok: false, error: "Τα αρχεία δεν ανέβηκαν. Δοκίμασε ξανά." }, { status: 502 });
  const r = await addCustomerInput(me.id, (await params).id, { note, attachments });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
