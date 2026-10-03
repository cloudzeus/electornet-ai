"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, ExternalLink, ChevronLeft } from "lucide-react";
import { BLOCKS, newBlockId, type Block, type BlockType } from "@/lib/promo/landing-blocks";
import { ImageUrlField } from "./ImageUrlField";
import { Hint } from "./Help";
import { ProductBrowser } from "./ProductBrowser";
import { createLandingAction, saveLandingAction, type LandingInput } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";
type Opt = { id: string; label: string };
const localDt = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Γρήγορη δημιουργία: τίτλος + προσφορά → σελίδα με βασικά blocks. */
export function NewLanding({ promos }: { promos: Opt[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [promotionId, setPromotionId] = useState(promos[0]?.id ?? "");
  const [busy, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createLandingAction({ title, promotionId: promotionId || null }); router.push(`/admin/prosfores/selides/${r.id}`); }); }} className="rounded-2xl bg-white border border-eu-line p-4 grid grid-cols-1 @3xl:grid-cols-[1fr_1fr_auto] gap-3 items-end">
      <label className={lbl}><span>Τίτλος νέας σελίδας</span><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="π.χ. Black Friday τηλεοράσεις" required /></label>
      <label className={lbl}><span>Προσφορά</span><select className={input} value={promotionId} onChange={(e) => setPromotionId(e.target.value)}><option value="">— χωρίς —</option>{promos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <button disabled={busy || !title.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Plus className="size-4" aria-hidden /> Δημιουργία</button>
    </form>
  );
}

