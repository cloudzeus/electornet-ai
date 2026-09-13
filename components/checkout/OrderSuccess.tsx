"use client";


import { tpl } from "@/lib/cms/settings";
import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { priceLong } from "@/lib/format";
import { Stepper } from "./Stepper";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("orderSuccess");

interface Saved {
  number: string;
  total: number;
  goods: number;
  shipping: number;
  pay: string;
  inst: number;
  ful: string;
  store: string | null;
  slot: string;
  lines: { id: string; title: string; brand: string; qty: number; unitPrice: number; addons: { title: string; price: number }[] }[];
  address: { firstName: string; lastName: string; email: string; phone: string; street: string; number: string; city: string; zip: string; invoice: boolean; company: string; vat: string };
  recycle: boolean;
}

const PAY: Record<string, string> = { card: "Κάρτα", "no-card": "Δόσεις χωρίς κάρτα (Eurobank)", iris: "IRIS", bank: "Κατάθεση σε τράπεζα", cod: "Αντικαταβολή", store: "Πληρωμή στο κατάστημα" };

/** Confirmation: number, what happens next, summary, tracking link, account prompt. */
export function OrderSuccess({ number }: { number: string }) {
  const { advisor } = useSettings();
  const [o, setO] = useState<Saved | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("euronics.lastOrder");
        if (raw) setO(JSON.parse(raw));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="eu-canvas eu-gutter pb-12">
      <Stepper step={4} />
      <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="grid gap-5">
          <section className="bg-eu-green/10 border border-eu-green/30 rounded-xl p-6 grid gap-4">
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="size-10 text-eu-green shrink-0" aria-hidden />
              <div>
                <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{c.eycharistoyme_i_paraggelia_soy}</h1>
                <p className="m-0 mt-1 text-eu-ink-2 text-[length:var(--fs-16)]">
                  {c.arithmos_paraggelias} <strong className="font-extrabold text-eu-ink">{number}</strong>. Στείλαμε επιβεβαίωση στο {o?.address.email ?? "email σου"}.
                </p>
              </div>
            </div>
            {/* Ερμής: a quiet thank-you, no confetti */}
            <div className="flex items-center gap-3 rounded-xl bg-white/70 border border-eu-green/20 px-4 py-3 text-[length:var(--fs-15)] text-eu-ink-2">
              <span className="relative size-10 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-eu-yellow/50">
                <Image src={advisor.avatarHead} alt="" fill sizes="40px" className="object-cover scale-[1.15] translate-y-[6%]" />
              </span>
              <span>
                <span className="font-extrabold text-eu-navy">Ο {advisor.name}:</span> {tpl(advisor.thankYou, { name: o?.address.firstName ? `, ${o.address.firstName}` : "" })}
              </span>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-eu-line p-5">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] mb-3">{c.ti_ginetai_tora}</h2>
            <ol className="m-0 pl-5 grid gap-2 text-eu-ink-2 text-[length:var(--fs-15)]">
              {o?.pay === "bank" && <li>{c.katethese_to_poso_entos}</li>}
              {o?.pay === "no-card" && <li>{c.oloklirose_tin_aitisi_sto}</li>}
              {o?.ful === "click-collect" ? (
                <>
                  <li>Το κατάστημα {o.store} ετοιμάζει την παραγγελία. Θα λάβεις SMS όταν είναι έτοιμη (σε 2 ώρες αν υπάρχει απόθεμα).</li>
                  <li>{c.paralamvaneis_me_ton_arithmo}</li>
                </>
              ) : o?.ful === "appointment" ? (
                <>
                  <li>Ο τεχνικός του καταστήματος της περιοχής σου θα σε καλέσει εντός 24 ωρών για να κλείσετε ραντεβού ({o.slot === "morning" ? "πρωί" : o.slot === "noon" ? "μεσημέρι" : "απόγευμα"}).</li>
                  <li>Παράδοση, εγκατάσταση και έλεγχος λειτουργίας την ημέρα του ραντεβού.{o.recycle ? " Παραλαμβάνουμε και την παλιά συσκευή για ανακύκλωση." : ""}</li>
                </>
              ) : (
                <>
                  <li>{c.i_paraggelia_etoimazetai_kai}</li>
                  <li>{c.tha_laveis_sms_me}</li>
                </>
              )}
              <li>
                Παρακολούθησε την πορεία στη σελίδα{" "}
                <Link href={`/entopismos?no=${number}`} className="text-eu-blue underline">
                  {c.parakoloythisi_paraggelias}
                </Link>
                .
              </li>
            </ol>
          </section>

          {o && (
            <section className="bg-white rounded-xl border border-eu-line p-5">
              <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] mb-3">{c.stoicheia_paraggelias}</h2>
              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4 text-[length:var(--fs-15)] text-eu-ink-2">
                <div>
                  <div className="font-extrabold text-eu-ink text-[length:var(--fs-13-5)] tracking-wide mb-1">{c.paradosi}</div>
                  {o.ful === "click-collect" ? <p className="m-0">Παραλαβή από κατάστημα: {o.store}</p> : <p className="m-0">{o.address.firstName} {o.address.lastName}<br />{o.address.street} {o.address.number}, {o.address.zip} {o.address.city}<br />{o.address.phone}</p>}
                </div>
                <div>
                  <div className="font-extrabold text-eu-ink text-[length:var(--fs-13-5)] tracking-wide mb-1">{c.pliromi}</div>
                  <p className="m-0">
                    {PAY[o.pay]}
                    {o.inst > 1 ? ` · ${o.inst} άτοκες δόσεις` : ""}
                    {o.address.invoice ? <><br />Τιμολόγιο: {o.address.company} · ΑΦΜ {o.address.vat}</> : <><br />{c.apodeixi_lianikis}</>}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="bg-eu-navy text-white rounded-xl p-5 grid @sm:grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide mb-1">{c.logariasmos}</div>
              <div className="font-bold text-[length:var(--fs-16)]">{c.des_paraggelies_eggyiseis_kai}</div>
            </div>
            <Link href="/eggrafi" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 inline-flex items-center justify-center hover:bg-eu-yellow-dark">
              {c.dimioyrgia_logariasmoy}
            </Link>
          </section>
        </div>

        <aside className="bg-eu-surface rounded-xl p-5 grid gap-2 text-[length:var(--fs-15)]">
          <h2 className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-16)]">{c.synopsi}</h2>
          {o ? (
            <>
              <ul className="m-0 p-0 list-none grid gap-1.5 text-eu-ink-2">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>
                      {l.qty} × {l.title}
                      {l.addons.map((a) => (
                        <span key={a.title} className="block text-eu-blue text-[length:var(--fs-13-5)]">
                          + {a.title}
                        </span>
                      ))}
                    </span>
                    <span className="font-semibold shrink-0">{priceLong(l.qty * (l.unitPrice + l.addons.reduce((n, a) => n + a.price, 0)))}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-eu-line pt-2 text-eu-ink-2">
                <span>{c.metaforika}</span>
                <span>{o.shipping === 0 ? "Δωρεάν" : priceLong(o.shipping)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-eu-ink text-[length:var(--fs-16)]">
                <span>{c.synolo}</span>
                <span>{priceLong(o.total)}</span>
              </div>
            </>
          ) : (
            <p className="m-0 text-eu-muted">{c.i_synopsi_einai_diathesimi}</p>
          )}
          <Link href="/" className="mt-2 rounded-full border-2 border-eu-navy text-eu-navy text-center font-extrabold text-[length:var(--fs-15)] py-2.5 min-h-11 inline-flex items-center justify-center hover:bg-white">
            {c.piso_stin_archiki}
          </Link>
        </aside>
      </div>
    </div>
  );
}
