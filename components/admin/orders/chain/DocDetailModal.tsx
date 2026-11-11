"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Ban, CheckCircle2, MapPin, MessageSquare, Package, Printer, User, X } from "lucide-react";
import { docDetailAction } from "@/app/admin/(shell)/softone/actions";
import type { DocDetail } from "@/lib/softone/doc-detail";
import type { OrderChainNode } from "@/lib/softone/order-chain";
import { dmy, money, titleOf } from "./meta";

type Res = Awaited<ReturnType<typeof docDetailAction>>;
const dt = (v: string) => (v ? `${dmy(v)} ${v.slice(11, 16)}`.trim() : "—");
const qty = (n: number) => n.toLocaleString("el-GR", { maximumFractionDigits: 3 });

/** «Όλα τα στοιχεία» ενός παραστατικού του SoftOne σε παράθυρο: κεφαλίδα, πελάτης, παράδοση, γραμμές, σχόλια. Μόνο ανάγνωση. */
export function DocDetailModal({ findoc, title, nodes, onClose, onSelect }: { findoc: number; title: string; nodes: OrderChainNode[]; onClose: () => void; onSelect: (f: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    const d = ref.current; if (d && !d.open) d.showModal();
    const html = document.documentElement, prev = html.style.overflow; html.style.overflow = "hidden"; // μία μόνο κύλιση: του παραθύρου
    return () => { html.style.overflow = prev; };
  }, []);
  useEffect(() => { docDetailAction(findoc).then(setRes).catch(() => setRes({ ok: false, error: "Το SoftOne δεν απάντησε. Δοκίμασε ξανά σε λίγο." })); }, [findoc]);

  return createPortal(
    <dialog ref={ref} onClose={onClose} aria-label={`Στοιχεία: ${title}`} data-help="orders.softone.detail-modal" className="m-auto w-[min(56rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/40 @container overscroll-contain">
      <div className="bg-white p-4 @md:p-5 grid gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">FINDOC {findoc}{res?.ok ? ` · σειρά ${res.data.series}${res.data.seriesName ? ` ${res.data.seriesName}` : ""}` : ""}</div>
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{title}{res?.ok && res.data.fincode ? ` · ${res.data.fincode}` : ""}</h3>
          </div>
          <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
        </div>
        {!res ? <div className="grid gap-2" aria-busy>{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-eu-surface animate-pulse" />)}</div>
          : !res.ok ? <p className="m-0 rounded-xl border border-eu-amber/40 bg-eu-amber/10 p-3 text-eu-ink text-[length:var(--fs-14)] inline-flex gap-2"><AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden />{res.error}</p>
          : <Body d={res.data} nodes={nodes} onPick={(f) => { onSelect(f); onClose(); }} />}
      </div>
    </dialog>,
    document.body,
  );
}

function Body({ d, nodes, onPick }: { d: DocDetail; nodes: OrderChainNode[]; onPick: (f: number) => void }) {
  const done = d.lines.reduce((a, l) => a + Math.min(l.done, l.qty), 0), all = d.lines.reduce((a, l) => a + l.qty, 0);
  const notes = ([["Αιτιολογία", d.comments], ["Αιτιολογία 2", d.comments1], ["Παρατηρήσεις", d.remarks]] as const).filter(([, v]) => v);
  const ship = d.shipTo;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={d.cancelled} tone="bg-eu-red/10 text-eu-red" Icon={Ban}>Ακυρωμένο</Chip>
        <Chip on={!d.cancelled && (d.fullyTransf || done > 0)} tone={d.fullyTransf ? "bg-eu-green/10 text-eu-green" : "bg-eu-blue/10 text-eu-blue"} Icon={CheckCircle2}>{d.fullyTransf ? "Μετασχηματίστηκε πλήρως" : `Μετασχηματίστηκαν ${qty(done)} από ${qty(all)} τεμ.`}</Chip>
        <Chip on={d.printed} tone="bg-eu-surface-2 text-eu-ink-2" Icon={Printer}>Εκτυπώθηκε</Chip>
      </div>

      <dl className="m-0 grid grid-cols-2 @xl:grid-cols-4 gap-2">
        <Kpi k="Ημερομηνία" v={dmy(d.date)} />
        <Kpi k="Καθαρή αξία" v={money(d.net)} />
        <Kpi k="ΦΠΑ" v={money(d.vat)} />
        <Kpi k="Σύνολο" v={money(d.total)} strong />
      </dl>

      <div className="grid gap-3 @xl:grid-cols-2">
        <Box Icon={User} title="Πελάτης">
          {d.customer ? <Rows rows={[["Επωνυμία", d.customer.name], ["Κωδικός", d.customer.code], ["ΑΦΜ", d.customer.afm], ["Πόλη", d.customer.city], ["Τηλέφωνο", d.customer.phone], ["Email", d.customer.email]]} /> : <p className="m-0 text-eu-muted">Χωρίς πελάτη</p>}
        </Box>
        <Box Icon={MapPin} title="Παράδοση και πληρωμή">
          <Rows rows={[["Παραλήπτης", ship.name], ["Τηλέφωνο", ship.phone], ["Διεύθυνση", [ship.address, ship.zip, ship.city].filter(Boolean).join(", ")], ["ΑΦΜ / επάγγελμα", [ship.afm, ship.job].filter(Boolean).join(" · ")], ["Αποθήκη", d.whouse], ["Τρόπος αποστολής", d.shipment], ["Πληρωμή", d.payment], ["Υποκατάστημα", d.branch]]} />
        </Box>
      </div>

      <section className="grid gap-2" aria-label="Γραμμές">
        <h4 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]"><Package className="size-4 text-eu-ink-3" aria-hidden /> Γραμμές <span className="text-eu-muted font-normal tabular-nums">{d.lines.length}</span></h4>
        {!d.lines.length ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το παραστατικό δεν έχει γραμμές ειδών.</p> : (
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {d.lines.map((l) => {
              const src = l.from ? nodes.find((n) => n.findoc === l.from) : null, left = Math.max(0, l.qty - l.done);
              return (
                <li key={l.linenum} className="rounded-xl border border-eu-line p-3 grid gap-1.5 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-center text-[length:var(--fs-13)]">
                  <div className="min-w-0 grid gap-0.5">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{l.name}</span>
                    <span className="text-eu-ink-3 tabular-nums break-words">{l.code || "—"}{l.whouse ? ` · αποθήκη ${l.whouse}` : ""}{l.note ? ` · ${l.note}` : ""}</span>
                    <span className="flex flex-wrap gap-1.5 items-center">
                      {l.done > 0 && <span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-bold ${left ? "bg-eu-blue/10 text-eu-blue" : "bg-eu-green/10 text-eu-green"}`}>{left ? `μετασχηματίστηκαν ${qty(l.done)}, μένουν ${qty(left)}` : "μετασχηματίστηκε όλη"}</span>}
                      {src ? <button type="button" onClick={() => onPick(src.findoc)} className="min-h-8 text-eu-blue font-bold hover:underline">από {titleOf(src)}</button> : l.from ? <span className="text-eu-muted">από FINDOC {l.from}</span> : null}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 @xl:flex gap-3 tabular-nums text-right">
                    <Num k="Ποσότητα" v={`${qty(l.qty)} ${l.unit}`} />
                    <Num k="Τιμή" v={`${money(l.price)}${l.discPct ? ` −${qty(l.discPct)}%` : ""}`} />
                    <Num k={`Αξία${l.vatPct != null ? ` · ΦΠΑ ${qty(l.vatPct)}%` : ""}`} v={money(l.net)} strong />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {notes.length > 0 && <Box Icon={MessageSquare} title="Σχόλια"><Rows rows={notes.map(([k, v]) => [k, v])} wrap /></Box>}

      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Καταχώριση {dt(d.created)}{d.createdBy ? ` από ${d.createdBy}` : ""} · τελευταία αλλαγή {dt(d.updated)}{d.updatedBy ? ` από ${d.updatedBy}` : ""}. Στοιχεία από το SoftOne, μόνο για ανάγνωση.</p>
    </>
  );
}

function Chip({ on, tone, Icon, children }: { on: boolean; tone: string; Icon: typeof Ban; children: React.ReactNode }) {
  return on ? <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-12)] ${tone}`}><Icon className="size-3.5" aria-hidden />{children}</span> : null;
}
function Kpi({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="rounded-xl bg-eu-surface px-3 py-2 grid"><dt className="text-eu-muted text-[length:var(--fs-12)]">{k}</dt><dd className={`m-0 tabular-nums text-eu-ink ${strong ? "font-extrabold text-[length:var(--fs-17)]" : "font-bold text-[length:var(--fs-15)]"}`}>{v}</dd></div>;
}
function Box({ Icon, title, children }: { Icon: typeof Ban; title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-eu-line p-3 grid gap-1 content-start text-[length:var(--fs-13)] min-w-0"><h4 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]"><Icon className="size-4 text-eu-ink-3" aria-hidden />{title}</h4>{children}</section>;
}
function Rows({ rows, wrap }: { rows: (readonly [string, string])[]; wrap?: boolean }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return <p className="m-0 text-eu-muted">Κενά στο SoftOne</p>;
  return <dl className="m-0 grid">{shown.map(([k, v]) => <div key={k} className={`py-1.5 border-t border-eu-line first:border-t-0 ${wrap ? "grid gap-0.5" : "flex justify-between gap-3"}`}><dt className="text-eu-muted shrink-0">{k}</dt><dd className={`m-0 text-eu-ink-2 min-w-0 break-words ${wrap ? "whitespace-pre-line" : "text-right"}`}>{v}</dd></div>)}</dl>;
}
function Num({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="grid @xl:min-w-24"><span className="text-eu-muted text-[length:var(--fs-11)]">{k}</span><span className={strong ? "font-bold text-eu-ink" : "text-eu-ink-2"}>{v}</span></div>;
}