/** Ο editor: στοιχεία σελίδας + blocks (προσθήκη, σειρά, αφαίρεση, ρυθμίσεις ανά τύπο). */
export function LandingEditor({ initial, promos, categories }: { initial: LandingInput; promos: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const [d, setD] = useState<LandingInput>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<LandingInput>) => setD((x) => ({ ...x, ...p }));
  const setBlock = (i: number, props: Partial<Block["props"]>) => setD((x) => ({ ...x, blocks: x.blocks.map((b, j) => (j === i ? ({ ...b, props: { ...b.props, ...props } } as Block) : b)) }));
  const move = (i: number, dir: -1 | 1) => setD((x) => { const b = [...x.blocks]; const j = i + dir; if (j < 0 || j >= b.length) return x; [b[i], b[j]] = [b[j], b[i]]; return { ...x, blocks: b }; });
  const add = (type: BlockType) => setD((x) => ({ ...x, blocks: [...x.blocks, { id: newBlockId(), type, props: BLOCKS.find((b) => b.type === type)!.make() } as Block] }));
  const save = (status?: LandingInput["status"]) => start(async () => {
    const r = await saveLandingAction({ ...d, status: status ?? d.status });
    if (!r.ok) return setMsg({ ok: false, t: r.error });
    set({ slug: r.slug, status: status ?? d.status });
    setMsg({ ok: true, t: status === "published" ? "Δημοσιεύτηκε." : status === "archived" ? "Στο αρχείο." : "Αποθηκεύτηκε." });
    router.refresh();
  });

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/prosfores/selides" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Landing pages</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{d.title}</h2>
          <div className="text-eu-muted font-mono text-[length:var(--fs-14)]">/prosfores/{d.slug} · {d.status === "published" ? "δημοσιευμένη" : d.status === "archived" ? "αρχείο" : "πρόχειρη"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/prosfores/${d.slug}?preview=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Προεπισκόπηση <ExternalLink className="size-4" aria-hidden /></a>
          <button type="button" disabled={busy} onClick={() => save()} className="rounded-full border-2 border-eu-navy text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-40">Αποθήκευση</button>
          {d.status !== "published" ? <button type="button" disabled={busy} onClick={() => save("published")} className="rounded-full bg-eu-yellow text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-yellow-dark disabled:opacity-40">Δημοσίευση</button>
            : <button type="button" disabled={busy} onClick={() => save("draft")} className="rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40">Απόσυρση</button>}
        </div>
      </div>
      {msg && <p role="status" className={`m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}

      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-3">
        <label className={lbl}><span>Τίτλος</span><input className={input} value={d.title} onChange={(e) => set({ title: e.target.value })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Ο τίτλος της σελίδας (και της καρτέλας του browser).</span></label>
        <label className={lbl}><span>Διεύθυνση</span><span className="flex items-center gap-1"><span className="text-eu-muted font-mono font-normal">/prosfores/</span><input className={`${input} font-mono`} value={d.slug} onChange={(e) => set({ slug: e.target.value })} /></span></label>
        <label className={lbl}><span>Προσφορά</span><select className={input} value={d.promotionId ?? ""} onChange={(e) => set({ promotionId: e.target.value || null })}><option value="">— χωρίς —</option>{promos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Από εδώ έρχονται τα προϊόντα, η αντίστροφη μέτρηση και οι όροι.</span></label>
        <label className={lbl}><span>Εμφάνιση από</span><input type="datetime-local" className={input} value={localDt(d.startsAt)} onChange={(e) => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Κενό = μόλις δημοσιευτεί.</span></label>
        <label className={lbl}><span>Λήξη σελίδας</span><input type="datetime-local" className={input} value={localDt(d.endsAt)} onChange={(e) => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Κενό = όσο τρέχει η προσφορά· μετά γράφει «έληξε».</span></label>
        <label className={lbl}><span>SEO τίτλος</span><input className={input} value={d.seoTitle ?? ""} onChange={(e) => set({ seoTitle: e.target.value || null })} maxLength={70} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Έως 70 χαρακτήρες — τι δείχνει η Google.</span></label>
        <label className={`${lbl} @xl:col-span-2 @4xl:col-span-3`}><span>SEO περιγραφή</span><input className={input} value={d.seoDesc ?? ""} onChange={(e) => set({ seoDesc: e.target.value || null })} maxLength={160} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Έως 160 χαρακτήρες — η περιγραφή στα αποτελέσματα αναζήτησης.</span></label>
      </section>

      <ol className="m-0 p-0 list-none grid gap-3">
        {d.blocks.map((b, i) => (
          <li key={b.id} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-eu-navy text-[length:var(--fs-15)] flex-1">{i + 1}. {BLOCKS.find((x) => x.type === b.type)?.label}</span>
              <button type="button" aria-label="Πάνω" disabled={i === 0} onClick={() => move(i, -1)} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" aria-label="Κάτω" disabled={i === d.blocks.length - 1} onClick={() => move(i, 1)} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" aria-label="Αφαίρεση block" onClick={() => setD((x) => ({ ...x, blocks: x.blocks.filter((_, j) => j !== i) }))} className="size-11 grid place-items-center rounded-full hover:bg-eu-red/10 text-eu-red"><Trash2 className="size-4" aria-hidden /></button>
            </div>
            <BlockForm b={b} set={(p) => setBlock(i, p)} categories={categories} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {BLOCKS.map((b) => <button key={b.type} type="button" title={b.help} onClick={() => add(b.type)} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> {b.label}</button>)}
      </div>
    </div>
  );
}

function BlockForm({ b, set, categories }: { b: Block; set: (p: Record<string, unknown>) => void; categories: Opt[] }) {
  switch (b.type) {
    case "hero": { const p = b.props; return (
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
        <label className={lbl}><span>Τίτλος</span><input className={input} value={p.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className={lbl}><span>Μικρός τίτλος πάνω</span><input className={input} value={p.kicker ?? ""} onChange={(e) => set({ kicker: e.target.value })} /></label>
        <label className={`${lbl} @xl:col-span-2`}><span>Υπότιτλος</span><input className={input} value={p.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value })} /></label>
        <ImageUrlField label="Εικόνα" value={p.image ?? ""} onChange={(v) => set({ image: v })} />
        <label className={lbl}><span>Χρώμα</span><select className={input} value={p.tone ?? "navy"} onChange={(e) => set({ tone: e.target.value })}><option value="navy">Μπλε</option><option value="yellow">Κίτρινο</option><option value="red">Κόκκινο</option></select></label>
        <label className={lbl}><span>Κουμπί</span><input className={input} value={p.ctaLabel ?? ""} onChange={(e) => set({ ctaLabel: e.target.value })} /></label>
        <label className={lbl}><span>Σύνδεσμος κουμπιού</span><input className={input} value={p.ctaHref ?? ""} onChange={(e) => set({ ctaHref: e.target.value })} placeholder="#proionta" /></label>
      </div>
    ); }
    case "countdown": return <label className={lbl}><span>Κείμενο</span><input className={`${input} max-w-sm`} value={b.props.label ?? ""} onChange={(e) => set({ label: e.target.value })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Μετρά μέχρι τη λήξη της προσφοράς (ή της σελίδας). Κρύβεται όταν λήξει.</span></label>;
    case "products": { const p = b.props; return (
      <div className="grid grid-cols-1 @xl:grid-cols-4 gap-3 items-end">
        <label className={`${lbl} @xl:col-span-2`}><span>Τίτλος</span><input className={input} value={p.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className={lbl}><span className="inline-flex items-center gap-1">Πηγή <Hint k="landingSource" /></span><select className={input} value={p.source} onChange={(e) => set({ source: e.target.value })}><option value="promotion">Τα προϊόντα της προσφοράς</option><option value="category">Κατηγορία</option><option value="manual">Επιλεγμένα</option></select></label>
        <label className={lbl}><span>Πλήθος / ταξινόμηση</span><span className="flex gap-2"><input inputMode="numeric" className={`${input} w-20`} value={p.limit ?? 24} onChange={(e) => set({ limit: Number(e.target.value) || 24 })} /><select className={input} value={p.sort ?? "discount"} onChange={(e) => set({ sort: e.target.value })}><option value="discount">Μεγαλύτερη έκπτωση</option><option value="price-asc">Φθηνότερα</option><option value="price-desc">Ακριβότερα</option></select></span></label>
        {p.source === "category" && <label className={`${lbl} @xl:col-span-2`}><span>Κατηγορία</span><select className={input} value={p.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
        {p.source === "manual" && <div className="@xl:col-span-4"><ManualProducts ids={p.ids ?? []} onChange={(ids) => set({ ids })} /></div>}
      </div>
    ); }
    case "categories": return (
      <div className="grid gap-2">
        <label className={lbl}><span>Τίτλος</span><input className={`${input} max-w-md`} value={b.props.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="flex flex-wrap gap-1.5">{categories.map((c) => { const on = b.props.ids.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ ids: on ? b.props.ids.filter((x) => x !== c.id) : [...b.props.ids, c.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{c.label}</button>; })}</div>
      </div>
    );
    case "coupon": return <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3"><label className={lbl}><span>Κωδικός</span><input className={`${input} font-mono uppercase`} value={b.props.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></label><label className={lbl}><span>Κείμενο</span><input className={input} value={b.props.text ?? ""} onChange={(e) => set({ text: e.target.value })} /></label></div>;
    case "text": return <div className="grid gap-3"><label className={lbl}><span>Τίτλος</span><input className={input} value={b.props.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></label><label className={lbl}><span>Κείμενο (κενή γραμμή = νέα παράγραφος)</span><textarea rows={4} className={`${input} py-2`} value={b.props.body} onChange={(e) => set({ body: e.target.value })} /></label></div>;
    case "banner": return <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3"><ImageUrlField label="Εικόνα" value={b.props.image} onChange={(v) => set({ image: v })} /><label className={lbl}><span>Περιγραφή (alt)</span><input className={input} value={b.props.alt ?? ""} onChange={(e) => set({ alt: e.target.value })} /></label><label className={lbl}><span>Σύνδεσμος</span><input className={input} value={b.props.href ?? ""} onChange={(e) => set({ href: e.target.value })} /></label></div>;
    case "terms": return <label className={lbl}><span>Τίτλος</span><input className={`${input} max-w-md`} value={b.props.title ?? ""} onChange={(e) => set({ title: e.target.value })} /><span className="font-normal text-eu-muted text-[length:var(--fs-13)]">Το κείμενο έρχεται από τους όρους της προσφοράς — πάντα η ισχύουσα έκδοση.</span></label>;
    case "faq": return (
      <div className="grid gap-2">
        <label className={lbl}><span>Τίτλος</span><input className={`${input} max-w-md`} value={b.props.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></label>
        {b.props.items.map((it, i) => (
          <div key={i} className="grid grid-cols-1 @xl:grid-cols-[1fr_1.5fr_auto] gap-2 items-start">
            <input aria-label="Ερώτηση" className={input} value={it.q} onChange={(e) => set({ items: b.props.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} placeholder="Ερώτηση" />
            <textarea aria-label="Απάντηση" rows={2} className={`${input} py-2`} value={it.a} onChange={(e) => set({ items: b.props.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} placeholder="Απάντηση" />
            <button type="button" aria-label="Αφαίρεση ερώτησης" onClick={() => set({ items: b.props.items.filter((_, j) => j !== i) })} className="size-11 grid place-items-center rounded-full hover:bg-eu-red/10 text-eu-red"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ items: [...b.props.items, { q: "", a: "" }] })} className="justify-self-start inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Ερώτηση</button>
      </div>
    );
  }
}

function ManualProducts({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-3">
      <ProductBrowser mode="products" selected={new Set(ids)} addLabel="Στη σελίδα" onProduct={(p) => { setNames((n) => ({ ...n, [p.id]: p.title })); onChange(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]); }} />
      {ids.length > 0 && <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{ids.map((id) => <li key={id} className="inline-flex items-center gap-1 rounded-full bg-eu-surface pl-3 pr-1 min-h-10 text-[length:var(--fs-13)] max-w-full"><span className="truncate">{names[id] ?? "προϊόν"}</span><button type="button" aria-label="Αφαίρεση" onClick={() => onChange(ids.filter((x) => x !== id))} className="size-9 shrink-0 grid place-items-center rounded-full hover:bg-black/5"><Trash2 className="size-3.5" aria-hidden /></button></li>)}</ul>}
    </div>
  );
}
