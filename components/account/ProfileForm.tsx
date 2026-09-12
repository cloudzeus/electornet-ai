"use client";

import { useState } from "react";
import { Check, Download, ShieldCheck, Trash2 } from "lucide-react";
import type { Customer } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const cp = copyOf("profile");

/**
 * @dynamic Profile form — reads/writes the SoftOne CUSTOMER record
 * through the account API (PATCH /api/account/profile). Demo: local
 * state with a saved confirmation. GDPR actions (export, delete) call
 * the DPO workflow in production.
 */
export function ProfileForm({ customer: c }: { customer: Customer }) {
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, birthday: c.birthday ?? "", vat: c.vat ?? "" });
  const [saved, setSaved] = useState<string | null>(null);
  const [pw, setPw] = useState({ cur: "", next: "", again: "" });
  const [twoFa, setTwoFa] = useState(!!c.twoFactor);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const input = "rounded-xl border-2 border-eu-line bg-white px-4 min-h-12 text-[length:var(--fs-16)] w-full outline-none focus-visible:border-eu-blue";
  const label = "grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink";
  const flash = (t: string) => {
    setSaved(t);
    setTimeout(() => setSaved(null), 2500);
  };
  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          flash("Τα στοιχεία σου αποθηκεύτηκαν.");
        }}
        className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4"
      >
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{cp.prosopika_stoicheia}</h2>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
          <label className={label}>
            {cp.onoma} <input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} className={input} autoComplete="given-name" />
          </label>
          <label className={label}>
            {cp.eponymo} <input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} className={input} autoComplete="family-name" />
          </label>
          <label className={label}>
            Email <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} autoComplete="email" />
          </label>
          <label className={label}>
            {cp.kinito} <input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} autoComplete="tel" />
          </label>
          <label className={label}>
            {cp.imerominia_gennisis} <span className="font-normal text-eu-muted">(για δώρο γενεθλίων)</span>
            <input type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} className={input} />
          </label>
          <label className={label}>
            {cp.afm} <span className="font-normal text-eu-muted">(για τιμολόγια)</span>
            <input inputMode="numeric" maxLength={9} value={f.vat} onChange={(e) => set("vat", e.target.value)} className={input} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue">
            {cp.apothikeysi}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-15)]">
              <Check className="size-4" aria-hidden /> {saved}
            </span>
          )}
        </div>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw.next.length < 8 || pw.next !== pw.again) return flash("Ο νέος κωδικός πρέπει να έχει 8+ χαρακτήρες και να ταιριάζει.");
          setPw({ cur: "", next: "", again: "" });
          flash("Ο κωδικός άλλαξε.");
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
        <label className="flex items-start gap-3 rounded-xl bg-eu-surface p-4 cursor-pointer">
          <input type="checkbox" checked={twoFa} onChange={(e) => setTwoFa(e.target.checked)} className="mt-1 size-[18px] accent-eu-blue" />
          <span className="text-[length:var(--fs-15)] text-eu-ink-2">
            <strong className="text-eu-ink inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-eu-green" aria-hidden /> {cp.epalitheysi_dyo_vimaton}
            </strong>
            <br />
            Κωδικός μίας χρήσης με SMS στο {f.phone} σε κάθε νέα συσκευή.
          </span>
        </label>
        <button type="submit" className="justify-self-start rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-surface">
          {cp.allagi_kodikoy}
        </button>
      </form>

      <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-3">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τα δεδομένα μου (GDPR)</h2>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Μέλος από {new Date(c.memberSince).toLocaleDateString("el-GR", { month: "long", year: "numeric" })}. Μπορείς να κατεβάσεις ό,τι έχουμε για σένα ή να ζητήσεις διαγραφή· η αίτηση απαντάται εντός 30 ημερών (άρθρα 15 & 17).</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => flash("Θα λάβεις email με το αρχείο εντός 24 ωρών.")} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-surface">
            <Download className="size-4" aria-hidden /> {cp.lipsi_dedomenon}
          </button>
          <button type="button" onClick={() => flash("Η αίτηση διαγραφής καταχωρήθηκε. Θα επικοινωνήσουμε για επιβεβαίωση.")} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line text-eu-muted font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:border-eu-red hover:text-eu-red">
            <Trash2 className="size-4" aria-hidden /> {cp.diagrafi_logariasmoy}
          </button>
        </div>
      </section>
    </div>
  );
}
