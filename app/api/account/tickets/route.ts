import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { recordSnapAction } from "@/lib/snap/identify";
import { KIND_LABEL } from "@/lib/service/core";
import { createServiceTicket } from "@/lib/service/tickets";
import { checkUploads, storeUploads } from "@/lib/service/uploads";

export const maxDuration = 120;

const KINDS = ["repair", "warranty-claim", "installation", "appointment"];
const MODES = ["visit", "pickup", "store"];

/**
 * POST: αίτημα service από τον λογαριασμό (multipart: kind, mode, deviceId, slot, description, files[]) ή από το
 * Snap & Find (JSON με scanId). Στέλνει «Λάβαμε το αίτημα» και φαίνεται στα «Ραντεβού & service».
 */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const multipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  const fd = multipart ? await req.formData().catch(() => null) : null;
  const b = (fd ? Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) : await req.json().catch(() => ({}))) as { kind?: string; description?: string; deviceId?: string; mode?: string; slot?: string; scanId?: string };
  const description = b.description?.trim() ?? "";
  if (description.length < 5) return NextResponse.json({ ok: false, error: "Περιέγραψε λίγο τι χρειάζεσαι." }, { status: 400 });
  const up = checkUploads(fd ? fd.getAll("files") : []);
  if (!up.ok) return NextResponse.json({ ok: false, error: up.error }, { status: 400 });
  const kind = KINDS.includes(b.kind ?? "") ? b.kind! : "repair";
  const attachments = await storeUploads(up.files, me, `Αίτημα service ${KIND_LABEL[kind] ?? ""}`.trim()).catch(() => null);
  if (attachments === null) return NextResponse.json({ ok: false, error: "Τα αρχεία δεν ανέβηκαν. Δοκίμασε ξανά ή στείλε το αίτημα χωρίς αυτά." }, { status: 502 });
  const slot = b.slot?.trim().slice(0, 40);
  const t = await createServiceTicket({
    customerId: me.id, kind, mode: MODES.includes(b.mode ?? "") ? b.mode! : "visit", deviceId: b.deviceId || null,
    description: slot ? `${description}\nΠροτίμηση: ${slot}` : description, attachments,
    note: b.scanId ? "Αίτημα από Snap & Find" : "Αίτημα από τον λογαριασμό", by: { name: "customer" },
  });
  if (b.scanId) await recordSnapAction(b.scanId, "service");
  return NextResponse.json({ ok: true, id: t.id, number: t.number });
}
