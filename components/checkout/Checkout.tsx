"use client";


import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark, Banknote, Smartphone, Store as StoreIcon, Truck, CalendarClock, ShieldCheck, Lock, RotateCcw, Pencil, Recycle, Check, Tag } from "lucide-react";
import { instalment, priceLong } from "@/lib/format";
import { useCart, type Fulfilment } from "@/components/commerce/CartProvider";
import { Stepper } from "./Stepper";
import { ProductImage } from "@/components/commerce/ProductImage";
import { WalletSheet, type Wallet } from "./WalletSheet";
import { SocialLogin } from "./SocialLogin";
import { AppleMark, GoogleMark, RevolutMark } from "./BrandMarks";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("checkout");

type StoreLite = { id: string; slug: string; name: string; city: string; address: string; zip: string; region: string; distanceKm: number; openUntil: string };
type Pay = "card" | "no-card" | "iris" | "bank" | "cod" | "store" | "apple" | "google" | "revolut";

const REGIONS = ["Αττική", "Θεσσαλονίκη", "Αχαΐα", "Λάρισα", "Ηράκλειο", "Χανιά", "Δωδεκάνησα", "Ιωάννινα", "Μαγνησία", "Καβάλα", "Κέρκυρα", "Εύβοια", "Μεσσηνία", "Σέρρες", "Άλλη"];

/**
 * Checkout as specified in the proposal (p.9 «Checkout σε 3 βήματα»):
 * express checkout on top (Apple Pay / Google Pay / IRIS), then numbered
 * sections — 1 στοιχεία, 2 παράδοση, 3 τιμολόγιο, 4 πληρωμή — that
 * collapse to a one-line summary with «Αλλαγή» once completed. Guest by
 * default, account optional. Sticky order summary with images, coupon
 * and the full total before «Πληρωμή & ολοκλήρωση» (the button names the payment, as the consumer-rights rules require)
 * (Directive 2011/83). Mobile: sticky total + CTA at the bottom.
 * Every text ≥ 14px, every control ≥ 48px.
 */
