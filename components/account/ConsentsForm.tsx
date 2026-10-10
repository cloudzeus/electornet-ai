"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { ConsentPref } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("consents");

const CH: { key: keyof ConsentPref["channels"]; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "push", label: "Push" },
  { key: "viber", label: "Viber" },
];

/**
 * @dynamic Consent matrix — every toggle posts one ledger entry
 * (topic, channel, value, timestamp, source=web) so the DPO can prove
 * consent per GDPR art. 7(1). Order updates are transactional and cannot
 * be switched off for email.
 */
export function ConsentsForm({ initial }: { initial: ConsentPref[] }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState<boolean | "error">(false);
  // κάθε αλλαγή = μία εγγραφή στο μητρώο συναινέσεων (POST /api/account/consents)· αν αποτύχει, επιστρέφει όπως ήταν
  const toggle = async (topic: ConsentPref["topic"], ch: keyof ConsentPref["channels"]) => {
    const before = prefs.find((p) => p.topic === topic)!;
    const granted = !before.channels[ch];
    setPrefs((ps) => ps.map((p) => (p.topic === topic ? { ...p, channels: { ...p.channels, [ch]: granted }, updated: new Date().toISOString().slice(0, 10) } : p)));
    const ok = await fetch("/api/account/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, channel: ch, granted }) }).then((r) => r.ok).catch(() => false);
    if (!ok) setPrefs((ps) => ps.map((p) => (p.topic === topic ? before : p)));
    setSaved(ok ? true : "error");
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div className="grid gap-3">
      <div className="bg-white rounded-2xl border border-eu-line overflow-hidden">
        <div className="hidden @md:grid grid-cols-[minmax(0,1fr)_repeat(4,72px)] gap-2 px-5 py-3 bg-eu-surface font-extrabold text-eu-ink text-[length:var(--fs-14)]">
          <span>{c.thema}</span>
          {CH.map((c) => (
            <span key={c.key} className="text-center">
              {c.label}
            </span>
          ))}
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {prefs.map((p) => (
            <li key={p.topic} className="grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_repeat(4,72px)] gap-3 @md:gap-2 px-5 py-4 items-center">
              <div className="min-w-0">
                <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">{p.label}</div>
                <div className="text-eu-muted text-[length:var(--fs-14)]">{p.help}</div>
                <div className="text-eu-muted-2 text-[length:var(--fs-13)] mt-0.5">{p.updated ? `Τελευταία αλλαγή ${new Date(p.updated).toLocaleDateString("el-GR")}` : "Δεν έχει οριστεί ακόμη"}</div>
              </div>
              {CH.map((c) => {
                const locked = p.topic === "orders" && c.key === "email";
                const on = p.channels[c.key];
                return (
                  <label key={c.key} className={`flex @md:justify-center items-center gap-2 ${locked ? "opacity-60" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(p.topic, c.key)} className="size-5 accent-eu-blue" aria-label={`${p.label} — ${c.label}`} />
                    <span className="@md:hidden text-[length:var(--fs-14)] text-eu-ink-2">{c.label}</span>
                  </label>
                );
              })}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[length:var(--fs-14)] text-eu-muted">
        <span>Οι αλλαγές αποθηκεύονται αμέσως και καταγράφονται με ημερομηνία (GDPR άρθρο 7).</span>
        {saved === true && (
          <span role="status" className="inline-flex items-center gap-1.5 text-eu-green font-bold">
            <Check className="size-4" aria-hidden /> {c.apothikeytike}
          </span>
        )}
        {saved === "error" && <span role="alert" className="text-eu-red font-bold">Δεν αποθηκεύτηκε — δοκίμασε ξανά.</span>}
      </div>
    </div>
  );
}
