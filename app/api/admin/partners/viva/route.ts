import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { VIVA_WHERE } from "@/lib/b2b/viva";
import { onboardingOf } from "@/lib/partner-portal/data";
import { answerLabel } from "@/lib/partner-portal/questions";
import { roleLabel } from "@/lib/partner-portal/contact-roles";

export const runtime = "nodejs";

const cell = (v: unknown) => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Λίστα ενδιαφέροντος Viva (CSV, «;» για το ελληνικό Excel) για τον account manager της Viva. Καταγράφεται κάθε λήψη. */
export async function GET() {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "stores.partners.read")) return new Response("forbidden", { status: 403 });
  const rows = await db.partner.findMany({
    where: { OR: VIVA_WHERE }, orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, afm: true, city: true, phone: true, email: true, onboarding: true, _count: { select: { stores: true } }, contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }], take: 1, select: { name: true, role: true, email: true, phone: true } } },
  });
  const head = ["Κωδικός", "Επωνυμία", "ΑΦΜ", "Πόλη", "Καταστήματα", "Απάντηση", "Χρήση Viva σήμερα", "Τράπεζες / πάροχοι", "Δήλωση από", "Επαφή", "Ρόλος", "Email επαφής", "Τηλέφωνο επαφής", "Τηλέφωνο μέλους", "Email μέλους"];
  const lines = rows.map((p) => {
    const ob = onboardingOf(p.onboarding), a = ob.answers ?? {}, c = p.contacts[0];
    return [p.code, p.name, p.afm, p.city, p._count.stores, answerLabel("vivaOffer", a.vivaOffer), answerLabel("vivaUse", a.vivaUse), answerLabel("banks", a.banks), ob.vivaAt ? new Date(ob.vivaAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" }) : "", c?.name, c ? roleLabel(c.role) : "", c?.email, c?.phone, p.phone, p.email].map(cell).join(";");
  });
  await audit(session.user.id, "partners.viva.export", "Partner", null, null, { count: rows.length });
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
  return new Response("﻿" + [head.join(";"), ...lines].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="viva-synergates-${day}.csv"`, "Cache-Control": "no-store" } });
}
