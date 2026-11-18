"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, Eye, EyeOff, ImagePlus, Loader2 } from "lucide-react";
import { DesignedBanner } from "@/components/promo/DesignedBanner";
import type { BannerDesign, BannerProduct } from "@/lib/promo/banner-design";
import { bannerPreviewProductsAction } from "@/app/admin/(shell)/prosfores/theseis/actions";
import { offerDesignsAction, savePlacementAction, type OfferDesign } from "@/app/admin/(shell)/prosfores/actions";
import { blockOptionsAction, slotBannersAction, type BlockOptions, type SlotBanner } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { Modal } from "./EditorDialogs";

const SLOT = "home-strip";
const sel = "w-full rounded-xl border-2 border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus-visible:border-eu-blue";

/**
 * Η διαφημιστική λωρίδα της αρχικής, χωρίς να φύγεις από τη σελίδα: βλέπεις τι παίζει τώρα και, από ένα παράθυρο,
 * διαλέγεις προσφορά και σχέδιο και το banner μπαίνει στη λωρίδα. Ημερομηνίες = της προσφοράς.
 */
const STATE = {
  now: { label: "Παίζει", cls: "border-eu-green bg-eu-green/10", chip: "bg-eu-green text-white", Icon: Eye },
  next: { label: "Παίζει", cls: "border-eu-line bg-white", chip: "bg-eu-chip text-eu-navy", Icon: Clock },
  off: { label: "Δεν παίζει", cls: "border-eu-line bg-eu-surface/60", chip: "bg-eu-surface text-eu-ink-3", Icon: EyeOff },
} as const;

