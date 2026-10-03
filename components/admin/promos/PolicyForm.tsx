"use client";

import { useState, useTransition } from "react";
import type { PromoPolicy } from "@/lib/promo/policy";
import { Hint } from "./Help";
import { savePolicyAction } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";

function Num({ l, v, on, hint, suffix, info }: { l: string; v: number; on: (n: number) => void; hint?: string; suffix?: string; info?: string }) {
  return (
    <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2">
      <span className="inline-flex items-center gap-1">{l}{info && <Hint k={info} />}</span>
      <span className="flex items-center gap-2"><input inputMode="numeric" className={`${input} max-w-40`} value={v} onChange={(e) => on(Number(e.target.value.replace(/\D/g, "")) || 0)} />{suffix && <span className="font-semibold">{suffix}</span>}</span>
      {hint && <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">{hint}</span>}
    </label>
  );
}

/** Η φόρμα των κανόνων προσφορών. */
export function PolicyForm({ initial, coupons }: { initial: PromoPolicy; coupons: { code: string; name: string }[] }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (patch: Partial<PromoPolicy>) => setP((x) => ({ ...x, ...patch }));
  const save = () => start(async () => { const s = await savePolicyAction(p); setP(s); setMsg("Αποθηκεύτηκε. Οι τιμές της βιτρίνας ξαναϋπολογίζονται τώρα."); });
  const couponSelect = (value: string, on: (v: string) => void, label: string) => (
    <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2">
      <span>{label}</span>
      <select className={input} value={value} onChange={(e) => on(e.target.value)}>
        <option value="">Όχι</option>
        {coupons.map((c) => <option key={c.code} value={c.code}>{c.name} · {c.code}</option>)}
        {value && !coupons.some((c) => c.code === value) && <option value={value}>{value} (δεν είναι ενεργό κουπόνι)</option>}
      </select>
    </label>
  );
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-4">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Δικλείδες τιμής</h3>
        <div className="grid grid-cols-1 @xl:grid-cols-3 gap-4">
          <Num info="maxLinePct" l="Μέγιστη έκπτωση ανά γραμμή" v={p.maxLinePct} on={(n) => set({ maxLinePct: n })} suffix="%" hint="Προσφορές + κουπόνι μαζί. Δεν αφορά 1+1 / 2ο −Χ % / κλίμακες." />
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Κάτω από το κόστος</span>
            <select className={input} value={p.belowCost} onChange={(e) => set({ belowCost: e.target.value as PromoPolicy["belowCost"] })}><option value="block">Ποτέ — η έκπτωση κόβεται στο κόστος</option><option value="warn">Επιτρέπεται, με προειδοποίηση στον οδηγό</option></select>
          </label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Προεπιλογή για νέα κουπόνια</span>
            <select className={input} value={p.couponDefaultStacking} onChange={(e) => set({ couponDefaultStacking: e.target.value as PromoPolicy["couponDefaultStacking"] })}><option value="no-price">Όχι σε προϊόντα ήδη σε προσφορά</option><option value="combine">Και πάνω σε προσφορές</option></select>
          </label>
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-4">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1">Έγκριση από δεύτερο πρόσωπο <Hint k="approval" /></h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Μια προσφορά που ξεπερνά κάποιο όριο δημοσιεύεται μόνο όταν την εγκρίνει χρήστης με δικαίωμα «Έγκριση προσφορών» — και όχι αυτός που τη δημιούργησε. Σε αλλαγή ζωντανής προσφοράς, μέχρι την έγκριση ισχύει η προηγούμενη έκδοση.</p>
        <div className="grid grid-cols-1 @xl:grid-cols-3 gap-4">
          <Num l="Έκπτωση πάνω από" v={p.approvalAbovePct} on={(n) => set({ approvalAbovePct: n })} suffix="%" />
          <Num l="Budget πάνω από" v={p.approvalAboveBudget} on={(n) => set({ approvalAboveBudget: n })} suffix="€" />
          <Num l="Προϊόντα πάνω από" v={p.approvalAboveProducts} on={(n) => set({ approvalAboveProducts: n })} />
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-4">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1">Βιτρίνα & αυτόματα κουπόνια <Hint k="welcome" /></h3>
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-4">
          <Num l="Ετικέτες ανά κάρτα" v={p.maxTagsPerCard} on={(n) => set({ maxTagsPerCard: n })} hint="1–4. Περισσότερες κουράζουν." />
          {couponSelect(p.signupPromotion, (v) => set({ signupPromotion: v }), "Κουπόνι στην εγγραφή")}
          {couponSelect(p.newsletterPromotion, (v) => set({ newsletterPromotion: v }), "Κουπόνι στο newsletter (μετά το double opt-in)")}
          <Num l="Ισχύς προσωπικών κουπονιών" v={p.couponValidDays} on={(n) => set({ couponValidDays: n })} suffix="ημέρες" />
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-4">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1">Αυτόματα μετά από γεγονότα <Hint text="Κάθε κουπόνι είναι προσωπικό, μίας χρήσης. Email στέλνεται μόνο σε πελάτες με λογαριασμό που έχουν δώσει συναίνεση για προωθητικά μηνύματα." /></h3>
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-4">
          {couponSelect(p.nextOrderPromotion, (v) => set({ nextOrderPromotion: v }), "Κουπόνι επόμενης αγοράς (μετά από κάθε παραγγελία)")}
          {couponSelect(p.birthdayPromotion, (v) => set({ birthdayPromotion: v }), "Κουπόνι γενεθλίων (κάθε πρωί)")}
        </div>
        <div className="grid grid-cols-1 @xl:grid-cols-3 gap-4 items-end">
          <label className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><input type="checkbox" className="size-5 accent-eu-navy" checked={p.cartReminders} onChange={(e) => set({ cartReminders: e.target.checked })} /> Υπενθύμιση εγκαταλελειμμένου καλαθιού</label>
          <Num l="Μετά από" v={p.cartReminderHours} on={(n) => set({ cartReminderHours: n })} suffix="ώρες" hint="Μία φορά ανά καλάθι, μέσα σε 48 ώρες." />
          {couponSelect(p.cartPromotion, (v) => set({ cartPromotion: v }), "Κουπόνι στην υπενθύμιση (προαιρετικό)")}
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Ο κωδικός επόμενης αγοράς φαίνεται και στη σελίδα επιβεβαίωσης της παραγγελίας, και σε επισκέπτες χωρίς λογαριασμό.</p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-50">{busy ? "Αποθήκευση…" : "Αποθήκευση κανόνων"}</button>
        {msg && <p role="status" className="m-0 text-eu-green font-semibold text-[length:var(--fs-14)]">{msg}</p>}
      </div>
    </div>
  );
}
