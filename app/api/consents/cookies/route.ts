import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { recordConsent } from "@/lib/gdpr/consent";
import { captureEvidence } from "@/lib/gdpr/evidence";
import { rateLimiter } from "@/lib/account/profile-core";

const limit = rateLimiter(20, 3600000);

/**
 * POST { analytics, marketing, choice?, shown? }: η επιλογή του banner cookies στο μητρώο συναινέσεων (δύο εγγραφές).
 * Ο επισκέπτης δεν έχει email: τον ταυτοποιούν το hash της IP και η συσκευή· αν είναι συνδεδεμένος, δένεται με τον λογαριασμό.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { analytics?: unknown; marketing?: unknown; choice?: unknown; shown?: unknown };
  if (typeof b.analytics !== "boolean" || typeof b.marketing !== "boolean") return NextResponse.json({ ok: false }, { status: 400 });
  const ev = await captureEvidence();
  if (limit.hit(ev.ip ?? "?")) return NextResponse.json({ ok: false }, { status: 429 });
  const me = await getCustomerSession().catch(() => null);
  const shown = typeof b.shown === "string" ? b.shown.trim().slice(0, 1000) : "";
  const choice = ["accept-all", "reject-all", "custom"].includes(b.choice as string) ? (b.choice as string) : "custom";
  for (const [topic, granted] of [["cookies-analytics", b.analytics], ["cookies-marketing", b.marketing]] as const) {
    await recordConsent({ customerId: me?.id ?? null, email: me?.email ?? null, topic, channel: "web", granted, method: "popup", source: "popup", text: shown || undefined, url: req.headers.get("referer"), evidence: { choice, shown: shown || null } });
  }
  return NextResponse.json({ ok: true });
}
