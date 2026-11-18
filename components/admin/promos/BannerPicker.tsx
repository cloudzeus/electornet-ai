"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, ExternalLink, ImageIcon, Loader2, Plus, Sparkles, Unlink } from "lucide-react";
import { sx } from "@/components/ui/sx";
import { adoptDeadBannersAction, bannersForPromoAction, linkBannerAction, type BannerOption } from "@/app/admin/(shell)/prosfores/actions";

const STATUS: Record<string, { label: string; tone: string }> = { active: { label: "Ενεργό", tone: "bg-eu-green/15 text-eu-green" }, paused: { label: "Σε παύση", tone: "bg-eu-amber/15 text-eu-amber" }, draft: { label: "Πρόχειρο", tone: "bg-eu-surface text-eu-ink-3" } };

/** Η μικρογραφία ενός banner: η εικόνα του ή, στα σχεδιασμένα, το φόντο του με τον τίτλο. */
function Thumb({ b }: { b: BannerOption }) {
  const s = sx({ ...(b.color ? { backgroundColor: b.color } : {}), ...(b.image ? { backgroundImage: `url("${b.image}")` } : {}) });
  return (
    <span className={`relative grid place-items-center w-full aspect-[3/1] rounded-lg border border-eu-line bg-eu-surface bg-cover bg-center overflow-hidden ${s.className}`}>
      {s.node}
      {!b.image && (b.color ? <span className="px-2 text-center text-white font-extrabold text-[length:var(--fs-13)] line-clamp-2">{b.title}</span> : <ImageIcon className="size-6 text-eu-muted" aria-hidden />)}
      {b.color && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-white/90 text-eu-navy font-bold px-2 py-0.5 text-[length:var(--fs-12)]"><Sparkles className="size-3.5" aria-hidden />Σχεδιασμένο</span>}
    </span>
  );
}

/**
 * «Διάλεξε banner»: τα υπάρχοντα banners (σχεδιασμένα και έτοιμες εικόνες) σε κάρτες με μικρογραφία. Ένα πάτημα δένει το
 * banner με την προσφορά — από εκεί και πέρα φαίνεται στη θέση του μόνο όσο τρέχει η προσφορά. Το ίδιο πάτημα το λύνει.
 */
export function BannerPicker({ id }: { id: string }) {
  const router = useRouter();
  const [list, setList] = useState<BannerOption[] | null>(null);
  const [tick, setTick] = useState(0);
  const [all, setAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    let on = true;
    void bannersForPromoAction(id).then((r) => { if (on) setList(r); }).catch(() => { if (on) setList([]); });
    return () => { on = false; };
  }, [id, tick]);
  const toggle = (b: BannerOption) => start(async () => {
    // banner προσφοράς που τρέχει: ρωτά πριν το πάρει από εκείνη· αν η άλλη προσφορά δεν τρέχει πια, δεν έχει τι να χάσει
    if (!b.linked && b.other && !b.otherDead && !confirm(`Το banner «${b.title}» είναι δεμένο με την προσφορά «${b.other}», που τρέχει. Να δεθεί με αυτή την προσφορά αντί για εκείνη;`)) return;
    const r = await linkBannerAction(b.id, id, !b.linked);
    setMsg(!r.ok ? "Δεν άλλαξε κάτι. Δοκίμασε ξανά." : b.linked ? `Το banner «${b.title}» δεν είναι πια δεμένο με την προσφορά.` : `Το banner «${b.title}» δέθηκε με την προσφορά: φαίνεται στη θέση «${b.slot}» όσο τρέχει η προσφορά${b.status === "active" ? "" : " — αφού το ενεργοποιήσεις από τα Banners"}.`);
    setTick((t) => t + 1);
    router.refresh();
  });

  const linked = (list ?? []).filter((b) => b.linked).length;
  const dead = (list ?? []).filter((b) => b.otherDead);
  const adopt = () => start(async () => {
    const r = await adoptDeadBannersAction(id);
    setMsg(r.moved ? `${r.moved === 1 ? "1 banner δέθηκε" : `${r.moved} banners δέθηκαν`} με αυτή την προσφορά. Όσα είναι «Ενεργό» φαίνονται στο site όσο τρέχει η προσφορά.` : "Δεν βρέθηκε banner για μεταφορά.");
    setTick((t) => t + 1);
    router.refresh();
  });
  const shown = all ? list ?? [] : (list ?? []).slice(0, 6);
  return (
    <div data-help="promo.banner-pick" className="grid gap-3 rounded-xl bg-white border-2 border-eu-navy/20 p-3 @md:p-4 @container">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="grid gap-0.5 flex-1 basis-64 min-w-0">
          <h5 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><ImageIcon className="size-5 text-eu-blue" aria-hidden /> Διάλεξε banner για την προσφορά</h5>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Τα banners που έχεις ήδη σχεδιάσει. Πάτα «Χρήση σε αυτή την προσφορά»: το banner φαίνεται στη θέση του μόνο όσο τρέχει η προσφορά.{linked > 0 && <b className="text-eu-green"> {linked === 1 ? "1 banner είναι δεμένο." : `${linked} banners είναι δεμένα.`}</b>}</p>
        </div>
        <Link href="/admin/prosfores/theseis" target="_blank" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy"><Plus className="size-4" aria-hidden />Νέο banner<span className="sr-only"> (νέα καρτέλα)</span></Link>
      </div>
      {dead.length > 0 && (
        <p role="status" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-eu-amber/15 px-3 py-2.5 text-eu-ink text-[length:var(--fs-14)]">
          <span className="flex-1 basis-64"><b>{dead.length === 1 ? "1 banner δεν φαίνεται" : `${dead.length} banners δεν φαίνονται`} στο site.</b> Είναι δεμένα με την προσφορά «{dead[0].other}»{new Set(dead.map((b) => b.other)).size > 1 ? " και άλλες" : ""}, που δεν τρέχει πια. Ένα banner φαίνεται μόνο όσο τρέχει η προσφορά του.</span>
          <button type="button" disabled={busy} onClick={adopt} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}Δέσε τα με αυτή την προσφορά</button>
        </p>
      )}
      {list === null ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φέρνω τα banners…</p>
        : !list.length ? <p className="m-0 rounded-lg bg-eu-surface px-3 py-3 text-eu-ink-2 text-[length:var(--fs-14)]">Δεν υπάρχει ακόμη κανένα banner. Πάτα «Νέο banner» για να σχεδιάσεις το πρώτο.</p> : (
        <>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-2">
            {shown.map((b) => { const st = STATUS[b.status] ?? STATUS.draft; return (
              <li key={b.id} className={`grid gap-2 content-start rounded-xl border-2 p-2.5 ${b.linked ? "border-eu-green bg-eu-green/5" : "border-eu-line"}`}>
                <Thumb b={b} />
                <span className="grid gap-0.5 min-w-0">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug line-clamp-2">{b.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-ink-3 text-[length:var(--fs-13)]"><span>{b.slot}</span><span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${st.tone}`}>{st.label}</span></span>
                  {b.other && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">Δεμένο με «{b.other}»{b.otherDead ? " · δεν τρέχει, άρα δεν φαίνεται στο site" : ""}</span>}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy} onClick={() => toggle(b)} aria-pressed={b.linked} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer disabled:opacity-50 ${b.linked ? "border-2 border-eu-line bg-white text-eu-ink-2 hover:border-eu-red hover:text-eu-red" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>{b.linked ? <><Unlink className="size-4" aria-hidden />Αφαίρεση από την προσφορά</> : <><Check className="size-4" aria-hidden />Χρήση σε αυτή την προσφορά</>}</button>
                  <Link href={`/admin/prosfores/theseis/${b.id}`} target="_blank" aria-label={`Άνοιγμα του banner ${b.title} (νέα καρτέλα)`} className="inline-flex items-center justify-center rounded-full border border-eu-line size-11 md:size-9 text-eu-ink-3 hover:border-eu-navy"><ExternalLink className="size-4" aria-hidden /></Link>
                </span>
              </li>
            ); })}
          </ul>
          {list.length > 6 && <button type="button" onClick={() => setAll((x) => !x)} className="justify-self-start font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline min-h-11 cursor-pointer">{all ? "Λιγότερα" : `Δες και τα ${list.length} banners`}</button>}
        </>
      )}
      {msg && <p role="status" className="m-0 rounded-lg bg-eu-chip px-3 py-2 text-eu-navy font-bold text-[length:var(--fs-14)]">{msg}</p>}
    </div>
  );
}
