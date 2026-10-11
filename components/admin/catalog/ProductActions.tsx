"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, FileText, Ruler, ShieldCheck, Zap, Tag, RefreshCw, ExternalLink, BadgePercent, Copy, X, Loader2, ChevronDown } from "lucide-react";
import { pullFromSoftone } from "@/app/admin/(shell)/catalog/actions";

export type ProductModal = "texts" | "dims" | "warranty" | "energy" | "stickers";
const MODALS: Record<ProductModal, { label: string; hint: string; Icon: typeof FileText; wide?: boolean }> = {
  texts: { label: "Κείμενα & χαρακτηριστικά", hint: "όνομα, περιγραφές, χαρακτηριστικά (SoftOne + eshop)", Icon: FileText, wide: true },
  dims: { label: "Διαστάσεις & βάρος", hint: "για AR, αποστολή και «χωράει;»", Icon: Ruler },
  warranty: { label: "Εγγύηση & βασικά στοιχεία", hint: "μήνες εγγύησης, επέκταση, barcode, διαθεσιμότητα", Icon: ShieldCheck },
  energy: { label: "Ενεργειακή ετικέτα (EPREL)", hint: "αναζήτηση στο EPREL, ετικέτα, δελτίο", Icon: Zap },
  stickers: { label: "Stickers στην κάρτα", hint: "χειροκίνητα stickers με ημερομηνίες", Icon: Tag, wide: true },
};
const EVENT = "eu-product-action";
/** Άνοιγμα ενός παραθύρου διόρθωσης από οπουδήποτε στη σελίδα (π.χ. «Διόρθωση» στις Πηγές πληροφοριών). */
export const openProductModal = (key: ProductModal) => window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));

/** Κουμπί «Διόρθωση» που ανοίγει ένα από τα παράθυρα του μενού Ενέργειες. */
export function FixButton({ modal, children = "Διόρθωση" }: { modal: ProductModal; children?: ReactNode }) {
  return <button type="button" onClick={() => openProductModal(modal)} className="shrink-0 rounded-full px-2.5 min-h-8 font-bold text-eu-blue text-[length:var(--fs-12)] hover:bg-eu-chip">{children}</button>;
}

/**
 * Μενού «Ενέργειες» της καρτέλας προϊόντος: διορθώσεις σε παράθυρα (κείμενα & χαρακτηριστικά, διαστάσεις, εγγύηση,
 * ενεργειακή ετικέτα, stickers — το περιεχόμενό τους έρχεται έτοιμο από τη σελίδα), ενημέρωση από SoftOne, νέα
 * προσφορά, στο site και αντιγραφή κωδικών. Ανοίγει πάνω από τη σελίδα· λειτουργεί με ↑ ↓ Esc.
 */