export function Checkout({ stores }: { stores: StoreLite[] }) {
  const router = useRouter();
  const { lines, subtotal, addonsTotal, hydrated, clear, freeShippingFrom } = useCart();
  const [step, setStep] = useState<2 | 3>(2);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", street: "", number: "", floor: "", city: "", zip: "", region: "Αττική", notes: "", invoice: false, vat: "", company: "", doy: "", activity: "", createAccount: false, password: "", newsletter: false, terms: false, recycle: false });
  const [ful, setFul] = useState<Fulfilment>("courier");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [slot, setSlot] = useState("morning");
  const [pay, setPay] = useState<Pay>("card");
  const [inst, setInst] = useState(1);
  const [sca, setSca] = useState<"idle" | "pending" | "ok">("idle");
  const [vatLookup, setVatLookup] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const goods = subtotal + addonsTotal;
  const heavy = lines.some((l) => l.product.installation);
  const shipping = ful !== "courier" ? 0 : goods >= freeShippingFrom ? 0 : 4.9;
  const codFee = pay === "cod" ? 2 : 0;
  const total = Math.max(0, goods - discount) + shipping + codFee;
  const maxInst = total >= 800 ? 24 : total >= 400 ? 12 : total >= 200 ? 6 : total >= 100 ? 3 : 1;
  const store = stores.find((s) => s.id === storeId);
  const eta = ful === "click-collect" ? "Έτοιμη σε 2 ώρες" : ful === "appointment" ? "Ραντεβού εντός 24 ωρών" : "Παράδοση σε 1–3 εργάσιμες";

  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = "Συμπλήρωσε το όνομά σου";
    if (!f.lastName.trim()) e.lastName = "Συμπλήρωσε το επώνυμό σου";
    if (!/\S+@\S+\.\S+/.test(f.email)) e.email = "Έγκυρο email, π.χ. maria@example.gr";
    if (!/^\d{10}$/.test(f.phone.replace(/\s/g, ""))) e.phone = "10 ψηφία, π.χ. 6912345678";
    if (ful !== "click-collect") {
      if (!f.street.trim()) e.street = "Οδός";
      if (!f.number.trim()) e.number = "Αριθμός";
      if (!f.city.trim()) e.city = "Πόλη";
      if (!/^\d{5}$/.test(f.zip)) e.zip = "5 ψηφία";
    }
    if (f.invoice && !/^\d{9}$/.test(f.vat)) e.vat = "Ο ΑΦΜ έχει 9 ψηφία";
    return e;
  }, [f, ful]);
  const validStep2 = Object.keys(errors).length === 0;

  const lookupVat = () => {
    if (!/^\d{9}$/.test(f.vat)) return setVatLookup("err");
    setVatLookup("loading");
    setTimeout(() => {
      setF((s) => ({ ...s, company: s.company || "ΠΑΠΑΔΟΠΟΥΛΟΣ Ι. & ΣΙΑ Ο.Ε.", doy: s.doy || "Αθηνών Α΄", activity: s.activity || "Λιανικό εμπόριο" }));
      setVatLookup("ok");
    }, 700);
  };
  const applyCoupon = () => {
    const c = coupon.trim().toUpperCase();
    if (c === "EURONICS10") {
      setDiscount(Math.round(goods * 0.1 * 100) / 100);
      setCouponMsg("Κουπόνι EURONICS10: −10% στα προϊόντα.");
    } else if (c.startsWith("GIFT")) {
      setDiscount(Math.min(goods, 50));
      setCouponMsg("Κάρτα δώρου 50,00 € εξαργυρώθηκε.");
    } else {
      setDiscount(0);
      setCouponMsg("Ο κωδικός δεν ισχύει. Δοκίμασε EURONICS10.");
    }
  };

  const next = () => {
    if (!validStep2) {
      setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
      document.getElementById(`fld-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const submit = () => {
    if (!f.terms) return setErr("Πρέπει να αποδεχτείς τους όρους χρήσης για να συνεχίσεις.");
    setErr(null);
    if (pay === "apple" || pay === "google" || pay === "revolut") return setWallet(pay);
    if (pay === "card" || pay === "no-card") {
      setSca("pending");
      setTimeout(() => {
        setSca("ok");
        finish();
      }, 1800);
    } else finish();
  };
  const finish = () => {
    const no = `EUR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const order = { number: no, date: new Date().toISOString(), lines: lines.map((l) => ({ id: l.product.id, title: l.product.title, brand: l.product.brand, image: l.product.image, qty: l.qty, unitPrice: l.product.price, addons: l.addons, variant: l.variant })), total, shipping, goods, discount, pay, inst, ful, store: store ? `${store.name} — ${store.address}, ${store.city}` : null, slot, address: { ...f, password: "" }, recycle: f.recycle };
    try {
      localStorage.setItem("euronics.lastOrder", JSON.stringify(order));
    } catch {}
    clear();
    router.push(`/checkout/epityxia?no=${no}`);
  };

  if (!hydrated) return <div className="eu-canvas eu-gutter py-12 text-eu-muted text-[length:var(--fs-16)]">{c.fortosi}</div>;
  if (lines.length === 0)
    return (
      <div className="eu-canvas eu-gutter py-10">
        <Stepper step={2} />
        <div className="rounded-2xl bg-eu-surface p-10 text-center">
          <p className="m-0 text-eu-ink font-bold text-[length:var(--fs-21)]">{c.to_kalathi_soy_einai}</p>
          <Link href="/proionta" className="inline-flex mt-5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 items-center">
            {c.des_ta_proionta}
          </Link>
        </div>
      </div>
    );

  const inputCls = (k?: string) => `rounded-xl border-2 bg-white px-4 min-h-12 text-[length:var(--fs-16)] w-full outline-none focus-visible:border-eu-blue ${k && touched[k] && errors[k] ? "border-eu-red" : "border-eu-line"}`;
  const field = (k: keyof typeof f, label: string, input: ReactNode, span = "", hint?: string) => (
    <label className={`grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink ${span}`}>
      <span>
        {label}
        {hint && <span className="font-normal text-eu-muted"> · {hint}</span>}
      </span>
      {input}
      {touched[k] && errors[k] && <span className="text-eu-red font-semibold text-[length:var(--fs-14)]">{errors[k]}</span>}
    </label>
  );
  const text = (k: keyof typeof f, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={`fld-${k}`} value={f[k] as string} onChange={(e) => set(k, e.target.value)} onBlur={() => touch(k)} className={inputCls(k)} {...extra} />;

  const delivery: { v: Fulfilment; icon: typeof Truck; t: string; price: string; sub: string }[] = [
    { v: "courier", icon: Truck, t: "Στη διεύθυνσή μου", price: goods >= freeShippingFrom ? "Δωρεάν" : "4,90 €", sub: "1–3 εργάσιμες · ACS / Γενική Ταχυδρομική" },
    { v: "click-collect", icon: StoreIcon, t: "Παραλαβή από κατάστημα", price: "Δωρεάν", sub: "Σε 2 ώρες όπου υπάρχει απόθεμα · 350 καταστήματα" },
    { v: "appointment", icon: CalendarClock, t: "Με ραντεβού", price: heavy ? "Δωρεάν" : "Δωρεάν από 100 €", sub: heavy ? "Με εγκατάσταση από τεχνικό του καταστήματος" : "Επιλέγεις ημέρα και ώρα" },
  ];
  const payments: { v: Pay; icon: typeof Truck; t: string; sub: string; disabled?: boolean; mark?: React.ReactNode }[] = [
    { v: "card", icon: CreditCard, t: "Κάρτα", sub: `Visa · Mastercard · Amex${maxInst > 1 ? ` · έως ${maxInst} άτοκες` : ""}` },
    { v: "apple", icon: CreditCard, t: "Apple Pay", sub: "Με Face ID / Touch ID, χωρίς πληκτρολόγηση", mark: <AppleMark className="size-5" /> },
    { v: "google", icon: CreditCard, t: "Google Pay", sub: "Με την κάρτα του Google λογαριασμού σου", mark: <GoogleMark className="size-5" /> },
    { v: "revolut", icon: CreditCard, t: "Revolut Pay", sub: "Επιβεβαίωση στην εφαρμογή Revolut, χωρίς προμήθεια", mark: <RevolutMark className="h-4" /> },
    { v: "no-card", icon: Smartphone, t: "Δόσεις χωρίς κάρτα", sub: total >= 200 && total <= 2000 ? `Eurobank · έως 24 × ${priceLong(instalment(total, 24))}` : "Για αγορές 200–2.000 €", disabled: total < 200 || total > 2000 },
    { v: "iris", icon: Smartphone, t: "IRIS", sub: "Άμεσα από το mobile banking, χωρίς προμήθεια" },
    { v: "bank", icon: Landmark, t: "Κατάθεση σε τράπεζα", sub: "Εθνική · Πειραιώς · Eurobank · Alpha" },
    { v: "cod", icon: Banknote, t: "Αντικαταβολή", sub: total <= 500 ? "Μετρητά ή κάρτα στον διανομέα · +2,00 €" : "Διαθέσιμη έως 500 €", disabled: total > 500 },
    ...(ful === "click-collect" ? [{ v: "store" as Pay, icon: StoreIcon, t: "Στο κατάστημα", sub: "Μετρητά ή κάρτα κατά την παραλαβή" }] : []),
  ];

  return (
    <div className="eu-canvas eu-gutter pb-28 @3xl:pb-12">
      <Stepper step={step} />
      <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_360px] @5xl:grid-cols-[minmax(0,1fr)_420px] gap-6 @3xl:gap-8 items-start">
        <div className="min-w-0 grid gap-4 eu-container">
          {step === 2 && (
            <>
              <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-3" aria-labelledby="express">
                <div className="flex items-center justify-between gap-3">
                  <h1 id="express" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">
                    {c.grigori_oloklirosi}
                  </h1>
                  <span className="text-eu-muted text-[length:var(--fs-14)] hidden @sm:inline">{c.dieythynsi_pliromi_apo_to}</span>
                </div>
                <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
                  <button type="button" onClick={() => setWallet("apple")} aria-label={c.pliromi_me_apple_pay} className="rounded-full bg-black text-white font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:bg-black/85">
                    <AppleMark className="size-5" /> Pay
                  </button>
                  <button type="button" onClick={() => setWallet("google")} aria-label={c.pliromi_me_google_pay} className="rounded-full bg-white text-eu-ink border-2 border-eu-line font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:border-eu-blue">
                    <GoogleMark className="size-5" /> Pay
                  </button>
                  <button type="button" onClick={() => setWallet("revolut")} aria-label={c.pliromi_me_revolut_pay} className="rounded-full bg-black text-white font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:bg-black/85">
                    <RevolutMark className="h-4" /> Pay
                  </button>
                  <button type="button" onClick={() => setPay("iris")} className="rounded-full bg-eu-blue text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue-dark">
                    IRIS
                  </button>
                </div>
                <div className="flex items-center gap-3 text-eu-muted text-[length:var(--fs-14)]">
                  <span className="flex-1 h-px bg-eu-line" /> {c.i_symplirose_ta_stoicheia} <span className="flex-1 h-px bg-eu-line" />
                </div>
              </section>

              <Section n={1} title={c.stoicheia_epikoinonias} lead="Εδώ στέλνουμε την επιβεβαίωση και το SMS παράδοσης.">
                {signedIn ? (
                  <p className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-15)] px-4 py-3 inline-flex items-center gap-2">
                    <Check className="size-4" aria-hidden /> Συνδέθηκες με {signedIn}. Τα στοιχεία σου συμπληρώθηκαν.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <div className="text-eu-ink-3 text-[length:var(--fs-14)] font-semibold">{c.syndesi_gia_aytomati_symplirosi}</div>
                    <SocialLogin
                      onSignedIn={(p) => {
                        setF((x) => ({ ...x, firstName: p.firstName, lastName: p.lastName, email: p.email }));
                        setSignedIn({ google: "Google", microsoft: "Microsoft", facebook: "Facebook", apple: "Apple" }[p.provider]);
                      }}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
                  {field("firstName", "Όνομα", text("firstName", { autoComplete: "given-name", required: true }), "")}
                  {field("lastName", "Επώνυμο", text("lastName", { autoComplete: "family-name", required: true }), "")}
                  {field("email", "Email", text("email", { type: "email", autoComplete: "email", inputMode: "email", required: true }), "")}
                  {field("phone", "Κινητό", text("phone", { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "69xxxxxxxx", required: true }), "", "για SMS παράδοσης")}
                </div>
                <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">
                  Ολοκληρώνεις ως επισκέπτης.{" "}
                  <Link href="/eisodos" className="text-eu-blue font-bold underline">
                    {c.echeis_logariasmo}
                  </Link>
                </p>
              </Section>

              <Section n={2} title={c.paradosi} lead="Το κόστος και ο χρόνος φαίνονται πριν διαλέξεις.">
                <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-2.5">
                  {delivery.map((d) => (
                    <label key={d.v} className={`rounded-xl border-2 p-4 cursor-pointer grid gap-1 ${ful === d.v ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                      <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-16)]">
                        <input type="radio" name="ful" checked={ful === d.v} onChange={() => setFul(d.v)} className="accent-eu-blue size-[18px]" />
                        <d.icon className="size-5 text-eu-blue shrink-0" aria-hidden /> {d.t}
                      </span>
                      <span className={`pl-7 font-extrabold text-[length:var(--fs-15)] ${d.price === "Δωρεάν" ? "text-eu-green" : "text-eu-ink"}`}>{d.price}</span>
                      <span className="pl-7 text-eu-muted text-[length:var(--fs-14)]">{d.sub}</span>
                    </label>
                  ))}
                </div>

                {ful === "click-collect" ? (
                  <div className="grid gap-3 rounded-xl bg-eu-surface p-4">
                    <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink">
                      {c.katastima_paralavis}
                      <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls()}>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.city} — {s.name} ({s.distanceKm} km)
                          </option>
                        ))}
                      </select>
                    </label>
                    {store && (
                      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">
                        <strong className="text-eu-green">{c.etoimi_se_2_ores}</strong> {store.address}, {store.zip} {store.city} · ανοιχτό έως {store.openUntil}. Θα λάβεις SMS όταν είναι έτοιμη.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 @sm:grid-cols-6 gap-4">
                    {field("street", "Οδός", text("street", { autoComplete: "address-line1", placeholder: "π.χ. Λεωφόρος Κηφισίας" }), "@sm:col-span-4")}
                    {field("number", "Αριθμός", text("number"), "@sm:col-span-1")}
                    {field("floor", "Όροφος", text("floor"), "@sm:col-span-1")}
                    {field("city", "Πόλη", text("city", { autoComplete: "address-level2" }), "@sm:col-span-2")}
                    {field("zip", "Τ.Κ.", text("zip", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 5 }), "@sm:col-span-2")}
                    <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink @sm:col-span-2">
                      {c.nomos}
                      <select value={f.region} onChange={(e) => set("region", e.target.value)} className={inputCls()}>
                        {REGIONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {ful === "appointment" && (
                  <div className="grid gap-2 rounded-xl bg-eu-surface p-4">
                    <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{c.protimisi_oras}</div>
                    <div className="flex flex-wrap gap-2">
                      {[["morning", "Πρωί 09:00–13:00"], ["noon", "Μεσημέρι 13:00–17:00"], ["evening", "Απόγευμα 17:00–20:00"]].map(([v, t]) => (
                        <label key={v} className={`rounded-full border-2 px-4 min-h-11 inline-flex items-center text-[length:var(--fs-15)] font-bold cursor-pointer ${slot === v ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white"}`}>
                          <input type="radio" name="slot" className="sr-only" checked={slot === v} onChange={() => setSlot(v)} />
                          {t}
                        </label>
                      ))}
                    </div>
                    <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{c.o_technikos_toy_katastimatos}</p>
                  </div>
                )}
                {heavy && (
                  <label className="flex items-start gap-3 rounded-xl border-2 border-eu-line p-4 text-[length:var(--fs-15)] text-eu-ink-2 cursor-pointer hover:border-eu-green">
                    <input type="checkbox" checked={f.recycle} onChange={(e) => set("recycle", e.target.checked)} className="mt-0.5 size-[18px] accent-eu-green" />
                    <Recycle className="size-6 text-eu-green shrink-0" aria-hidden />
                    <span>
                      <strong className="text-eu-ink">{c.paralavi_palias_syskeyis_gia}</strong> {c.tin_pairnoyme_kata_tin}
                    </span>
                  </label>
                )}
                <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink">
                  {c.scholia_gia_ton_dianomea} <span className="font-normal text-eu-muted">{c.proairetika}</span>
                  <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="rounded-xl border-2 border-eu-line bg-white px-4 py-3 text-[length:var(--fs-16)] font-normal" placeholder={c.p_ch_koydoyni_ores} />
                </label>
              </Section>

              <Section n={3} title={c.apodeixi_i_timologio} lead="Με ΑΦΜ τα στοιχεία συμπληρώνονται από την ΑΑΔΕ." optional>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    [false, "Απόδειξη λιανικής"],
                    [true, "Τιμολόγιο"],
                  ].map(([v, t]) => (
                    <label key={String(v)} className={`rounded-xl border-2 p-4 cursor-pointer flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-16)] ${f.invoice === v ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                      <input type="radio" name="doc" checked={f.invoice === v} onChange={() => set("invoice", v as boolean)} className="accent-eu-blue size-[18px]" /> {t}
                    </label>
                  ))}
                </div>
                {f.invoice && (
                  <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
                    {field(
                      "vat",
                      "ΑΦΜ",
                      <>
                        <div className="flex gap-2">
                          {text("vat", { inputMode: "numeric", maxLength: 9 })}
                          <button type="button" onClick={lookupVat} className="rounded-xl bg-eu-navy text-white font-bold text-[length:var(--fs-15)] px-4 min-h-12 shrink-0 hover:bg-eu-blue">
                            {vatLookup === "loading" ? "…" : "ΑΑΔΕ"}
                          </button>
                        </div>
                        {vatLookup === "ok" && <span className="text-eu-green font-semibold text-[length:var(--fs-14)]">{c.vrethike_sto_mitroo_aade}</span>}
                      </>,
                    )}
                    {field("company", "Επωνυμία", text("company"), "")}
                    {field("doy", "ΔΟΥ", text("doy"), "")}
                    {field("activity", "Δραστηριότητα", text("activity"), "")}
                  </div>
                )}
              </Section>

              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <Link href="/kalathi" className="font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline min-h-12 inline-flex items-center">
                  {c.piso_sto_kalathi}
                </Link>
                <button type="button" onClick={next} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-17)] px-8 min-h-14 hover:bg-eu-blue">
                  {c.synecheia_stin_pliromi}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-3">
                <Done label="Στοιχεία" value={`${f.firstName} ${f.lastName} · ${f.email} · ${f.phone}`} onEdit={() => setStep(2)} />
                <Done label="Παράδοση" value={ful === "click-collect" && store ? `Παραλαβή από ${store.name}, ${store.city} · Έτοιμη σε 2 ώρες` : `${f.street} ${f.number}${f.floor ? `, ${f.floor}` : ""}, ${f.zip} ${f.city} · ${eta}`} onEdit={() => setStep(2)} />
                <Done label="Παραστατικό" value={f.invoice ? `Τιμολόγιο · ΑΦΜ ${f.vat} · ${f.company}` : "Απόδειξη λιανικής"} onEdit={() => setStep(2)} />
              </div>

              <Section n={4} title={c.pliromi} lead="Το ποσό που βλέπεις δεξιά είναι το τελικό.">
                <div className="grid grid-cols-1 @xl:grid-cols-2 gap-2.5">
                  {payments.map((o) => (
                    <label key={o.v} className={`rounded-xl border-2 p-4 grid gap-1 ${o.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${pay === o.v ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                      <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-16)]">
                        <input type="radio" name="pay" disabled={o.disabled} checked={pay === o.v} onChange={() => setPay(o.v)} className="accent-eu-blue size-[18px]" />
                        {o.mark ?? <o.icon className="size-5 text-eu-blue shrink-0" aria-hidden />} {o.t}
                      </span>
                      <span className="text-eu-muted text-[length:var(--fs-14)] pl-7">{o.sub}</span>
                    </label>
                  ))}
                </div>

                {pay === "card" && (
                  <div className="grid gap-4 rounded-xl bg-eu-surface p-4 @md:p-5">
                    <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
                      <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink @sm:col-span-2">
                        {c.arithmos_kartas} <input inputMode="numeric" placeholder="•••• •••• •••• 4821" className={inputCls()} autoComplete="cc-number" />
                      </label>
                      <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink">
                        {c.lixi} <input placeholder="MM/YY" className={inputCls()} autoComplete="cc-exp" />
                      </label>
                      <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink">
                        CVC <input inputMode="numeric" placeholder="•••" className={inputCls()} autoComplete="cc-csc" />
                      </label>
                    </div>
                    {maxInst > 1 && (
                      <div className="grid gap-2">
                        <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{c.atokes_doseis}</div>
                        <div className="flex flex-wrap gap-2">
                          {[1, 3, 6, 12, 24]
                            .filter((n) => n <= maxInst)
                            .map((n) => (
                              <label key={n} className={`rounded-xl border-2 px-4 min-h-12 inline-flex flex-col justify-center cursor-pointer ${inst === n ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink"}`}>
                                <input type="radio" name="inst" className="sr-only" checked={inst === n} onChange={() => setInst(n)} />
                                <span className="font-extrabold text-[length:var(--fs-15)] leading-tight">{n === 1 ? "Εφάπαξ" : `${n} δόσεις`}</span>
                                {n > 1 && <span className={`text-[length:var(--fs-13-5)] ${inst === n ? "text-eu-yellow" : "text-eu-muted"}`}>{priceLong(instalment(total, n))}/μήνα</span>}
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                    <p className="m-0 text-eu-muted text-[length:var(--fs-14)] flex items-start gap-2">
                      <ShieldCheck className="size-5 text-eu-green shrink-0" aria-hidden /> {c.ta_stoicheia_kartas_den}
                    </p>
                  </div>
                )}
                {pay === "no-card" && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.tha_metafertheis_sto_asfales}</p>}
                {pay === "bank" && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.oi_logariasmoi_ethniki_peiraios}</p>}
                {pay === "iris" && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.tha_anoixei_to_mobile}</p>}
              </Section>

              <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-3">
                <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)]">{c.logariasmos_sygkatatheseis}</h2>
                <label className="flex items-start gap-3 text-[length:var(--fs-15)] text-eu-ink-2 cursor-pointer">
                  <input type="checkbox" checked={f.createAccount} onChange={(e) => set("createAccount", e.target.checked)} className="mt-0.5 size-[18px] accent-eu-blue" />
                  <span>
                    <strong className="text-eu-ink">{c.dimioyrgise_logariasmo}</strong> με το {f.email || "email μου"} για παραγγελίες, εγγυήσεις και επιστροφές σε ένα σημείο.
                  </span>
                </label>
                {f.createAccount && (
                  <label className="grid gap-1.5 text-[length:var(--fs-15)] font-bold text-eu-ink max-w-sm">
                    {c.kodikos} <span className="font-normal text-eu-muted">{c.toylachiston_8_charaktires}</span>
                    <input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} className={inputCls()} autoComplete="new-password" />
                  </label>
                )}
                <label className="flex items-start gap-3 text-[length:var(--fs-15)] text-eu-ink-2 cursor-pointer">
                  <input type="checkbox" checked={f.newsletter} onChange={(e) => set("newsletter", e.target.checked)} className="mt-0.5 size-[18px] accent-eu-blue" />
                  <span>{c.thelo_prosfores_me_email}</span>
                </label>
                <label className={`flex items-start gap-3 text-[length:var(--fs-15)] text-eu-ink-2 cursor-pointer rounded-xl p-3 -m-3 ${err ? "bg-eu-red/10" : ""}`}>
                  <input type="checkbox" checked={f.terms} onChange={(e) => {
                    set("terms", e.target.checked);
                    setErr(null);
                  }} className="mt-0.5 size-[18px] accent-eu-blue" />
                  <span>
                    Αποδέχομαι τους{" "}
                    <Link href="/oroi-chrisis" className="text-eu-blue underline">
                      {c.oroys_chrisis}
                    </Link>{" "}
                    και την{" "}
                    <Link href="/aporrito" className="text-eu-blue underline">
                      {c.politiki_aporritoy}
                    </Link>
                    {c.mporo_na_epistrepso_o}
                  </span>
                </label>
                {err && <p className="m-0 text-eu-red font-semibold text-[length:var(--fs-15)]">{err}</p>}
              </section>

              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline min-h-12">
                  {c.stoicheia_paradosi}
                </button>
                <button type="button" onClick={submit} disabled={sca === "pending"} className="hidden @3xl:inline-flex rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] px-8 min-h-14 items-center hover:bg-eu-yellow-dark disabled:opacity-60">
                  {sca === "pending" ? "Επιβεβαίωση πληρωμής…" : `Πληρωμή ${priceLong(total)} & ολοκλήρωση`}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="bg-white rounded-2xl border border-eu-line shadow-[var(--shadow-card)] @3xl:sticky @3xl:top-16 overflow-hidden" aria-label={c.synopsi_paraggelias}>
          <div className="bg-eu-navy text-white px-5 py-4 flex items-center justify-between">
            <h2 className="m-0 font-extrabold text-[length:var(--fs-17)]">{c.i_paraggelia_soy}</h2>
            <span className="text-eu-on-dark text-[length:var(--fs-14)]">{lines.reduce((n, l) => n + l.qty, 0)} τεμ.</span>
          </div>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {lines.map((l) => (
              <li key={l.product.id + (l.variant ?? "")} className="flex gap-3 items-start p-4">
                <div className="relative shrink-0">
                  <ProductImage src={l.product.image} sizes="64px" className="size-16" rounded="rounded-lg" />
                  <span className="absolute -top-2 -right-2 size-6 rounded-full bg-eu-navy text-white text-[length:var(--fs-13)] font-bold inline-flex items-center justify-center">{l.qty}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">{l.product.brand}</div>
                  <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-2">{l.product.title}</div>
                  {l.variant && <div className="text-eu-muted text-[length:var(--fs-14)]">{l.variant}</div>}
                  {l.addons.map((a) => (
                    <div key={a.slug} className="text-eu-blue text-[length:var(--fs-14)] flex items-center gap-1">
                      <Check className="size-3.5" aria-hidden /> {a.title} · {a.price ? priceLong(a.price) : "δωρεάν"}
                    </div>
                  ))}
                </div>
                <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)] shrink-0">{priceLong(l.qty * (l.product.price + l.addons.reduce((n, a) => n + a.price, 0)))}</div>
              </li>
            ))}
          </ul>
          <div className="p-5 grid gap-4 border-t border-eu-line">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyCoupon();
              }}
              className="grid gap-1.5"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
                  <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={c.koyponi_i_karta_doroy} aria-label={c.koyponi} className="w-full min-w-0 rounded-xl border-2 border-eu-line pl-10 pr-3 min-h-12 text-[length:var(--fs-15)]" />
                </div>
                <button type="submit" className="rounded-xl border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-surface">
                  {c.efarmogi}
                </button>
              </div>
              {couponMsg && <p className={`m-0 text-[length:var(--fs-14)] font-semibold ${discount ? "text-eu-green" : "text-eu-red"}`}>{couponMsg}</p>}
            </form>
            <dl className="m-0 grid gap-2 text-[length:var(--fs-15)] text-eu-ink-2">
              <Row k="Προϊόντα & υπηρεσίες" v={priceLong(goods)} />
              {discount > 0 && <Row k="Έκπτωση" v={`− ${priceLong(discount)}`} cls="text-eu-green" />}
              <Row k={ful === "courier" ? "Μεταφορικά" : ful === "click-collect" ? "Παραλαβή από κατάστημα" : "Παράδοση με ραντεβού"} v={shipping === 0 ? "Δωρεάν" : priceLong(shipping)} cls={shipping === 0 ? "text-eu-green" : ""} />
              {codFee > 0 && <Row k="Αντικαταβολή" v={priceLong(codFee)} />}
              <Row k="ΦΠΑ 24% (περιλαμβάνεται)" v={priceLong(total - total / 1.24)} cls="text-eu-muted-2 text-[length:var(--fs-14)]" />
              <div className="flex justify-between items-baseline border-t-2 border-eu-line pt-3 mt-1">
                <dt className="font-extrabold text-eu-ink text-[length:var(--fs-17)]">{c.synolo}</dt>
                <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-28)] leading-none">{priceLong(total)}</dd>
              </div>
              {maxInst > 1 && <div className="text-eu-blue font-bold text-[length:var(--fs-14)] text-right">ή {maxInst} × {priceLong(instalment(total, maxInst))} άτοκα</div>}
            </dl>
            <div className="rounded-xl bg-eu-surface px-4 py-3 text-[length:var(--fs-14)] text-eu-ink-2 flex items-center gap-2">
              <Truck className="size-5 text-eu-blue shrink-0" aria-hidden /> {eta}
            </div>
            {step === 3 && (
              <button type="button" onClick={submit} disabled={sca === "pending"} className="hidden @3xl:block rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] py-4 min-h-14 hover:bg-eu-yellow-dark disabled:opacity-60">
                {sca === "pending" ? "Επιβεβαίωση πληρωμής…" : `Πληρωμή ${priceLong(total)} & ολοκλήρωση`}
              </button>
            )}
            {step === 3 && <p className="m-0 text-eu-muted text-[length:var(--fs-14)] leading-snug">Πατώντας το κουμπί χρεώνεται το ποσό {priceLong(total)} και η παραγγελία σου καταχωρείται. Θα λάβεις email επιβεβαίωσης αμέσως.</p>}
            {step === 2 && (
              <button type="button" onClick={next} className="hidden @3xl:block rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-17)] py-4 min-h-14 hover:bg-eu-blue">
                {c.synecheia_stin_pliromi}
              </button>
            )}
            <ul className="m-0 p-0 list-none grid gap-2 text-[length:var(--fs-14)] text-eu-muted">
              {[
                [Lock, "Ασφαλής πληρωμή με 3D Secure"],
                [RotateCcw, "Επιστροφή μέσα σε 14 ημέρες · δωρεάν σε 350 καταστήματα"],
                [ShieldCheck, "Εγγύηση 2 ετών σε κάθε προϊόν"],
              ].map(([Icon, t]) => {
                const I = Icon as typeof Lock;
                return (
                  <li key={String(t)} className="flex items-center gap-2">
                    <I className="size-4 text-eu-green shrink-0" aria-hidden /> {String(t)}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobile: sticky total + CTA */}
      <div className="@3xl:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-eu-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 shadow-[0_-6px_20px_rgba(18,42,88,0.12)]">
        <div className="min-w-0">
          <div className="text-eu-muted text-[length:var(--fs-13)]">{c.synolo}</div>
          <div className="font-extrabold text-eu-ink text-[length:var(--fs-21)] leading-none">{priceLong(total)}</div>
        </div>
        {step === 2 ? (
          <button type="button" onClick={next} className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-14">
            {c.synecheia_stin_pliromi}
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={sca === "pending"} className="flex-1 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] min-h-14 disabled:opacity-60">
            {sca === "pending" ? "Επιβεβαίωση…" : "Πληρωμή & ολοκλήρωση"}
          </button>
        )}
      </div>
      {wallet && (
        <WalletSheet
          kind={wallet}
          total={total}
          itemsLabel={`${lines.length} ${lines.length === 1 ? "προϊόν" : "προϊόντα"}${shipping ? " · μεταφορικά" : ""}`}
          address={f.street ? `${f.street} ${f.number}, ${f.zip} ${f.city}` : undefined}
          onClose={() => setWallet(null)}
          onDone={() => {
            setWallet(null);
            if (!f.firstName) setF((x) => ({ ...x, firstName: "Μαρία", lastName: "Παπαδοπούλου", email: "maria.p@icloud.com", phone: "6945123456", street: "Λ. Κηφισού", number: "48", city: "Περιστέρι", zip: "12132", terms: true }));
            finish();
          }}
        />
      )}
    </div>
  );
}

function Section({ n, title, lead, optional, children }: { n: number; title: string; lead?: string; optional?: boolean; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6 grid gap-4" aria-labelledby={`sec-${n}`}>
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] inline-flex items-center justify-center shrink-0">{n}</span>
        <div>
          <h2 id={`sec-${n}`} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] leading-tight">
            {title}
            {optional && <span className="ml-2 text-eu-muted font-normal text-[length:var(--fs-14)]">{c.proairetika_2}</span>}
          </h2>
          {lead && <p className="m-0 mt-0.5 text-eu-muted text-[length:var(--fs-15)]">{lead}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Done({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <span className="size-8 rounded-full bg-eu-green text-white inline-flex items-center justify-center shrink-0 mt-0.5">
        <Check className="size-4" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{label}</div>
        <div className="text-eu-ink-2 text-[length:var(--fs-15)] break-words">{value}</div>
      </div>
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-14)] min-h-10 hover:underline shrink-0">
        <Pencil className="size-3.5" aria-hidden /> {c.allagi}
      </button>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${cls}`}>
      <dt>{k}</dt>
      <dd className="m-0 font-semibold">{v}</dd>
    </div>
  );
}
