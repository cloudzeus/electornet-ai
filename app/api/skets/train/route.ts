import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sketsReq } from "@/lib/skets/auth";

/**
 * Σελίδα εκπαίδευσης του σκετς (/ermis-live/train): σημάδια στις ατάκες των προβών και απαντήσεις του χρήστη στις ερωτήσεις του Ερμή.
 * Γράφονται στο AuditLog (χωρίς αλλαγή σχήματος): «skets.label» (entityId = id της ατάκας) και «skets.answer» (entityId = id ερώτησης).
 *   { t: "label", turn, ok: boolean | null, want?: string, note?: string }  · ok null = «δοκιμή, δεν μετράει»
 *   { t: "answer", q, text }
 */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { t?: string; turn?: string; ok?: boolean | null; want?: string; note?: string; q?: string; text?: string };
  const cut = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  if (b.t === "label" && cut(b.turn, 40)) {
    await db.auditLog.create({ data: { action: "skets.label", entity: "SketsTurn", entityId: cut(b.turn, 40), after: { ok: typeof b.ok === "boolean" ? b.ok : null, want: cut(b.want, 60), note: cut(b.note, 1000) } } });
    return NextResponse.json({ ok: true });
  }
  if (b.t === "answer" && cut(b.q, 80)) {
    await db.auditLog.create({ data: { action: "skets.answer", entity: "SketsQuestion", entityId: cut(b.q, 80), after: { text: cut(b.text, 4000) } } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}
