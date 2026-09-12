"use client";

import { useState } from "react";
import Image from "next/image";
import { useCart } from "./CartProvider";
import { priceLong } from "@/lib/format";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("giftCard");

const AMOUNTS = [20, 50, 100, 150, 200, 300, 500];
const input = "rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full";
const label = "grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink";

/** Gift card configurator: amount, digital/physical, recipient, message, live preview → cart line. */
export function GiftCardBuilder() {
  const { add } = useCart();
  const [amount, setAmount] = useState(100);
  const [kind, setKind] = useState<"email" | "sms" | "physical">("email");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [design, setDesign] = useState<"blue" | "yellow">("blue");
  return (
    <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(
            {
              id: `gift-${amount}-${kind}`,
              sku: `GIFT${amount}`,
              slug: "kartes-dorou",
              brand: "EURONICS",
              brandSlug: "euronics",
              title: `Κάρτα δώρου ${priceLong(amount)} · ${kind === "physical" ? "φυσική" : kind === "sms" ? "SMS" : "email"}${to ? ` για ${to}` : ""}`,
              category: "gift",
              subcategory: "gift",
              image: null,
              price: amount,
              availability: { kind: "in-stock", deliveryDate: new Date().toISOString().slice(0, 10), label: kind === "physical" ? "Παραλαβή από κατάστημα" : "Άμεση παράδοση με email/SMS" },
            },
            { openMiniCart: true },
          );
        }}
        className="bg-white rounded-xl border border-eu-line p-5 grid gap-4"
      >
        <fieldset className="m-0 p-0 border-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1.5">{c.poso}</legend>
          <div className="flex flex-wrap gap-1.5">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" aria-pressed={amount === a} onClick={() => setAmount(a)} className={`rounded-full border-2 px-4 py-2 min-h-11 font-extrabold text-[length:var(--fs-15)] ${amount === a ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink hover:border-eu-blue"}`}>
                {a} €
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 p-0 border-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1.5">{c.paradosi}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["email", "Με email", "άμεσα"],
                ["sms", "Με SMS", "άμεσα"],
                ["physical", "Φυσική κάρτα", "παραλαβή από κατάστημα"],
              ] as const
            ).map(([v, t, s]) => (
              <label key={v} className={`rounded-lg border-2 p-3 cursor-pointer ${kind === v ? "border-eu-blue bg-eu-chip" : "border-eu-line"}`}>
                <input type="radio" name="kind" className="sr-only" checked={kind === v} onChange={() => setKind(v)} />
                <span className="block font-bold text-eu-ink text-[length:var(--fs-15)]">{t}</span>
                <span className="block text-eu-muted text-[length:var(--fs-13-5)]">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
          <label className={label}>
            {c.onoma_paralipti} <input value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </label>
          <label className={label}>
            {kind === "sms" ? "Κινητό παραλήπτη" : kind === "email" ? "Email παραλήπτη" : "Κατάστημα παραλαβής"}
            <input className={input} placeholder={kind === "physical" ? "π.χ. Αθήνα — Μεσογείων 64" : ""} />
          </label>
        </div>
        <label className={label}>
          Μήνυμα (έως 160 χαρακτήρες) <textarea value={msg} maxLength={160} onChange={(e) => setMsg(e.target.value)} rows={2} className="rounded-md border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-15)]" />
        </label>
        <fieldset className="m-0 p-0 border-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1.5">{c.schedio}</legend>
          <div className="flex gap-2">
            {(["blue", "yellow"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={design === d} onClick={() => setDesign(d)} className={`size-11 rounded-md border-2 ${design === d ? "border-eu-navy" : "border-eu-line"} ${d === "blue" ? "bg-eu-blue" : "bg-eu-yellow"}`} aria-label={d === "blue" ? "Μπλε" : "Κίτρινο"} />
            ))}
          </div>
        </fieldset>
        <button type="submit" className="justify-self-start rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:bg-eu-yellow-dark">
          Προσθήκη στο καλάθι · {priceLong(amount)}
        </button>
      </form>
      <div className={`rounded-2xl p-6 aspect-[1.6] flex flex-col justify-between shadow-[var(--shadow-raised)] ${design === "blue" ? "bg-eu-blue text-white" : "bg-eu-yellow text-eu-navy"}`}>
        <div className="flex justify-between items-start">
          <Image src={design === "blue" ? "/design/logo-on-blue.svg" : "/design/logo.svg"} alt="euronics" width={120} height={30} className="h-7 w-auto" />
          <span className="font-extrabold text-[length:var(--fs-13-5)] tracking-wide opacity-80">{c.karta_doroy}</span>
        </div>
        <div>
          <div className="font-extrabold text-[length:var(--fs-44)] leading-none">{amount} €</div>
          {to && <div className="mt-2 font-semibold text-[length:var(--fs-15)]">Για {to}</div>}
          {msg && <div className="mt-1 text-[length:var(--fs-14)] opacity-90 line-clamp-2">«{msg}»</div>}
        </div>
        <div className="text-[length:var(--fs-13)] opacity-80">{c.exargyrosi_online_kai_se}</div>
      </div>
    </div>
  );
}
