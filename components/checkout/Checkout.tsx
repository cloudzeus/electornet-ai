"use client";


import { track } from "@/lib/track";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PickupStorePicker } from "@/components/pdp/PickupStorePicker";
import { readPickup, savePickup } from "@/lib/geo/pickup-pref";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark, Banknote, Smartphone, Wallet as Wallet2, ExternalLink, Store as StoreIcon, Truck, Container, CalendarClock, ShieldCheck, Lock, RotateCcw, Pencil, Recycle, Check, Tag, Home, Zap, Loader2 } from "lucide-react";
import { instalment, priceLong } from "@/lib/format";
import { useCart, type Fulfilment } from "@/components/commerce/CartProvider";
import { Stepper } from "./Stepper";
import { ProductImage } from "@/components/commerce/ProductImage";
import { WalletSheet, type Wallet } from "./WalletSheet";
import { SocialLogin } from "./SocialLogin";
import { AppleMark, GoogleMark, RevolutMark } from "./BrandMarks";
import { copyOf } from "@/lib/cms/copy";
import { useServerQuote, quoteLineOf, savedCoupon, saveCoupon, type ServerQuote } from "./useServerQuote";
import { FreeShippingNote, GiftLines, PromoHints } from "./PromoPerks";
import { BoxNowPicker, type Locker } from "./BoxNowPicker";
import { carrierDef } from "@/lib/shipping/carriers";

const c = copyOf("checkout");

type StoreLite = { id: string; slug: string; name: string; member?: string; city: string; address: string; zip: string; region: string; distanceKm: number; openUntil: string; lat: number; lng: number };
type Pay = "card" | "no-card" | "iris" | "bank" | "cod" | "store" | "apple" | "google" | "revolut" | "paypal" | "klarna" | "tbi";

