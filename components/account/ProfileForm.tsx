"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Check, Download, Loader2, Mail, Trash2, User } from "lucide-react";
import type { Customer } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const cp = copyOf("profile");

/** Επιστροφή από τον σύνδεσμο επιβεβαίωσης νέου email (`?email=`). */
export type EmailStatus = "ok" | "expired" | "taken";
const EMAIL_STATUS_TEXT: Record<EmailStatus, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Το email σου άλλαξε. Από τώρα συνδέεσαι με το νέο email." },
  expired: { ok: false, text: "Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζήτησε νέο σύνδεσμο από εδώ." },
  taken: { ok: false, text: "Το νέο email χρησιμοποιείται ήδη σε άλλο λογαριασμό, γι' αυτό δεν έγινε η αλλαγή." },
};

/** Απάντηση του GET /api/aade/vat (reconcile() του lib/aade/map — μόνο ό,τι χρειάζεται εδώ). */
type AadeReply = { ok: true; company: { name: string; isActive: boolean }; suggestion: { company: string | null; doyName: string | null; profession: string | null } } | { ok: false; code?: string; message?: string };

/**
 * Τα στοιχεία του πελάτη: PATCH /api/account/profile (όνομα, κινητό, γενέθλια, και στοιχεία τιμολόγησης: ιδιώτης /
 * επιχείρηση με ΑΦΜ, επωνυμία, Δ.Ο.Υ., επάγγελμα — «Συμπλήρωση από ΑΑΔΕ» μέσω GET /api/aade/vat), αλλαγή email με
 * σύνδεσμο επιβεβαίωσης στο νέο email (POST /api/account/email), αλλαγή κωδικού (POST /api/account/password/change),
 * αιτήματα GDPR (POST /api/account/gdpr) που χειρίζεται ο DPO από τη διαχείριση.
 */