export function StripBannerField() {
  const [o, setO] = useState<BlockOptions | null>(null);
  const [list, setList] = useState<SlotBanner[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => { void blockOptionsAction().then(setO).catch(() => {}); void slotBannersAction(SLOT).then(setList).catch(() => setList([])); };
  useEffect(load, []);
  // νέο banner μπαίνει πρώτο στη σειρά, αλλιώς θα έμενε «σε αναμονή» πίσω από τα παλιά
  const top = Math.max(0, Math.min(100, ...(list ?? []).filter((b) => b.state !== "off").map((b) => b.priority - 1)));
  return (
    <div className="grid gap-3" data-help="home.strip-banner">
      <div className="grid gap-0.5">
        <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τα banners αυτής της λωρίδας</span>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">Κάθε σημείο της αρχικής που δείχνει αυτή τη θέση παίρνει ένα banner, με τη σειρά: το πρώτο σημείο το 1ο, το δεύτερο το 2ο. Έτσι δύο σημεία δεν δείχνουν το ίδιο.</span>
      </div>
      {!list ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden />Φέρνω τα banners…</p>
        : !list.length ? <p className="m-0 rounded-xl border-2 border-dashed border-eu-line px-3 py-3 text-eu-ink-3 text-[length:var(--fs-14)]">Η λωρίδα δεν έχει κανένα banner. Πάτα το κουμπί από κάτω για να βάλεις.</p> : (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {list.map((a) => { const st = STATE[a.state]; return (
            <li key={a.id} className={`grid gap-1 rounded-xl border-2 px-3 py-2 ${st.cls}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${st.chip}`}><st.Icon className="size-3.5" aria-hidden />{st.label}{a.order ? ` · ${a.order}ο στη σειρά` : ""}</span>
                <span className="flex-1 min-w-0 basis-40 font-semibold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{a.title}</span>
                <a href={`/admin/prosfores/theseis/${a.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Άνοιγμα ↗</a>
              </div>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{a.why}</span>
            </li>
          ); })}
        </ul>
      )}
      <button type="button" onClick={() => setOpen(true)} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-5 min-h-12 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue cursor-pointer"><ImagePlus className="size-4" aria-hidden />Βάλε banner στη λωρίδα</button>
      {open && <StripBannerDialog promos={o?.promos ?? []} priority={top} onClose={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function StripBannerDialog({ promos, priority, onClose }: { promos: BlockOptions["promos"]; priority: number; onClose: () => void }) {
  const [promo, setPromo] = useState("");
  const [designs, setDesigns] = useState<OfferDesign[] | null>(null);
  const [pick, setPick] = useState("");
  const [prods, setProds] = useState<{ key: string; list: BannerProduct[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { let on = true; void offerDesignsAction().then((r) => { if (on) setDesigns(r); }).catch(() => { if (on) setDesigns([]); }); return () => { on = false; }; }, []);
  const p = promos.find((x) => x.id === promo) ?? null;
  const chosen = designs?.find((x) => x.key === pick) ?? null;
  // το σχέδιο με τα προϊόντα της προσφοράς· τα πρότυπα παίρνουν το όνομά της για τίτλο
  const design: BannerDesign | null = chosen && p ? { ...chosen.design, ...(chosen.ownTexts ? {} : { title: p.name }), products: { ...chosen.design.products, source: "promotion", ids: [] } } : null;
  const dkey = design ? JSON.stringify([promo, design]) : "";
  useEffect(() => {
    if (!dkey) return;
    let on = true;
    const [id, d] = JSON.parse(dkey) as [string, BannerDesign];
    void bannerPreviewProductsAction(d, id).then((r) => { if (on) setProds({ key: dkey, list: r }); }).catch(() => { if (on) setProds({ key: dkey, list: [] }); });
    return () => { on = false; };
  }, [dkey]);
  const list = prods?.key === dkey ? prods.list : null;
  const apply = () => start(async () => {
    if (!p || !design || !chosen) return;
    const r = await savePlacementAction({ slot: SLOT, title: `${p.name} · ${chosen.name}`.slice(0, 120), image: null, imageMobile: null, alt: p.name, href: null, promotionId: p.id, landingId: null, status: "active", startsAt: null, endsAt: null, priority, categories: [], design });
    setMsg(r.ok ? { ok: true, text: "Το banner μπήκε πρώτο στη λωρίδα. Φαίνεται στο site όσο τρέχει η προσφορά· τα προηγούμενα πάνε μία θέση πίσω." } : { ok: false, text: "Δεν μπήκε το banner. Δοκίμασε ξανά." });
  });
  const groups = [...new Set((designs ?? []).map((x) => x.group))];
  return (
    <Modal title="Banner στη διαφημιστική λωρίδα" icon={<ImagePlus className="size-5 text-eu-navy" aria-hidden />} onClose={onClose} wide
      footer={msg?.ok
        ? <button type="button" onClick={onClose} className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue cursor-pointer">Τέλος</button>
        : <><button type="button" onClick={onClose} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy cursor-pointer">Άκυρο</button>
          <button type="button" disabled={!design || busy} onClick={apply} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Βάλε το στη λωρίδα</button></>}>
      <div className="grid gap-4 p-4">
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">1. Προσφορά
          <select value={promo} onChange={(e) => { setPromo(e.target.value); setMsg(null); }} className={sel}>
            <option value="">{promos.length ? "Διάλεξε προσφορά" : "Καμία ενεργή ή προγραμματισμένη προσφορά"}</option>
            {promos.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}{x.status === "scheduled" ? " · προγραμματισμένη" : ""}</option>)}
          </select>
          <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Τα προϊόντα και οι τιμές του banner έρχονται από αυτήν. Το banner φαίνεται όσο τρέχει.</span>
        </label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">2. Σχέδιο
          <select value={pick} onChange={(e) => { setPick(e.target.value); setMsg(null); }} disabled={!designs} className={sel}>
            <option value="">{designs ? "Διάλεξε σχέδιο" : "Φέρνω τα σχέδια…"}</option>
            {groups.map((g) => <optgroup key={g} label={g}>{designs!.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="grid gap-2">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Έτσι θα φαίνεται</span>
          {!design ? <p className="m-0 rounded-xl border-2 border-dashed border-eu-line px-3 py-6 text-center text-eu-muted text-[length:var(--fs-14)]">Διάλεξε προσφορά και σχέδιο για να το δεις.</p>
            : !list ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden />Ετοιμάζω την προεπισκόπηση…</p>
            : <>
              <div className="rounded-xl overflow-hidden border border-eu-line bg-white [&_a]:pointer-events-none"><DesignedBanner d={design} products={list} shape="wide" href={null} sticker={null} /></div>
              {!list.length && <p className="m-0 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">Η προσφορά δεν έχει προϊόντα με τιμή προσφοράς τώρα: το banner γεμίζει μόνο του όταν αποκτήσει.</p>}
            </>}
        </div>
        {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/15 text-eu-ink" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
      </div>
    </Modal>
  );
}
