import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/account/oauth-flow";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { checkNewEmail, EMAIL_CHANGE_HOURS, maskEmail, normEmail, rateLimiter, signEmailChange } from "@/lib/account/profile-core";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

/** 5 αιτήματα / ώρα / πελάτη (στη μνήμη της διεργασίας — αρκεί για να κόψει κατάχρηση αποστολών). */
const limit = rateLimiter(5, 3600000);
const secret = () => process.env.AUTH_SECRET ?? "dev-secret";

/**
 * POST { newEmail, password? } → στέλνει σύνδεσμο επιβεβαίωσης (24 ώρες) στο ΝΕΟ email· το email του λογαριασμού
 * αλλάζει μόνο όταν πατηθεί (GET /api/account/email/confirm). Λογαριασμός με κωδικό → χρειάζεται ο τρέχων κωδικός·
 * λογαριασμός μόνο με κοινωνική σύνδεση (χωρίς passwordHash) → όχι. Το token είναι stateless (JWT, aud «email-change»).
 */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { newEmail?: unknown; password?: unknown };
  const newEmail = normEmail(b.newEmail);
  const bad = checkNewEmail(newEmail, me.email);
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });
  if (limit.hit(me.id)) return NextResponse.json({ ok: false, error: "Πολλά αιτήματα αλλαγής email. Δοκίμασε ξανά σε μία ώρα." }, { status: 429 });
  const c = await db.customer.findUnique({ where: { id: me.id }, select: { id: true, email: true, firstName: true, passwordHash: true } });
  if (!c?.email) return NextResponse.json({ ok: false, error: "Ο λογαριασμός δεν έχει email. Επικοινώνησε μαζί μας." }, { status: 400 });
  if (c.passwordHash) {
    const password = typeof b.password === "string" ? b.password : "";
    if (!password) return NextResponse.json({ ok: false, error: "Γράψε τον τρέχοντα κωδικό σου." }, { status: 400 });
    if (!(await bcrypt.compare(password, c.passwordHash))) return NextResponse.json({ ok: false, error: "Ο τρέχων κωδικός δεν είναι σωστός." }, { status: 403 });
  }
  const taken = await db.customer.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken) return NextResponse.json({ ok: false, error: "Αυτό το email χρησιμοποιείται ήδη σε άλλο λογαριασμό." }, { status: 409 });
  const token = await signEmailChange({ sub: c.id, old: c.email, new: newEmail }, secret());
  // ο σύνδεσμος πρέπει να φτάσει σε ΑΥΤΗ την εφαρμογή (το baseUrl των email δείχνει ακόμη το παλιό euronics.gr)
  const confirmUrl = `${await publicOrigin(req)}/api/account/email/confirm?t=${encodeURIComponent(token)}`;
  const m = await renderTemplate("email-change-confirm", { firstName: c.firstName, newEmail, confirmUrl, hours: EMAIL_CHANGE_HOURS });
  await sendMail({ to: newEmail, template: "email-change-confirm", meta: { customerId: c.id }, ...m });
  await db.customerEvent.create({ data: { customerId: c.id, kind: "profile", meta: { by: "customer", action: "email-change-requested", new: newEmail } } }).catch(() => null);
  return NextResponse.json({ ok: true, sentTo: maskEmail(newEmail) });
}