export function ProfileForm({ customer: c, hasPassword, emailStatus }: { customer: Customer; hasPassword: boolean; emailStatus?: EmailStatus | null }) {
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, birthday: c.birthday ?? "", vat: c.vat ?? "", type: c.type ?? "individual", company: c.company ?? "", doy: c.doy ?? "", profession: c.profession ?? "" });
  const [saved, setSaved] = useState<{ ok: boolean; text: string; at: string } | null>(null);
  const [pw, setPw] = useState({ cur: "", next: "", again: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [aade, setAade] = useState<{ off: boolean; ok?: boolean; text?: string }>({ off: false });
  const [em, setEm] = useState<{ open: boolean; next: string; password: string; sent: string | null; error: string | null }>({ open: false, next: "", password: "", sent: null, error: null });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const biz = f.type === "business";
  const vatOk = /^\d{9}$/.test(f.vat.trim());
  // το ?email= έχει ήδη διαβαστεί από τη σελίδα· βγαίνει από τη διεύθυνση ώστε να μη ξαναφανεί σε ανανέωση
  useEffect(() => {
    if (emailStatus && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
  }, [emailStatus]);
  const flash = (text: string, ok = true, at = "") => {
    setSaved({ ok, text, at });
    setTimeout(() => setSaved(null), 4000);
  };
  const call = async (key: string, url: string, method: string, body: unknown, okText: string | ((j: Record<string, unknown>) => string)) => {
    setBusy(key);
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Record<string, unknown> & { ok: boolean; error?: string };
      flash(j.ok ? (typeof okText === "string" ? okText : okText(j)) : j.error ?? "Δεν αποθηκεύτηκε.", j.ok, key);
      return j.ok;
    } catch { flash("Σφάλμα δικτύου. Δοκίμασε ξανά.", false, key); return false; } finally { setBusy(null); }
  };
  const saveProfile = (key: string) => void call(key, "/api/account/profile", "PATCH", { firstName: f.firstName, lastName: f.lastName, phone: f.phone, birthday: f.birthday, vat: f.vat, type: f.type, company: f.company, doy: f.doy, profession: f.profession }, "Τα στοιχεία σου αποθηκεύτηκαν.");
  const fillFromAade = async () => {
    if (!vatOk) return setAade({ off: false, ok: false, text: "Γράψε πρώτα τον ΑΦΜ (9 ψηφία)." });
    setBusy("aade"); setAade({ off: false });
    try {
      const r = await fetch(`/api/aade/vat?afm=${encodeURIComponent(f.vat.trim())}`);
      const j = (await r.json()) as AadeReply;
      if (j.ok) {
        const s = j.suggestion;
        setF((x) => ({ ...x, company: s.company ?? x.company, doy: s.doyName ?? x.doy, profession: s.profession ?? x.profession }));
        setAade({ off: false, ok: j.company.isActive, text: j.company.isActive ? "Τα στοιχεία συμπληρώθηκαν από την ΑΑΔΕ. Έλεγξέ τα και πάτα «Αποθήκευση»." : "Συμπληρώθηκαν, αλλά ο ΑΦΜ εμφανίζεται ανενεργός στην ΑΑΔΕ. Έλεγξέ τον πριν αποθηκεύσεις." });
      } else if (r.status === 503 || j.code === "NOT_CONFIGURED") setAade({ off: true });
      else if (r.status === 404) setAade({ off: false, ok: false, text: "Ο ΑΦΜ δεν βρέθηκε στο μητρώο της ΑΑΔΕ. Έλεγξε τα ψηφία ή συμπλήρωσε τα στοιχεία με το χέρι." });
      else if (r.status === 429) setAade({ off: false, ok: false, text: j.message ?? "Πολλές αναζητήσεις. Δοκίμασε αργότερα." });
      else setAade({ off: false, ok: false, text: j.message ?? "Η ΑΑΔΕ δεν απάντησε. Δοκίμασε ξανά ή συμπλήρωσε με το χέρι." });
    } catch { setAade({ off: false, ok: false, text: "Σφάλμα δικτύου. Δοκίμασε ξανά." }); } finally { setBusy(null); }
  };
  const requestEmail = async () => {
    setBusy("email"); setEm((s) => ({ ...s, error: null }));
    try {
      const r = await fetch("/api/account/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newEmail: em.next, password: hasPassword ? em.password : undefined }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) setEm({ open: false, next: "", password: "", sent: em.next.trim().toLowerCase(), error: null });
      else setEm((s) => ({ ...s, error: j.error ?? "Δεν στάλθηκε ο σύνδεσμος." }));
    } catch { setEm((s) => ({ ...s, error: "Σφάλμα δικτύου. Δοκίμασε ξανά." })); } finally { setBusy(null); }
  };
  const input = "rounded-xl border-2 border-eu-line bg-white px-4 min-h-12 text-[length:var(--fs-16)] w-full outline-none focus-visible:border-eu-blue";
  const label = "grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink";
  const help = "font-normal text-eu-muted";
  const status = (at: string) =>
    saved && saved.at === at && (
      <span role="status" className={`inline-flex items-center gap-1.5 font-bold text-[length:var(--fs-15)] ${saved.ok ? "text-eu-green" : "text-eu-red"}`}>
        {saved.ok && <Check className="size-4" aria-hidden />} {saved.text}
      </span>
    );
  const segment = (on: boolean) => `flex-1 inline-flex items-center justify-center gap-2 rounded-full min-h-11 px-4 font-extrabold text-[length:var(--fs-15)] cursor-pointer focus-within:outline-2 focus-within:outline-eu-blue ${on ? "bg-eu-navy text-white" : "text-eu-navy hover:bg-eu-surface"}`;
  const banner = emailStatus ? EMAIL_STATUS_TEXT[emailStatus] : null;
  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveProfile("profile");
        }}
        className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4"
      >
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{cp.prosopika_stoicheia}</h2>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
          <label className={label}>
            {cp.onoma} <input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} className={input} autoComplete="given-name" required />
          </label>
          <label className={label}>
            {cp.eponymo} <input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} className={input} autoComplete="family-name" required />
          </label>
          <label className={label}>
            {cp.kinito} <span className={help}>(10 ψηφία — για ενημερώσεις παράδοσης)</span>
            <input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} autoComplete="tel" />
          </label>
          <label className={label}>
            {cp.imerominia_gennisis} <span className={help}>(για δώρο γενεθλίων)</span>
            <input type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} className={input} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy === "profile"} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-60">
            {busy === "profile" ? "Αποθήκευση…" : cp.apothikeysi}
          </button>
          {status("profile")}
        </div>
      </form>

      <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4" aria-labelledby="email-h">
        <h2 id="email-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Email σύνδεσης</h2>
        {banner && (
          <p role="status" className={`m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-15)] ${banner.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>
            {banner.ok ? <Check className="size-4 shrink-0 mt-1" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 mt-1" aria-hidden />} {banner.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Mail className="size-5 shrink-0 text-eu-muted" aria-hidden />
          <span className="min-w-0 break-all font-bold text-eu-ink text-[length:var(--fs-16)]">{c.email || "—"}</span>
          {!em.open && (
            <button type="button" onClick={() => setEm((s) => ({ ...s, open: true, sent: null, error: null }))} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-surface">
              Αλλαγή
            </button>
          )}
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Με αυτό συνδέεσαι και σε αυτό λαμβάνεις παραγγελίες και εγγυήσεις. Για να αλλάξει, στέλνουμε σύνδεσμο επιβεβαίωσης στο νέο email.</p>
        {em.sent && (
          <p role="status" className="m-0 inline-flex items-start gap-2 rounded-xl bg-eu-green/10 text-eu-green px-3 py-2 font-bold text-[length:var(--fs-15)] break-words min-w-0">
            <Check className="size-4 shrink-0 mt-1" aria-hidden /> <span className="min-w-0 break-all">Στείλαμε σύνδεσμο στο {em.sent}. Πάτησέ τον μέσα σε 24 ώρες· μέχρι τότε ισχύει το τρέχον email.</span>
          </p>
        )}
        {em.open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void requestEmail();
            }}
            className="grid gap-4 rounded-xl border-2 border-eu-blue p-4"
          >
            <div className={`grid grid-cols-1 gap-4 ${hasPassword ? "@md:grid-cols-2" : ""}`}>
              <label className={label}>
                Νέο email <span className={help}>(θα λάβεις εκεί τον σύνδεσμο επιβεβαίωσης)</span>
                <input type="email" required value={em.next} onChange={(e) => setEm((s) => ({ ...s, next: e.target.value }))} className={input} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
              </label>
              {hasPassword && (
                <label className={label}>
                  {cp.trechon_kodikos} <span className={help}>(για επιβεβαίωση ότι είσαι εσύ)</span>
                  <input type="password" required value={em.password} onChange={(e) => setEm((s) => ({ ...s, password: e.target.value }))} className={input} autoComplete="current-password" />
                </label>
              )}
            </div>
            {em.error && <p role="alert" className="m-0 font-bold text-eu-red text-[length:var(--fs-15)]">{em.error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy === "email"} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-60">
                {busy === "email" && <Loader2 className="size-4 animate-spin" aria-hidden />} Αποστολή συνδέσμου
              </button>
              <button type="button" onClick={() => setEm({ open: false, next: "", password: "", sent: null, error: null })} className="rounded-full border-2 border-eu-line px-5 min-h-12 font-bold text-[length:var(--fs-15)]">
                Άκυρο
              </button>
            </div>
          </form>
        )}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveProfile("billing");
        }}
        className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4"
      >
        <div className="grid gap-1">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τιμολόγηση / επαγγελματικά στοιχεία</h2>
          <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Συμπληρώνονται αυτόματα στο ταμείο όταν ζητάς τιμολόγιο.</p>
        </div>
        <fieldset className="m-0 p-0 border-0 grid gap-1.5">
          <legend className="p-0 mb-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]">Αγοράζω ως</legend>
          <div role="radiogroup" className="flex gap-1 rounded-full border-2 border-eu-line p-1 max-w-md">
            <label className={segment(!biz)}>
              <input type="radio" name="custType" value="individual" checked={!biz} onChange={() => set("type", "individual")} className="sr-only" />
              <User className="size-4" aria-hidden /> Ιδιώτης
            </label>
            <label className={segment(biz)}>
              <input type="radio" name="custType" value="business" checked={biz} onChange={() => set("type", "business")} className="sr-only" />
              <Building2 className="size-4" aria-hidden /> Επιχείρηση
            </label>
          </div>
          <span className="text-eu-muted text-[length:var(--fs-14)]">{biz ? "Για τιμολόγιο: ΑΦΜ και επωνυμία είναι υποχρεωτικά." : "Απόδειξη λιανικής. Ο ΑΦΜ είναι προαιρετικός."}</span>
        </fieldset>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label className={label}>
              {cp.afm} <span className={help}>{biz ? "(9 ψηφία, υποχρεωτικό)" : "(9 ψηφία, προαιρετικό)"}</span>
              <input inputMode="numeric" pattern="\d{9}" maxLength={9} required={biz} value={f.vat} onChange={(e) => set("vat", e.target.value.replace(/\D/g, ""))} className={input} />
            </label>
            {biz && !aade.off && (
              <button type="button" onClick={() => void fillFromAade()} disabled={busy === "aade" || !vatOk} className="justify-self-start inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-surface disabled:opacity-50">
                {busy === "aade" && <Loader2 className="size-4 animate-spin" aria-hidden />} Συμπλήρωση από ΑΑΔΕ
              </button>
            )}
          </div>
          {biz && (
            <label className={label}>
              Επωνυμία <span className={help}>(όπως θα γραφτεί στο τιμολόγιο)</span>
              <input required value={f.company} onChange={(e) => set("company", e.target.value)} className={input} autoComplete="organization" />
            </label>
          )}
          {biz && (
            <label className={label}>
              Δ.Ο.Υ. <span className={help}>(π.χ. Α΄ Αθηνών)</span>
              <input value={f.doy} onChange={(e) => set("doy", e.target.value)} className={input} />
            </label>
          )}
          {biz && (
            <label className={label}>
              Επάγγελμα <span className={help}>(κύρια δραστηριότητα)</span>
              <input value={f.profession} onChange={(e) => set("profession", e.target.value)} className={input} />
            </label>
          )}
        </div>
        {biz && aade.off && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Η αυτόματη συμπλήρωση από την ΑΑΔΕ δεν είναι διαθέσιμη αυτή τη στιγμή — συμπλήρωσε τα στοιχεία με το χέρι.</p>}
        {biz && aade.text && (
          <p role="status" className={`m-0 font-bold text-[length:var(--fs-15)] ${aade.ok ? "text-eu-green" : "text-eu-red"}`}>
            {aade.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy === "billing"} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-60">
            {busy === "billing" ? "Αποθήκευση…" : cp.apothikeysi}
          </button>
          {status("billing")}
        </div>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw.next.length < 8 || pw.next !== pw.again) return flash("Ο νέος κωδικός πρέπει να έχει 8+ χαρακτήρες και να ταιριάζει.", false, "pw");
          void call("pw", "/api/account/password/change", "POST", { current: pw.cur, next: pw.next }, (j) => (j.first ? "Ορίστηκε κωδικός — μπορείς να συνδέεσαι και με email." : "Ο κωδικός άλλαξε.")).then((ok) => { if (ok) setPw({ cur: "", next: "", again: "" }); });
        }}
        className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4"
      >
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{cp.asfaleia}</h2>
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-4">
          <label className={label}>
            {cp.trechon_kodikos} <input type="password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} className={input} autoComplete="current-password" />
          </label>
          <label className={label}>
            {cp.neos_kodikos} <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} autoComplete="new-password" />
          </label>
          <label className={label}>
            {cp.epanalipsi} <input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} className={input} autoComplete="new-password" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy === "pw"} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-surface disabled:opacity-60">
            {cp.allagi_kodikoy}
          </button>
          {status("pw")}
        </div>
      </form>

      <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-3">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τα δεδομένα μου (GDPR)</h2>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Μέλος από {new Date(c.memberSince).toLocaleDateString("el-GR", { month: "long", year: "numeric" })}. Μπορείς να κατεβάσεις ό,τι έχουμε για σένα ή να ζητήσεις διαγραφή· η αίτηση απαντάται εντός 30 ημερών (άρθρα 15 & 17).</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy === "gdpr"} onClick={() => void call("gdpr", "/api/account/gdpr", "POST", { type: "access" }, (j) => `Το αίτημα ${String(j.number)} καταχωρήθηκε — θα λάβεις τα δεδομένα σου με email εντός 30 ημερών.`)} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-surface">
            <Download className="size-4" aria-hidden /> {cp.lipsi_dedomenon}
          </button>
          <button type="button" disabled={busy === "gdpr"} onClick={() => { if (confirm("Να καταχωρηθεί αίτημα διαγραφής του λογαριασμού σου; Θα επικοινωνήσουμε για επιβεβαίωση πριν διαγραφεί οτιδήποτε.")) void call("gdpr", "/api/account/gdpr", "POST", { type: "erasure" }, (j) => `Το αίτημα διαγραφής ${String(j.number)} καταχωρήθηκε. Θα επικοινωνήσουμε για επιβεβαίωση.`); }} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line text-eu-muted font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:border-eu-red hover:text-eu-red">
            <Trash2 className="size-4" aria-hidden /> {cp.diagrafi_logariasmoy}
          </button>
        </div>
        {status("gdpr")}
      </section>
    </div>
  );
}
