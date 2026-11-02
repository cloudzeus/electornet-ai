import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicOrigin } from "@/lib/account/oauth-flow";
import { verifyEmailChange } from "@/lib/account/profile-core";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";

/**
 * GET ?t=<token> — ο σύνδεσμος από το email «email-change-confirm». Αλλάζει το email μόνο αν ο πελάτης έχει ακόμη
 * το παλιό email του token (άρα ο σύνδεσμος πιάνει μία φορά και οι παλιοί σύνδεσμοι πεθαίνουν μετά από κάθε αλλαγή)
 * και αν το νέο είναι ακόμη ελεύθερο. Ειδοποίηση ασφαλείας «email-changed» στο ΠΑΛΙΟ email.
 * Επιστροφή στο /logariasmos/stoixeia?email=ok | expired | taken.
 */
export async function GET(req: Request) {
  const origin = await publicOrigin(req);
  const back = (s: "ok" | "expired" | "taken") => NextResponse.redirect(new URL(`/logariasmos/stoixeia?email=${s}`, origin), 303);
  const claim = await verifyEmailChange(new URL(req.url).searchParams.get("t") ?? "", secret());
  if (!claim) return back("expired");
  const c = await db.customer.findUnique({ where: { id: claim.sub }, select: { id: true, email: true, firstName: true, status: true } });
  if (!c || c.status !== "active") return back("expired");
  if (c.email === claim.new) return back("ok"); // ξαναπατήθηκε μετά την αλλαγή
  if (c.email !== claim.old) return back("expired");
  const other = await db.customer.findUnique({ where: { email: claim.new }, select: { id: true } });
  if (other) return back("taken");
  // updateMany με το παλιό email στο where: αν δύο κλικ τρέξουν ταυτόχρονα, μόνο το ένα αλλάζει τη γραμμή
  const r = await db.customer.updateMany({ where: { id: c.id, email: claim.old }, data: { email: claim.new, emailVerifiedAt: new Date() } }).catch((e: { code?: string }) => (e?.code === "P2002" ? "taken" as const : Promise.reject(e)));
  if (r === "taken") return back("taken");
  if (r.count === 0) return back("expired");

  // Newsletter: η γραμμή του συνδρομητή που ανήκει στον πελάτη και έχει το ΠΑΛΙΟ email ακολουθεί το νέο (ο πελάτης μόλις
  // απέδειξε ότι το ελέγχει). Αν υπάρχει ήδη άλλη γραμμή με το νέο email, δεν αγγίζουμε τίποτα (το email είναι unique και
  // η κάθε γραμμή έχει δικό της ιστορικό συναίνεσης). syncedAt = null ώστε ο πάροχος (Mailchimp/Klaviyo) να ξανασυγχρονίσει.
  let newsletter: "moved" | "kept" | "none" = "none";
  const sub = await db.newsletterSubscriber.findFirst({ where: { customerId: c.id, email: claim.old }, select: { id: true } });
  if (sub) {
    const clash = await db.newsletterSubscriber.findUnique({ where: { email: claim.new }, select: { id: true } });
    if (!clash) newsletter = await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { email: claim.new, syncedAt: null } }).then(() => "moved" as const).catch(() => "kept" as const);
    else newsletter = "kept";
  }

  await db.customerEvent.create({ data: { customerId: c.id, kind: "profile", meta: { by: "customer", action: "email-changed", before: { email: claim.old }, after: { email: claim.new }, newsletter } } }).catch(() => null);
  const when = new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" });
  const m = await renderTemplate("email-changed", { firstName: c.firstName, oldEmail: claim.old, newEmail: claim.new, when });
  await sendMail({ to: claim.old, template: "email-changed", meta: { customerId: c.id }, ...m }).catch(() => null);
  return back("ok");
}