/** Τρόποι μέσω Viva — ο πελάτης μεταφέρεται στη σελίδα της Viva, ανοιχτή στον τρόπο που διάλεξε. */
const VIVA_OPTS: { v: Pay; icon: typeof Truck; t: string; sub: string; mark?: React.ReactNode }[] = [
  { v: "card", icon: CreditCard, t: "Κάρτα", sub: "Visa · Mastercard · Amex" },
  { v: "apple", icon: CreditCard, t: "Apple Pay", sub: "Με Face ID / Touch ID", mark: <AppleMark className="size-5" /> },
  { v: "google", icon: CreditCard, t: "Google Pay", sub: "Με την κάρτα του Google λογαριασμού σου", mark: <GoogleMark className="size-5" /> },
  { v: "paypal", icon: Wallet2, t: "PayPal", sub: "Με τον λογαριασμό PayPal σου" },
  { v: "iris", icon: Smartphone, t: "IRIS", sub: "Άμεσα από το e-banking, χωρίς προμήθεια" },
  { v: "klarna", icon: Smartphone, t: "Klarna", sub: "Σε 3 άτοκες δόσεις χωρίς κάρτα" },
  { v: "tbi", icon: Smartphone, t: "Δόσεις χωρίς κάρτα", sub: "TBI Bank · έγκριση online σε λίγα λεπτά" },
];
const VIVA_NAME: Record<string, string> = { card: "την κάρτα", apple: "Apple Pay", google: "Google Pay", paypal: "PayPal", iris: "IRIS", klarna: "Klarna", tbi: "την TBI Bank (δόσεις χωρίς κάρτα)" };

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
export function Checkout({ stores, boxnowPartnerId = null, vivaPays = [], klarnaDirect = false, bankSub = null, payOn }: { stores: StoreLite[]; boxnowPartnerId?: string | null; vivaPays?: string[]; klarnaDirect?: boolean; /** οι τράπεζες των λογαριασμών (Ρυθμίσεις → Πληρωμές)· null = η κατάθεση δεν προσφέρεται */ bankSub?: string | null; /** διακόπτες των Πληρωμών για την εφεδρική λίστα (χωρίς Viva)· ό,τι λείπει θεωρείται ανοιχτό */ payOn?: Partial<Record<"apple" | "google" | "revolut" | "iris", boolean>> }) {
  // Viva: οι online τρόποι (κάρτα, Apple/Google Pay, PayPal, IRIS, Klarna) ολοκληρώνονται στη σελίδα της Viva
  const viva = vivaPays.length > 0;
  const payEnabled = (k: "apple" | "google" | "revolut" | "iris") => payOn?.[k] !== false;
  const viaViva = (p: string) => viva && vivaPays.includes(p);
  // Klarna με απευθείας σύμβαση: ο πελάτης μεταφέρεται στη σελίδα της Klarna
  const viaKlarna = (p: string) => klarnaDirect && p === "klarna";
  const KLARNA_OPT = { v: "klarna" as Pay, icon: Smartphone, t: "Klarna", sub: "Σε 3 άτοκες δόσεις, χωρίς πιστωτική κάρτα" };
  const router = useRouter();
  const { lines, subtotal, addonsTotal, hydrated, clear, freeShippingFrom } = useCart();
  const [step, setStep] = useState<2 | 3>(2);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", street: "", number: "", floor: "", city: "", zip: "", region: "Αττική", notes: "", invoice: false, vat: "", company: "", doy: "", activity: "", createAccount: false, password: "", newsletter: false, terms: false, recycle: false });
  const [fulPick, setFul] = useState<Fulfilment>("courier");
  // ο courier (όταν ο διαχειριστής έχει ενεργοποιήσει couriers) και, για BOX NOW, η θυρίδα
  const [carrierPick, setCarrierPick] = useState<string | null>(null);
  const [locker, setLocker] = useState<Locker | null>(null);
  const pickLocker = useCallback((l: Locker) => setLocker(l), []);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  // η επιλογή από τη σελίδα προϊόντος (ή από προηγούμενη επίσκεψη) — το ταμείο δεν ξαναρωτά
  const [keptStore, setKeptStore] = useState(false);
  useEffect(() => {
    const pr = readPickup();
    if (pr?.where !== "store") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- αρχικοποίηση από localStorage μία φορά
    if (pr.storeId && stores.some((s) => s.id === pr.storeId)) { setStoreId(pr.storeId); setKeptStore(true); }
    setFul("click-collect");
  }, [stores]);
  const chooseStore = useCallback((id: string) => { setStoreId(id); savePickup({ where: "store", storeId: id }); }, []);
  const [slot, setSlot] = useState("morning");
  const [pay, setPay] = useState<Pay>("card");
  const [inst, setInst] = useState(1);
  const [sca, setSca] = useState<"idle" | "pending" | "ok">("idle");
  const [vatLookup, setVatLookup] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [coupon, setCoupon] = useState(() => savedCoupon() ?? "");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Ο υπολογισμός είναι του server (τιμές από το SoftOne, προσφορές, κουπόνι, μεταφορικά): ο browser μόνο τον δείχνει
  const [couponCode, setCouponCode] = useState<string | null>(() => savedCoupon());
  const [placing, setPlacing] = useState(false);
  // η διεύθυνση πάει στον υπολογισμό (τιμή ASAP Express) όταν ο πελάτης φεύγει από το πεδίο, όχι σε κάθε πλήκτρο
  const [addrQ, setAddrQ] = useState({ street: "", number: "", city: "" });
  const commitAddr = () => setAddrQ((a) => (a.street === f.street.trim() && a.number === f.number.trim() && a.city === f.city.trim() ? a : { street: f.street.trim(), number: f.number.trim(), city: f.city.trim() }));
  const offline = lines.filter((l) => !l.product.fromDb);
  const { quote, setQuote, loading } = useServerQuote(lines, hydrated, { coupon: couponCode, payment: pay, delivery: fulPick, storeId: fulPick === "click-collect" ? storeId : null, zip: carrierDef(carrierPick)?.kind === "locker" ? locker?.zip ?? null : /^\d{5}$/.test(f.zip) ? f.zip : null, email: f.email || null, carrier: carrierPick, ...addrQ });
  // μεγάλες συσκευές: ο server αποφασίζει (κατηγορία, βάρος, μέγεθος) — χωρίς courier, με ραντεβού ή παραλαβή
  const courierBlocked = !!quote && !quote.bulky.courier;
  // μεταφορική (εσωτερική, για λευκές / ογκώδεις): μόνο αν είναι ανοιχτή στις ρυθμίσεις και φεύγουν όλα έτσι
  const freight = quote?.freight ?? null;
  const freightOk = !!freight?.available;
  const fulBase: Fulfilment = fulPick === "courier" && courierBlocked ? (freightOk ? "freight" : "appointment")
    : fulPick === "freight" && !freightOk ? (courierBlocked ? "appointment" : "courier") : fulPick;
  // Αττική (παράδοση στο σπίτι): μόνο «Κανονική παράδοση euronics» (appointment) ή «ASAP Express» (courier + asap)
  const zipOk = /^\d{5}$/.test(f.zip);
  const attica = fulPick !== "click-collect" && zipOk && !!quote?.attica.attica;
  const xp = attica ? quote!.attica.express : null;
  const expressSel = attica && fulPick === "courier" && carrierPick === "asap" && (xp?.state === "ok" || xp?.state === "pending");
  const ful: Fulfilment = attica ? (expressSel ? "courier" : "appointment") : fulBase;
  const offers = quote?.carriers ?? [];
  // η επιλογή φαίνεται αμέσως· το κόστος το επιβεβαιώνει ο server (quote.carrier)
  const offer = offers.find((o) => o.id === carrierPick && o.available) ?? offers.find((o) => o.id === quote?.carrier) ?? null;
  const toLocker = !attica && ful === "courier" && offer?.kind === "locker";
  // συνδεδεμένος πελάτης (και μετά από σύνδεση με Google / Microsoft / Facebook / Apple): συμπλήρωση στοιχείων
  useEffect(() => {
    let on = true;
    fetch("/api/account/me").then((r) => r.json()).then((m: { authenticated?: boolean; firstName?: string; lastName?: string; email?: string; mobile?: string | null }) => {
      if (!on || !m.authenticated) return;
      setF((x) => ({ ...x, firstName: x.firstName || m.firstName || "", lastName: x.lastName || m.lastName || "", email: x.email || m.email || "", phone: x.phone || m.mobile || "" }));
      setSignedIn(m.firstName ?? m.email ?? "μέλος");
    }).catch(() => null);
    return () => { on = false; };
  }, []);
  const couponMsg = couponCode ? (loading && !quote?.coupon.message ? "Έλεγχος κωδικού…" : quote?.coupon.message ?? null) : null;

  // έναρξη ταμείου: μία φορά, μόλις διαβαστεί το καλάθι
  useEffect(() => {
    if (hydrated && lines.length) track("begin_checkout", { value: subtotal + addonsTotal, items: lines.map((l) => ({ id: l.product.id, name: l.product.title, brand: l.product.brand, price: l.product.price, qty: l.qty })) });
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  const localGoods = subtotal + addonsTotal;
  const goods = quote ? (quote.goods + quote.addons) / 100 : localGoods;
  const discPrice = quote ? quote.discPrice / 100 : 0;
  const discCoupon = quote ? quote.discCoupon / 100 : 0;
  const discPayment = quote ? quote.discPayment / 100 : 0;
  const discount = discPrice + discCoupon + discPayment;
  const heavy = quote ? !quote.bulky.courier : lines.some((l) => l.product.installation);
  const shipping = quote ? quote.shipping / 100 : ful !== "courier" ? 0 : localGoods >= freeShippingFrom ? 0 : 4.9;
  const codFee = quote ? quote.codFee / 100 : pay === "cod" ? 2 : 0;
  const total = quote ? quote.total / 100 : Math.max(0, localGoods) + shipping + codFee;
  const maxInst = total >= 800 ? 24 : total >= 400 ? 12 : total >= 200 ? 6 : total >= 100 ? 3 : 1;
  const store = stores.find((s) => s.id === storeId);
  const eta = ful === "click-collect" ? "Θα λάβεις SMS όταν είναι έτοιμη για παραλαβή" : expressSel ? "ASAP Express · 1–2 ημέρες" : attica ? `Κανονική παράδοση euronics · ${quote!.attica.standard.eta}` : ful === "appointment" ? "Με ραντεβού · σε καλούμε για ημέρα και ώρα" : ful === "freight" ? `${freight?.local ? "Από κατάστημα Euronics κοντά σου" : "Μεταφορική"} · ${freight?.eta ?? ""}` : offer ? `${offer.name} · ${offer.eta}` : "Παράδοση σε 1–3 εργάσιμες";

  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = "Συμπλήρωσε το όνομά σου";
    if (!f.lastName.trim()) e.lastName = "Συμπλήρωσε το επώνυμό σου";
    if (!/\S+@\S+\.\S+/.test(f.email)) e.email = "Έγκυρο email, π.χ. maria@example.gr";
    if (!/^\d{10}$/.test(f.phone.replace(/\s/g, ""))) e.phone = "10 ψηφία, π.χ. 6912345678";
    if (toLocker) { if (!locker?.id) e.locker = "Διάλεξε θυρίδα BOX NOW"; }
    else if (ful !== "click-collect") {
      if (!f.street.trim()) e.street = "Οδός";
      if (!f.number.trim()) e.number = "Αριθμός";
      if (!f.city.trim()) e.city = "Πόλη";
      if (!/^\d{5}$/.test(f.zip)) e.zip = "5 ψηφία";
    }
    if (expressSel && xp?.state !== "ok") e.express = "Περίμενε λίγο: υπολογίζουμε την τιμή του ASAP Express";
    if (f.invoice && !/^\d{9}$/.test(f.vat)) e.vat = "Ο ΑΦΜ έχει 9 ψηφία";
    return e;
  }, [f, ful, toLocker, locker, expressSel, xp]);
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
    setCouponCode(c || null);
    saveCoupon(c || null);
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
    if (placing) return;
    if (!f.terms) return setErr("Πρέπει να αποδεχτείς τους όρους χρήσης για να συνεχίσεις.");
    if (offline.length) return setErr(`Το «${offline[0].product.title}» δεν διατίθεται για online αγορά. Αφαίρεσέ το από το καλάθι για να συνεχίσεις.`);
    setErr(null);
    if (viaViva(pay) || viaKlarna(pay)) return finish();
    if (pay === "apple" || pay === "google" || pay === "revolut") return setWallet(pay);
    if (pay === "card" || pay === "no-card") {
      setSca("pending");
      setTimeout(() => {
        setSca("ok");
        finish();
      }, 1800);
    } else finish();
  };
  const finish = async () => {
    setPlacing(true); setErr(null);
    try {
      const r = await fetch("/api/checkout/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        contact: { firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone },
        address: ful === "click-collect" ? {} : { street: f.street, number: f.number, floor: f.floor, city: f.city, zip: f.zip, region: f.region, notes: f.notes },
        invoice: f.invoice ? { vatNumber: f.vat, company: f.company, doy: f.doy, activity: f.activity } : null,
        fulfilment: ful, storeId: ful === "click-collect" ? storeId : null, payment: pay, instalments: inst,
        carrier: expressSel ? "asap" : ful === "courier" ? offer?.id ?? null : null, locker: toLocker ? locker : null,
        coupon: couponCode, terms: f.terms, newsletter: f.newsletter, expectedTotal: quote?.total,
      }) });
      const j = (await r.json()) as { ok: boolean; number?: string; error?: string; quote?: ServerQuote; redirect?: string; nextCoupon?: { code: string; value: string; until: string | null } | null };
      if (!j.ok || !j.number) { if (j.quote) setQuote(j.quote); setSca("idle"); return setErr(j.error ?? "Η παραγγελία δεν ολοκληρώθηκε. Δοκίμασε ξανά."); }
      const order = { number: j.number, date: new Date().toISOString(), lines: lines.map((l) => ({ id: l.product.id, title: l.product.title, brand: l.product.brand, image: l.product.image, qty: l.qty, unitPrice: l.product.price, addons: l.addons, variant: l.variant })), total, shipping, goods, discount, pay, inst, ful, store: store ? `${store.name} — ${store.address}, ${store.city}` : null, slot, attica: attica ? (expressSel ? "express" : "standard") : null, eta, address: { ...f, password: "" }, recycle: f.recycle, nextCoupon: j.nextCoupon ?? null };
      try { localStorage.setItem("euronics.lastOrder", JSON.stringify(order)); } catch {}
      clear();
      saveCoupon(null);
      // Viva: η πληρωμή ολοκληρώνεται στη σελίδα της· επιστρέφει στο /api/payments/viva/success|failure
      if (j.redirect) { window.location.assign(j.redirect); return; }
      router.push(`/checkout/epityxia?no=${j.number}`);
    } catch { setSca("idle"); setErr("Σφάλμα δικτύου. Η παραγγελία δεν ολοκληρώθηκε."); } finally { setPlacing(false); }
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
  const text = (k: keyof typeof f, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={`fld-${k}`} value={f[k] as string} onChange={(e) => set(k, e.target.value)} onBlur={() => { touch(k); if (k === "street" || k === "number" || k === "city" || k === "zip") commitAddr(); }} className={inputCls(k)} {...extra} />;

  // τρόποι αποστολής για παράδοση στο σπίτι (εκτός Αττικής· στην Αττική βλ. «attica»)
  type ShipOpt = { key: string; icon: typeof Truck; t: string; sub: string; price: string; on: boolean; disabled?: boolean; pick: () => void };
  const free = (n: number) => (n === 0 ? "Δωρεάν" : priceLong(n / 100));
  const shipOpts: ShipOpt[] = [
    ...(offers.length
      ? offers.map((o): ShipOpt => ({ key: o.id, icon: Truck, t: `${o.name}${o.kind === "locker" ? " · σε θυρίδα" : ""}`, sub: courierBlocked ? "Δεν αποστέλλεται με courier" : o.reason ?? o.eta, price: courierBlocked || !o.available ? "—" : free(o.fee), on: ful === "courier" && offer?.id === o.id, disabled: courierBlocked || !o.available, pick: () => { setFul("courier"); setCarrierPick(o.id); } }))
      : [{ key: "courier", icon: Truck, t: "Με courier", sub: courierBlocked ? "Δεν αποστέλλεται με courier" : "1–3 εργάσιμες", price: courierBlocked ? "—" : goods >= freeShippingFrom ? "Δωρεάν" : "4,90 €", on: ful === "courier", disabled: courierBlocked, pick: () => setFul("courier") }]),
    ...(freight ? [{ key: "freight", icon: Container, t: freight.local ? "Από κατάστημα Euronics κοντά σου" : "Με μεταφορική", sub: freightOk ? `${freight.eta} · ${freight.local ? "σου το φέρνει συνεργάτης μας της περιοχής σου" : "για ογκώδεις συσκευές"}` : freight.reason ?? "Δεν είναι διαθέσιμη για αυτό το καλάθι", price: freightOk ? free(freight.fee) : "—", on: ful === "freight", disabled: !freightOk, pick: () => setFul("freight") }] : []),
    { key: "appointment", icon: CalendarClock, t: "Με ραντεβού", sub: heavy ? "Με εγκατάσταση από τεχνικό του καταστήματος" : "Σε καλούμε για ημέρα και ώρα", price: "Δωρεάν", on: ful === "appointment", pick: () => setFul("appointment") },
  ];
  const payments: { v: Pay; icon: typeof Truck; t: string; sub: string; disabled?: boolean; mark?: React.ReactNode }[] = viva ? [
    ...VIVA_OPTS.filter((o) => vivaPays.includes(o.v)).map((o) => (o.v === "card" ? { ...o, sub: `Visa · Mastercard · Amex${maxInst > 1 ? ` · έως ${maxInst} άτοκες` : ""}` } : o)),
    ...(klarnaDirect ? [KLARNA_OPT] : []),
    ...(bankSub ? [{ v: "bank" as Pay, icon: Landmark, t: "Κατάθεση σε τράπεζα", sub: bankSub }] : []),
    { v: "cod", icon: Banknote, t: "Αντικαταβολή", sub: total <= 500 ? "Μετρητά ή κάρτα στον διανομέα · +2,00 €" : "Διαθέσιμη έως 500 €", disabled: total > 500 },
    ...(ful === "click-collect" ? [{ v: "store" as Pay, icon: StoreIcon, t: "Στο κατάστημα", sub: "Μετρητά ή κάρτα κατά την παραλαβή" }] : []),
  ] : [
    { v: "card", icon: CreditCard, t: "Κάρτα", sub: `Visa · Mastercard · Amex${maxInst > 1 ? ` · έως ${maxInst} άτοκες` : ""}` },
    ...(payEnabled("apple") ? [{ v: "apple" as Pay, icon: CreditCard, t: "Apple Pay", sub: "Με Face ID / Touch ID, χωρίς πληκτρολόγηση", mark: <AppleMark className="size-5" /> }] : []),
    ...(payEnabled("google") ? [{ v: "google" as Pay, icon: CreditCard, t: "Google Pay", sub: "Με την κάρτα του Google λογαριασμού σου", mark: <GoogleMark className="size-5" /> }] : []),
    ...(payEnabled("revolut") ? [{ v: "revolut" as Pay, icon: CreditCard, t: "Revolut Pay", sub: "Επιβεβαίωση στην εφαρμογή Revolut, χωρίς προμήθεια", mark: <RevolutMark className="h-4" /> }] : []),
    { v: "no-card", icon: Smartphone, t: "Δόσεις χωρίς κάρτα", sub: total >= 200 && total <= 2000 ? `Eurobank · έως 24 × ${priceLong(instalment(total, 24))}` : "Για αγορές 200–2.000 €", disabled: total < 200 || total > 2000 },
    ...(payEnabled("iris") ? [{ v: "iris" as Pay, icon: Smartphone, t: "IRIS", sub: "Άμεσα από το mobile banking, χωρίς προμήθεια" }] : []),
    ...(klarnaDirect ? [KLARNA_OPT] : []),
    ...(bankSub ? [{ v: "bank" as Pay, icon: Landmark, t: "Κατάθεση σε τράπεζα", sub: bankSub }] : []),
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
                {viva ? (
                  <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
                    {(["apple", "google", "paypal", "iris"] as Pay[]).filter((m) => vivaPays.includes(m)).map((m) => (
                      <button key={m} type="button" onClick={() => { setPay(m); document.getElementById("fld-firstName")?.focus(); }} aria-label={`Πληρωμή με ${VIVA_NAME[m]}`}
                        className={`rounded-full font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 ${m === "google" ? "bg-white text-eu-ink border-2 border-eu-line hover:border-eu-blue" : m === "iris" ? "bg-eu-blue text-white hover:bg-eu-blue-dark" : m === "paypal" ? "bg-[#ffc439] text-[#003087] hover:brightness-95" : "bg-black text-white hover:bg-black/85"}`}>
                        {m === "apple" ? <><AppleMark className="size-5" /> Pay</> : m === "google" ? <><GoogleMark className="size-5" /> Pay</> : m === "paypal" ? "PayPal" : "IRIS"}
                      </button>
                    ))}
                  </div>
                ) : (
                <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
                    {payEnabled("apple") && <button type="button" onClick={() => setWallet("apple")} aria-label={c.pliromi_me_apple_pay} className="rounded-full bg-black text-white font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:bg-black/85">
                      <AppleMark className="size-5" /> Pay
                    </button>}
                    {payEnabled("google") && <button type="button" onClick={() => setWallet("google")} aria-label={c.pliromi_me_google_pay} className="rounded-full bg-white text-eu-ink border-2 border-eu-line font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:border-eu-blue">
                      <GoogleMark className="size-5" /> Pay
                    </button>}
                    {payEnabled("revolut") && <button type="button" onClick={() => setWallet("revolut")} aria-label={c.pliromi_me_revolut_pay} className="rounded-full bg-black text-white font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-1.5 hover:bg-black/85">
                      <RevolutMark className="h-4" /> Pay
                    </button>}
                    {payEnabled("iris") && <button type="button" onClick={() => setPay("iris")} className="rounded-full bg-eu-blue text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue-dark">
                      IRIS
                    </button>}
                  </div>
                )}
                <div className="flex items-center gap-3 text-eu-muted text-[length:var(--fs-14)]">
                  <span className="flex-1 h-px bg-eu-line" /> {c.i_symplirose_ta_stoicheia} <span className="flex-1 h-px bg-eu-line" />
                </div>
              </section>

              <Section n={1} title={c.stoicheia_epikoinonias} lead="Εδώ στέλνουμε την επιβεβαίωση και το SMS παράδοσης.">
                {signedIn ? (
                  <p className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-15)] px-4 py-3 inline-flex items-center gap-2">
                    <Check className="size-4" aria-hidden /> Συνδέθηκες ως {signedIn}. Τα στοιχεία σου συμπληρώθηκαν.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <div className="text-eu-ink-3 text-[length:var(--fs-14)] font-semibold">{c.syndesi_gia_aytomati_symplirosi}</div>
                    <SocialLogin next="/checkout" />
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
                <div role="radiogroup" aria-label="Πού θέλεις την παραγγελία" className="grid grid-cols-2 gap-2.5">
                  {([["home", Home, "Στο σπίτι", "Στη διεύθυνσή σου"], ["store", StoreIcon, "Από κατάστημα", "Click & Collect · Δωρεάν"]] as const).map(([v, Icon, t, sub]) => {
                    const on = (v === "store") === (fulPick === "click-collect");
                    return (
                      <label key={v} className={`rounded-xl border-2 p-3 @sm:p-4 grid gap-1 cursor-pointer transition-colors ${on ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                        <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-16)] leading-tight">
                          <input type="radio" name="where" checked={on} onChange={() => { setFul(v === "store" ? "click-collect" : "courier"); savePickup({ where: v === "store" ? "store" : "home", storeId }); }} className="accent-eu-blue size-[18px] shrink-0" />
                          <Icon className="size-5 text-eu-blue shrink-0 hidden @sm:block" aria-hidden /> {t}
                        </span>
                        <span className="@sm:pl-7 text-eu-muted text-[length:var(--fs-14)] leading-snug">{sub}</span>
                      </label>
                    );
                  })}
                </div>

                {ful === "click-collect" ? (
                  <div className="grid gap-3 rounded-xl bg-eu-surface p-4">
                    <span className="text-[length:var(--fs-15)] font-bold text-eu-ink">{c.katastima_paralavis}</span>
                    <PickupStorePicker stores={stores} value={storeId} onChange={chooseStore} keep={keptStore} hoursLabel="ωράριο & χάρτης"
                      stockLine={() => <span>Δωρεάν παραλαβή· θα λάβεις SMS όταν η παραγγελία είναι έτοιμη</span>} />
                  </div>
                ) : (
                  <>
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

                    <fieldset className="m-0 p-0 border-0 grid gap-2" aria-describedby="ship-status">
                      <legend className="mb-2 font-bold text-eu-ink text-[length:var(--fs-16)]">Τρόπος αποστολής</legend>
                      {!zipOk ? (
                        <p className="m-0 rounded-xl border-2 border-dashed border-eu-line px-4 py-3 text-eu-muted text-[length:var(--fs-15)]">Συμπλήρωσε τον Τ.Κ. για να δεις τους τρόπους αποστολής και το κόστος τους.</p>
                      ) : !quote ? (
                        <div className="h-[4.5rem] rounded-xl bg-eu-surface animate-pulse motion-reduce:animate-none" aria-hidden />
                      ) : attica ? (
                        <>
                          <ShipRow on={!expressSel} onPick={() => setFul("appointment")} icon={Truck} title="Κανονική παράδοση euronics" sub={quote.attica.standard.eta} price="Δωρεάν" />
                          {xp && (
                            <ShipRow on={expressSel} disabled={xp.state === "need-address"} onPick={() => { setFul("courier"); setCarrierPick("asap"); }} icon={Zap} title="ASAP Express"
                              sub={xp.state === "need-address" ? "Συμπλήρωσε οδό, αριθμό και πόλη για να υπολογιστεί η τιμή" : "1–2 ημέρες · με courier ASAP"}
                              price={xp.state === "ok" ? free(xp.fee) : xp.state === "pending" ? <span className="inline-flex items-center gap-1.5 text-eu-muted font-semibold"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Υπολογισμός…</span> : "—"} />
                          )}
                          <p id="ship-status" role="status" className="m-0 text-[length:var(--fs-14)] text-eu-muted">
                            {carrierPick === "asap" && fulPick === "courier" && !xp ? "Το ASAP Express δεν είναι διαθέσιμο για αυτή τη διεύθυνση ή το καλάθι· ισχύει η κανονική παράδοση." : xp?.state === "pending" ? "Υπολογίζουμε την τιμή του ASAP Express για τη διεύθυνσή σου." : ""}
                          </p>
                          {touched.express && errors.express && <span className="text-eu-red font-semibold text-[length:var(--fs-14)]" id="fld-express">{errors.express}</span>}
                        </>
                      ) : (
                        <>
                          {shipOpts.map((o) => <ShipRow key={o.key} on={o.on} disabled={o.disabled} onPick={o.pick} icon={o.icon} title={o.t} sub={o.sub} price={o.price} />)}
                          {courierBlocked && (
                            <p role="status" className="m-0 rounded-xl bg-eu-amber/15 px-4 py-3 text-eu-ink-2 text-[length:var(--fs-15)]">
                              <b className="text-eu-ink">{quote.bulky.titles.length === 1 ? quote.bulky.titles[0] : `${quote.bulky.titles.length} προϊόντα του καλαθιού`}</b>{quote.bulky.titles.length === 1 ? " δεν αποστέλλεται" : " δεν αποστέλλονται"} με courier ({quote.bulky.reason?.split(":")[0].toLowerCase()}). {freightOk ? "Διάλεξε μεταφορική ή ραντεβού" : "Διάλεξε παράδοση με ραντεβού"}, ή παραλαβή από κατάστημα.
                            </p>
                          )}
                        </>
                      )}
                    </fieldset>
                    {!attica && offers.some((o) => o.kind === "locker") && (
                      <div hidden={!toLocker} id="fld-locker">
                        <BoxNowPicker partnerId={boxnowPartnerId} zip={zipOk ? f.zip : undefined} value={locker} onSelect={pickLocker} />
                        {touched.locker && errors.locker && <span className="text-eu-red font-semibold text-[length:var(--fs-14)]">{errors.locker}</span>}
                      </div>
                    )}
                    {!attica && ful === "appointment" && (
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
                  </>
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
                <Done label="Παράδοση" value={ful === "click-collect" && store ? `Παραλαβή από ${store.name}, ${store.city} · δωρεάν, θα λάβεις SMS όταν είναι έτοιμη` : toLocker && locker ? `Θυρίδα BOX NOW: ${[locker.name, locker.address, locker.zip].filter(Boolean).join(", ")} · ${eta}` : `${f.street} ${f.number}${f.floor ? `, ${f.floor}` : ""}, ${f.zip} ${f.city} · ${eta}`} onEdit={() => setStep(2)} />
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

                {viaKlarna(pay) && (
                  <div className="grid gap-3 rounded-xl bg-eu-surface p-4 @md:p-5 text-[length:var(--fs-15)] text-eu-ink-2">
                    <p className="m-0 flex items-start gap-2"><ExternalLink className="size-5 text-eu-blue shrink-0" aria-hidden /> <span>Θα μεταφερθείς στη σελίδα της <b className="text-eu-ink">Klarna</b>: εγκρίνεσαι σε λίγα δευτερόλεπτα και πληρώνεις σε 3 άτοκες δόσεις.</span></p>
                    <p className="m-0 text-eu-muted text-[length:var(--fs-14)] flex items-start gap-2"><ShieldCheck className="size-5 text-eu-green shrink-0" aria-hidden /> Τα στοιχεία πληρωμής δεν περνούν από εμάς.</p>
                  </div>
                )}
                {viaViva(pay) && (
                  <div className="grid gap-3 rounded-xl bg-eu-surface p-4 @md:p-5 text-[length:var(--fs-15)] text-eu-ink-2">
                    <p className="m-0 flex items-start gap-2"><ExternalLink className="size-5 text-eu-blue shrink-0" aria-hidden /> <span>Θα μεταφερθείς στην ασφαλή σελίδα πληρωμής της <b className="text-eu-ink">Viva</b> για να πληρώσεις με {VIVA_NAME[pay]}. Αν έχεις πληρώσει με Viva σε άλλο κατάστημα, θα δεις εκεί τις αποθηκευμένες κάρτες σου.</span></p>
                    {pay === "card" && maxInst > 1 && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Τις άτοκες δόσεις (έως {maxInst}) τις διαλέγεις στη σελίδα της Viva.</p>}
                    <p className="m-0 text-eu-muted text-[length:var(--fs-14)] flex items-start gap-2"><ShieldCheck className="size-5 text-eu-green shrink-0" aria-hidden /> Τα στοιχεία πληρωμής δεν περνούν από εμάς.</p>
                  </div>
                )}
                {pay === "card" && !viva && (
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
                {pay === "iris" && !viva && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.tha_anoixei_to_mobile}</p>}
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
                <button type="button" onClick={submit} disabled={sca === "pending" || placing} className="hidden @3xl:inline-flex rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] px-8 min-h-14 items-center hover:bg-eu-yellow-dark disabled:opacity-60">
                  {placing ? "Καταχώρηση παραγγελίας…" : sca === "pending" ? "Επιβεβαίωση πληρωμής…" : `Πληρωμή ${priceLong(total)} & ολοκλήρωση`}
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
                  {(quoteLineOf(quote, l.product.id)?.labels ?? []).filter((t, i, all) => all.indexOf(t) === i).map((t) => (
                    <div key={t} className="text-eu-red font-bold text-[length:var(--fs-14)] flex items-center gap-1">
                      <Tag className="size-3.5" aria-hidden /> {t}
                    </div>
                  ))}
                  {(quoteLineOf(quote, l.product.id)?.addons ?? l.addons.map((a) => ({ slug: a.slug, title: a.title, price: a.price * 100, value: a.price * 100, free: undefined }))).map((a) => (
                    <div key={a.slug} className={`${a.free ? "text-eu-green" : "text-eu-blue"} text-[length:var(--fs-14)] flex items-center gap-1`}>
                      <Check className="size-3.5" aria-hidden /> {a.title} · {a.price ? priceLong(a.price / 100) : a.free ? <>δωρεάν <s className="text-eu-muted-2">{priceLong(a.value / 100)}</s></> : "δωρεάν"}
                    </div>
                  ))}
                </div>
                <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)] shrink-0">{(() => { const ql = quoteLineOf(quote, l.product.id); return priceLong(ql ? (ql.total + ql.addons.reduce((n, a) => n + a.price, 0) * ql.qty) / 100 : l.qty * (l.product.price + l.addons.reduce((n, a) => n + a.price, 0))); })()}</div>
              </li>
            ))}
          </ul>
          <div className="p-5 grid gap-4 border-t border-eu-line">
            <GiftLines quote={quote} compact />
            <PromoHints quote={quote} />
            <FreeShippingNote quote={quote} />
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
              {couponMsg && <p role="status" className={`m-0 text-[length:var(--fs-14)] font-semibold ${quote?.coupon.applied ? "text-eu-green" : loading ? "text-eu-muted" : "text-eu-red"}`}>{couponMsg}</p>}
              {offline.length > 0 && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-semibold px-3 py-2 text-[length:var(--fs-14)]">{offline.map((l) => `«${l.product.title}»`).join(", ")} {offline.length === 1 ? "δεν διατίθεται" : "δεν διατίθενται"} για online αγορά και δεν μετρά στο σύνολο. Αφαίρεσέ {offline.length === 1 ? "το" : "τα"} για να ολοκληρώσεις.</p>}
            </form>
            <dl className="m-0 grid gap-2 text-[length:var(--fs-15)] text-eu-ink-2">
              <Row k="Προϊόντα & υπηρεσίες" v={priceLong(goods)} />
              {discPrice > 0 && <Row k="Προσφορές" v={`− ${priceLong(discPrice)}`} cls="text-eu-green" />}
              {discCoupon > 0 && <Row k={`Κουπόνι ${quote?.coupon.applied ?? ""}`} v={`− ${priceLong(discCoupon)}`} cls="text-eu-green" />}
              {discPayment > 0 && <Row k={quote?.payment?.label ?? "Έκπτωση πληρωμής"} v={`− ${priceLong(discPayment)}`} cls="text-eu-green" />}
              {(quote?.gifts.length ?? 0) > 0 && <Row k={quote!.gifts.length === 1 ? "Δώρο" : `Δώρα (${quote!.gifts.length})`} v="0,00 €" cls="text-eu-green" />}
              <Row k={expressSel ? "Μεταφορικά · ASAP Express" : attica ? "Κανονική παράδοση euronics" : ful === "courier" ? (offer ? `Μεταφορικά · ${offer.name}` : "Μεταφορικά") : ful === "freight" ? "Μεταφορική" : ful === "click-collect" ? "Παραλαβή από κατάστημα" : "Παράδοση με ραντεβού"} v={expressSel && xp?.state !== "ok" ? "Υπολογισμός…" : shipping === 0 ? "Δωρεάν" : priceLong(shipping)} cls={shipping === 0 && !expressSel ? "text-eu-green" : ""} />
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
              <button type="button" onClick={submit} disabled={sca === "pending" || placing} className="hidden @3xl:block rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] py-4 min-h-14 hover:bg-eu-yellow-dark disabled:opacity-60">
                {placing ? "Καταχώρηση παραγγελίας…" : sca === "pending" ? "Επιβεβαίωση πληρωμής…" : `Πληρωμή ${priceLong(total)} & ολοκλήρωση`}
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
          <button type="button" onClick={submit} disabled={sca === "pending" || placing} className="flex-1 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] min-h-14 disabled:opacity-60">
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

/** Ένας τρόπος αποστολής: όλη η γραμμή πατιέται (≥ 56px), τιμή δεξιά. */
function ShipRow({ on, disabled, onPick, icon: Icon, title, sub, price }: { on: boolean; disabled?: boolean; onPick: () => void; icon: typeof Truck; title: string; sub: string; price: ReactNode }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 min-h-14 transition-colors ${disabled ? "border-eu-line opacity-60 cursor-not-allowed" : on ? "border-eu-blue bg-eu-chip cursor-pointer" : "border-eu-line hover:border-eu-blue cursor-pointer"}`}>
      <input type="radio" name="ship" checked={on && !disabled} disabled={disabled} onChange={onPick} className="accent-eu-blue size-[18px] shrink-0" />
      <Icon className="size-5 text-eu-blue shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-eu-ink text-[length:var(--fs-16)]">{title}</span>
        <span className="block text-eu-muted text-[length:var(--fs-14)]">{sub}</span>
      </span>
      <span className={`shrink-0 font-extrabold text-[length:var(--fs-15)] tabular-nums ${price === "Δωρεάν" ? "text-eu-green" : "text-eu-ink"}`}>{price}</span>
    </label>
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