export function ProductActions({ productId, title, modals, siteHref, canPromo, canSoftone, codes }: { productId: string; title: string; modals: Partial<Record<ProductModal, ReactNode>>; siteHref: string | null; canPromo: boolean; canSoftone: boolean; codes: { label: string; value: string }[] }) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [open, setOpen] = useState<ProductModal | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const dlg = useRef<HTMLDialogElement>(null);
  const close = () => setPos(null);
  useEffect(() => { const on = (e: Event) => { const k = (e as CustomEvent<ProductModal>).detail; if (modals[k]) setOpen(k); }; window.addEventListener(EVENT, on); return () => window.removeEventListener(EVENT, on); }, [modals]);
  useEffect(() => { const d = dlg.current; if (open && d && !d.open) d.showModal(); if (!open && d?.open) d.close(); }, [open]);
  useEffect(() => {
    if (!pos) return;
    const out = (e: Event) => { if (e instanceof KeyboardEvent) { if (e.key === "Escape") { close(); btn.current?.focus(); } return; } if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const gone = () => close();
    document.addEventListener("mousedown", out); document.addEventListener("keydown", out); window.addEventListener("resize", gone);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", out); window.removeEventListener("resize", gone); };
  }, [pos]);
  const keyNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const refresh = () => start(async () => { const r = await pullFromSoftone(productId); setMsg({ ok: r.ok, text: r.message }); router.refresh(); });
  const item = "w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[length:var(--fs-14)] hover:bg-eu-surface focus-visible:bg-eu-surface outline-none disabled:opacity-40";
  const meta = open ? MODALS[open] : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} onClick={() => { if (pos) return close(); const r = btn.current!.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: window.innerWidth - r.right }); }} className={`inline-flex items-center gap-1.5 rounded-full px-4 min-h-10 font-bold text-[length:var(--fs-14)] ${pos ? "bg-eu-navy text-white" : "bg-eu-navy/10 text-eu-navy hover:bg-eu-navy hover:text-white"}`}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />} Ενέργειες <ChevronDown className={`size-4 transition-transform ${pos ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {msg && <span role="status" className={`text-[length:var(--fs-13)] font-semibold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
      </div>
      {pos && createPortal(
        <div ref={menu} role="menu" aria-label={`Ενέργειες: ${title}`} onKeyDown={keyNav} className="fixed z-[70] w-[22rem] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-eu-line bg-white p-1.5 shadow-[var(--shadow-raised)] grid gap-0.5" style={{ top: pos.top, right: Math.max(8, pos.right) }}>
          <span className="px-2.5 pt-1 pb-1 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Διορθώσεις</span>
          {(Object.keys(MODALS) as ProductModal[]).filter((k) => modals[k]).map((k) => { const m = MODALS[k]; return (
            <button key={k} type="button" role="menuitem" onClick={() => { close(); setOpen(k); }} className={item}><m.Icon className="size-4 mt-0.5 text-eu-blue shrink-0" aria-hidden /><span className="grid"><b>{m.label}</b><span className="text-eu-muted text-[length:var(--fs-12)]">{m.hint}</span></span></button>
          ); })}
          <div className="border-t border-eu-line-2 my-0.5" />
          {canSoftone && <button type="button" role="menuitem" disabled={busy} onClick={() => { close(); refresh(); }} className={item}><RefreshCw className="size-4 mt-0.5 text-eu-green shrink-0" aria-hidden /><span className="grid"><b>Ενημέρωση από SoftOne</b><span className="text-eu-muted text-[length:var(--fs-12)]">διαβάζει τώρα το είδος από το ERP</span></span></button>}
          {canPromo && <Link role="menuitem" href={`/admin/prosfores/new?products=${productId}`} onClick={close} className={item}><BadgePercent className="size-4 mt-0.5 text-eu-blue shrink-0" aria-hidden /><span className="grid"><b>Νέα προσφορά</b><span className="text-eu-muted text-[length:var(--fs-12)]">ο οδηγός ανοίγει με το προϊόν</span></span></Link>}
          {siteHref && <a role="menuitem" href={siteHref} target="_blank" rel="noreferrer" onClick={close} className={item}><ExternalLink className="size-4 mt-0.5 text-eu-muted shrink-0" aria-hidden />Στο site (νέα καρτέλα)</a>}
          {codes.map((c) => <button key={c.label} type="button" role="menuitem" onClick={() => { close(); void navigator.clipboard?.writeText(c.value); setMsg({ ok: true, text: `Αντιγράφηκε ${c.label}: ${c.value}` }); }} className={item}><Copy className="size-4 mt-0.5 text-eu-muted shrink-0" aria-hidden />Αντιγραφή {c.label} <span className="ml-auto font-mono text-eu-muted text-[length:var(--fs-12)]">{c.value}</span></button>)}
        </div>,
        document.body,
      )}
      {/* <dialog> με showModal() ανεβαίνει στο top layer — δεν χρειάζεται portal */}
      <dialog ref={dlg} onClose={() => setOpen(null)} aria-label={meta ? meta.label : "Διόρθωση"} className={`m-auto ${meta?.wide ? "w-[min(60rem,calc(100vw-1.5rem))]" : "w-[min(44rem,calc(100vw-1.5rem))]"} max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/40`}>
          {open && meta && (
            <div className="bg-white @container">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-2 bg-white border-b border-eu-line px-4 py-3">
                <div className="grid min-w-0"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-2"><meta.Icon className="size-5 text-eu-blue" aria-hidden />{meta.label}</h3><span className="text-eu-muted text-[length:var(--fs-13)] truncate">{title}</span></div>
                <button type="button" aria-label="Κλείσιμο" onClick={() => setOpen(null)} className="size-10 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
              </div>
              <div className="p-3 @md:p-4 grid gap-3">{modals[open]}</div>
            </div>
          )}
      </dialog>
    </>
  );
}
