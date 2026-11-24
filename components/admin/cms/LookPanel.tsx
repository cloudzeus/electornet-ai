"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Ban, Check, ChevronDown, ClipboardPaste, Copy, Grid3x3, ImageIcon, Laptop, Maximize, Minus, MoveHorizontal, Palette, Plus, RotateCcw, Smartphone, Square, Tablet, TriangleAlert, Type, Undo2, type LucideIcon } from "lucide-react";
import { contrast, hex, lookBase, lookCount, lookFor, luminance, MARGIN_STEPS, pasteLook, patternCss, safeImage, type BgFit, type BgPattern, type Look, type LookDevice, type LookFields, type LookOverride } from "@/lib/cms/look";
import { ImageUrlField } from "@/components/admin/promos/ImageUrlField";
import { sx } from "@/components/ui/sx";

/**
 * Ο πίνακας «Εμφάνιση» — ίδιος παντού όπου στήνονται ζώνες (components της συλλογής, ενότητες αρχικής, σελίδες προσφορών):
 * φόντο (χρώμα, εικόνα με τρόπο απλώματος, μοτίβο), χρώματα κειμένων με ένδειξη αν διαβάζονται, περιθώρια ανά πλευρά.
 * Τρεις προβολές: ο υπολογιστής είναι η βάση· tablet και κινητό κρατούν μόνο ό,τι αλλάζει εκεί.
 */
export type LookGroup = "bg" | "text" | "space";

/** Η συσκευή της προεπισκόπησης του editor: όταν υπάρχει, ο πίνακας και η προεπισκόπηση αλλάζουν μαζί. */
export const LookDeviceContext = createContext<[LookDevice, (d: LookDevice) => void] | null>(null);

const DEVICES: { key: LookDevice; label: string; at: string; where: string; icon: LucideIcon }[] = [
  { key: "desktop", label: "Υπολογιστής", at: "στον υπολογιστή", where: "από 1024px", icon: Laptop },
  { key: "tablet", label: "Tablet", at: "στο tablet", where: "768–1023px", icon: Tablet },
  { key: "mobile", label: "Κινητό", at: "στο κινητό", where: "έως 767px", icon: Smartphone },
];
const BG_COLORS: [string, string][] = [["#ffffff", "Λευκό"], ["#f3f5f9", "Ανοιχτό γκρι"], ["#122a58", "Μπλε Euronics"], ["#f1c400", "Κίτρινο"], ["#05060f", "Μαύρο καμπάνιας"]];
const TEXT_COLORS: [string, string][] = [["#ffffff", "Λευκό"], ["#1a1a1a", "Σκούρο"], ["#122a58", "Μπλε Euronics"], ["#f1c400", "Κίτρινο"], ["#c8102e", "Κόκκινο"]];
const TEXT_ROWS: { key: "kickerColor" | "titleColor" | "subColor" | "ink" | "linkColor"; label: string; help: string }[] = [
  { key: "kickerColor", label: "Υπέρτιτλος", help: "Η μικρή γραμμή πάνω από τον τίτλο." },
  { key: "titleColor", label: "Τίτλος", help: "Η επικεφαλίδα της ζώνης." },
  { key: "subColor", label: "Υπότιτλος", help: "Το κείμενο κάτω από τον τίτλο και τα δευτερεύοντα κείμενα." },
  { key: "ink", label: "Υπόλοιπο κείμενο", help: "Ό,τι δεν έχει δικό του χρώμα πιο πάνω." },
  { key: "linkColor", label: "Σύνδεσμοι", help: "Π.χ. «Όλες οι προσφορές»." },
];
const FITS: { value: BgFit; label: string; help: string; icon: LucideIcon }[] = [
  { value: "cover", label: "Γέμισμα", help: "Καλύπτει όλη τη ζώνη· κόβεται στις άκρες.", icon: Maximize },
  { value: "width", label: "Όλο το πλάτος", help: "Φαίνεται ολόκληρη στο πλάτος· δεν κόβεται στα πλάγια.", icon: MoveHorizontal },
  { value: "tile", label: "Πλακάκια", help: "Επαναλαμβάνεται δίπλα και κάτω, στο μέγεθός της.", icon: Grid3x3 },
];
const PATTERNS: [BgPattern, string][] = [["dots", "Κουκκίδες"], ["grid", "Πλέγμα"], ["diag", "Διαγώνιες"], ["lines", "Γραμμές"]];
const MARGIN_PRESETS: [string, number, number][] = [["Καθόλου", 0, 0], ["Μικρά", 16, 8], ["Κανονικά", 32, 16], ["Μεγάλα", 64, 32]];
const SIDES: { key: "mt" | "mb" | "ml" | "mr"; label: string }[] = [{ key: "mt", label: "Πάνω" }, { key: "mb", label: "Κάτω" }, { key: "ml", label: "Αριστερά" }, { key: "mr", label: "Δεξιά" }];
const GROUP_KEYS: Record<LookGroup, (keyof LookFields)[]> = { bg: ["bg", "bgImage", "bgFit", "pattern"], text: ["kickerColor", "titleColor", "subColor", "ink", "linkColor"], space: ["mt", "mr", "mb", "ml", "headGap", "padY"] };

/** Η αντιγραμμένη εμφάνιση ζει στον browser (localStorage): περνά από ζώνη σε ζώνη, από σελίδα σε σελίδα και από καρτέλα σε καρτέλα. */
const CLIP = "eu.look.clip";
const onClip = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener(CLIP, cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener(CLIP, cb); }; };
const readClip = () => { try { return localStorage.getItem(CLIP); } catch { return null; } };
const tool = "inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy";

const chip = (on: boolean) => `rounded-xl border-2 px-3 min-h-11 font-bold text-[length:var(--fs-13)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`;
const sub = "text-eu-muted text-[length:var(--fs-13)] leading-snug";
const legend = "font-bold text-eu-ink text-[length:var(--fs-14)]";

export function LookPanel({ value, onChange, groups = ["bg", "text", "space"], inner = false, what = "της ζώνης" }: {
  value: Look; onChange: (l: Look) => void;
  /** ποιες ομάδες ρυθμίσεων ισχύουν εδώ */ groups?: LookGroup[];
  /** και τα κενά ΜΕΣΑ στη ζώνη (τίτλος → περιεχόμενο, πάνω-κάτω) — μόνο όπου τα διαβάζει το component */ inner?: boolean;
  what?: string;
}) {
  const shared = useContext(LookDeviceContext);
  const local = useState<LookDevice>("desktop");
  const [device, setDevice] = shared ?? local;
  const f = lookFor(value, device);
  const base = lookFor(value, "desktop");
  const dev = DEVICES.find((d) => d.key === device)!;
  const total = DEVICES.reduce((n, d) => n + lookCount(value, d.key), 0);
  const [pickImage, setPickImage] = useState(false);
  const [linkV, setLinkV] = useState((f.mt ?? 0) === (f.mb ?? 0));
  const [linkH, setLinkH] = useState((f.ml ?? 0) === (f.mr ?? 0));

  /** Γράφει στη συσκευή που φαίνεται: στον υπολογιστή αλλάζει η βάση· αλλού κρατιέται μόνο ό,τι διαφέρει από τη βάση. */
  const put = (patch: LookOverride) => {
    const next = { ...value } as Record<string, unknown>;
    if (device === "desktop") { for (const [k, v] of Object.entries(patch)) { if (v == null) delete next[k]; else next[k] = v; } return onChange(next as Look); }
    const over = { ...(value[device] ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) { if ((v ?? null) === ((base as Record<string, unknown>)[k] ?? null)) delete over[k]; else over[k] = v ?? null; }
    if (Object.keys(over).length) next[device] = over; else delete next[device];
    onChange(next as Look);
  };
  const owns = (g: LookGroup) => device !== "desktop" && GROUP_KEYS[g].some((k) => k in (value[device] ?? {}));
  const likeDesktop = (g: LookGroup) => { const over = { ...(value[device as "tablet" | "mobile"] ?? {}) }; for (const k of GROUP_KEYS[g]) delete over[k]; const next = { ...value }; if (Object.keys(over).length) next[device as "tablet" | "mobile"] = over; else delete next[device as "tablet" | "mobile"]; onChange(next); };
  const head = (g: LookGroup, Icon: LucideIcon, title: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="size-5 shrink-0 text-eu-blue" aria-hidden /><h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{title}</h4>
      {owns(g) && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-navy pl-3 font-bold text-[length:var(--fs-13)]">Διαφέρει {dev.at}<button type="button" onClick={() => likeDesktop(g)} className="inline-flex items-center gap-1 rounded-full px-2 min-h-11 md:min-h-9 underline hover:bg-white"><Undo2 className="size-3.5" aria-hidden /> Όπως ο υπολογιστής</button></span>}
    </div>
  );

  const img = safeImage(f.bgImage);
  const layer: "none" | "image" | "pattern" = img || (pickImage && !f.pattern) ? "image" : f.pattern ? "pattern" : "none";
  const surface = lookBase(f);
  const dark = luminance(surface) < 0.4;
  const hasMargin = SIDES.some((s) => f[s.key]);
  const setSide = (k: "mt" | "mb" | "ml" | "mr", n: number) => {
    const v = Math.max(0, Math.min(160, Math.round(n))) || undefined;
    const vertical = k === "mt" || k === "mb";
    put(vertical && linkV ? { mt: v, mb: v } : !vertical && linkH ? { ml: v, mr: v } : { [k]: v });
  };
  const stepSide = (k: "mt" | "mb" | "ml" | "mr", d: 1 | -1) => { const cur = f[k] ?? 0; const n = d > 0 ? MARGIN_STEPS.find((s) => s > cur) ?? 160 : [...MARGIN_STEPS].reverse().find((s) => s < cur) ?? 0; setSide(k, n); };
  // μικρογραφία: η ζώνη μέσα στη σελίδα, με τα περιθώρια σε κλίμακα και το δικό της χρώμα
  const box = sx({ padding: `${(f.mt ?? 0) * 0.3}px ${(f.mr ?? 0) * 0.3}px ${(f.mb ?? 0) * 0.3}px ${(f.ml ?? 0) * 0.3}px` });
  const zoneSw = sx({ background: surface });
  const [open0] = useState(total > 0);
  // αντιγραφή / επικόλληση: από την αντιγραμμένη ζώνη μπαίνουν μόνο όσα ισχύουν εδώ
  const clipRaw = useSyncExternalStore(onClip, readClip, () => null);
  const allowed = useMemo(() => groups.flatMap((g) => GROUP_KEYS[g]).filter((k) => inner || (k !== "headGap" && k !== "padY")), [groups, inner]);
  const pasted = useMemo(() => { try { const o: unknown = clipRaw ? JSON.parse(clipRaw) : null; return o && typeof o === "object" && !Array.isArray(o) ? pasteLook(value, o as Look, allowed) : null; } catch { return null; } }, [clipRaw, value, allowed]);
  const pasteCount = pasted ? DEVICES.reduce((n, d) => n + lookCount(pasteLook({}, pasted, allowed), d.key), 0) : 0;
  // επικόλληση που δεν θα άλλαζε τίποτα (η ίδια η ζώνη, ή ζώνη που την έχει ήδη) δεν προτείνεται
  const same = !!pasted && JSON.stringify(pasted) === JSON.stringify(value);
  const [note, setNote] = useState<string | null>(null);
  const copy = () => { try { localStorage.setItem(CLIP, JSON.stringify(value)); window.dispatchEvent(new Event(CLIP)); setNote("Αντιγράφηκε. Άνοιξε μια άλλη ζώνη και πάτα «Επικόλληση» στην «Εμφάνισή» της."); } catch { setNote("Ο browser δεν επέτρεψε την αντιγραφή."); } };

  return (
    <details data-help="look.panel" className="group/look rounded-2xl border border-eu-line bg-white" open={open0 || undefined}>
      <summary className="list-none cursor-pointer flex items-center gap-2 px-3 @md:px-4 min-h-12">
        <Palette className="size-5 shrink-0 text-eu-blue" aria-hidden />
        <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Εμφάνιση</span><span className={`text-[length:var(--fs-13)] ${total ? "text-eu-ink-2 font-bold" : "text-eu-muted"}`}>{total ? `${total} ${total === 1 ? "δική σου ρύθμιση" : "δικές σου ρυθμίσεις"}` : `${groups.map((g) => (g === "bg" ? "φόντο" : g === "text" ? "χρώματα κειμένων" : "περιθώρια")).join(", ").replace(/^./, (c) => c.toUpperCase())} · όπως το σχέδιο`}</span></span>
        <ChevronDown className="ml-auto size-5 shrink-0 transition-transform group-open/look:rotate-180" aria-hidden />
      </summary>
      <div className="@container px-3 @md:px-4 pb-4 grid gap-5">
        <div data-help="look.devices" className="grid gap-2">
          <div role="radiogroup" aria-label="Συσκευή" className="grid grid-cols-3 gap-1 rounded-2xl bg-eu-surface p-1">
            {DEVICES.map((d) => { const n = d.key === "desktop" ? 0 : lookCount(value, d.key); return (
              <button key={d.key} type="button" role="radio" aria-checked={device === d.key} onClick={() => setDevice(d.key)} className={`grid justify-items-center gap-0.5 rounded-xl px-1 py-1.5 min-h-12 font-bold text-[length:var(--fs-13)] ${device === d.key ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-white"}`}>
                <span className="inline-flex items-center gap-1.5"><d.icon className="size-4" aria-hidden />{d.label}</span>
                <span className={`font-normal text-[length:var(--fs-12)] ${device === d.key ? "text-white/85" : "text-eu-muted"}`}>{n ? `${n} ${n === 1 ? "αλλαγή" : "αλλαγές"}` : d.where}</span>
              </button>
            ); })}
          </div>
          <p className={`m-0 ${sub}`}>{device === "desktop" ? "Ο υπολογιστής είναι η βάση. Tablet και κινητό τον ακολουθούν, εκτός αν αλλάξεις κάτι εκεί." : `Αλλάζεις μόνο ό,τι φαίνεται ${dev.at}. Ό,τι δεν πειράξεις εδώ ακολουθεί τον υπολογιστή.`}</p>
        </div>

        {groups.includes("bg") && (
          <section data-help="look.bg" className="grid gap-3 border-t border-eu-line pt-4">
            {head("bg", ImageIcon, "Φόντο")}
            <Swatches label="Χρώμα" value={hex(f.bg) ?? ""} colors={BG_COLORS} autoLabel="Χωρίς χρώμα" onChange={(v) => put({ bg: v || undefined })} help={`Πίσω από το περιεχόμενο ${what}, σε όλο το πλάτος. Σε σκούρο χρώμα τα κείμενα γίνονται μόνα τους ανοιχτά.`} />
            <fieldset className="m-0 p-0 border-0 grid gap-1.5 min-w-0">
              <legend className={`${legend} mb-1`}>Πάνω από το χρώμα</legend>
              <div className="flex flex-wrap gap-1.5">
                {([["none", "Τίποτα", Square], ["image", "Εικόνα", ImageIcon], ["pattern", "Μοτίβο", Grid3x3]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" aria-pressed={layer === k} onClick={() => { setPickImage(k === "image"); put(k === "none" ? { bgImage: undefined, pattern: undefined } : k === "image" ? { pattern: undefined } : { bgImage: undefined, pattern: f.pattern ?? "dots" }); }} className={`inline-flex items-center gap-1.5 ${chip(layer === k)}`}><Icon className="size-4" aria-hidden />{label}</button>
                ))}
              </div>
            </fieldset>
            {layer === "image" && <>
              <ImageUrlField label="Εικόνα φόντου" value={f.bgImage ?? ""} onChange={(v) => put({ bgImage: v || undefined })} help={hex(f.bg) ? "Με χρώμα από πάνω, τα κείμενα ακολουθούν το χρώμα· για ανοιχτή εικόνα διάλεξε ανοιχτό χρώμα." : "Χωρίς χρώμα μπαίνει σκούρο πέπλο και τα κείμενα γίνονται λευκά, για να διαβάζονται."} />
              <fieldset className="m-0 p-0 border-0 grid gap-1.5 min-w-0">
                <legend className={`${legend} mb-1`}>Πώς απλώνεται η εικόνα</legend>
                <div className="grid grid-cols-1 @sm:grid-cols-3 gap-2">
                  {FITS.map((o) => { const on = (f.bgFit ?? "cover") === o.value; const th = img ? sx({ backgroundImage: `url("${img}")`, backgroundSize: o.value === "cover" ? "cover" : o.value === "width" ? "100% auto" : "34% auto", backgroundRepeat: o.value === "tile" ? "repeat" : "no-repeat", backgroundPosition: o.value === "cover" ? "center" : "top center" }) : null; return (
                    <button key={o.value} type="button" aria-pressed={on} onClick={() => put({ bgFit: o.value === "cover" ? undefined : o.value })} className={`grid gap-1 text-left rounded-xl border-2 p-2 min-h-11 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
                      {th?.node}
                      <span className={`h-12 rounded-lg bg-eu-navy grid place-items-center text-white ${th?.className ?? ""}`} aria-hidden>{!th && <o.icon className="size-5" />}</span>
                      <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">{o.label}</span><span className={sub}>{o.help}</span>
                    </button>
                  ); })}
                </div>
              </fieldset>
            </>}
            {layer === "pattern" && (
              <fieldset className="m-0 p-0 border-0 grid gap-1.5 min-w-0">
                <legend className={`${legend} mb-1`}>Μοτίβο</legend>
                <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2">
                  {PATTERNS.map(([p, label]) => { const th = sx(patternCss(p, "rgba(18,42,88,.4)")); return (
                    <button key={p} type="button" aria-pressed={f.pattern === p} onClick={() => put({ pattern: p })} className={`grid gap-1 text-left rounded-xl border-2 p-2 min-h-11 ${f.pattern === p ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
                      {th.node}<span className={`h-12 rounded-lg bg-eu-surface ${th.className}`} aria-hidden /><span className="font-bold text-eu-ink text-[length:var(--fs-13)]">{label}</span>
                    </button>
                  ); })}
                </div>
                <span className={sub}>Διακριτικό, στον τόνο των κειμένων — δεν δυσκολεύει την ανάγνωση.</span>
              </fieldset>
            )}
          </section>
        )}

        {groups.includes("text") && (
          <section data-help="look.text" className="grid gap-3 border-t border-eu-line pt-4">
            {head("text", Type, "Χρώματα κειμένων")}
            <p className={`m-0 ${sub}`}>«Αυτόματο» = το χρώμα ακολουθεί το φόντο, ώστε να διαβάζεται πάντα. {img ? "Πάνω σε εικόνα, έλεγξε και την προεπισκόπηση." : ""}</p>
            {TEXT_ROWS.map((r) => { const c = hex(f[r.key]); return (
              <Swatches key={r.key} label={r.label} value={c ?? ""} colors={TEXT_COLORS} autoLabel="Αυτόματο" onChange={(v) => put({ [r.key]: v || undefined })} help={r.help} badge={c ? <Readable ratio={contrast(c, surface)} /> : null} />
            ); })}
          </section>
        )}

        {groups.includes("space") && (
          <section data-help="look.margins" className="grid gap-3 border-t border-eu-line pt-4">
            {head("space", Maximize, "Περιθώρια")}
            <p className={`m-0 ${sub}`}>{device === "desktop" ? "Το κενό γύρω από τη ζώνη. Σε tablet και κινητό μικραίνει μόνο του, εκτός αν ορίσεις δικό τους." : owns("space") ? `Δικά του περιθώρια ${dev.at}: μπαίνουν ακριβώς όπως τα γράφεις.` : "Ακολουθεί τον υπολογιστή, μικρότερα για να χωρούν. Άλλαξε έναν αριθμό για να ορίσεις δικά του."}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Έτοιμα περιθώρια">
              {MARGIN_PRESETS.map(([label, y, x]) => { const on = (f.mt ?? 0) === y && (f.mb ?? 0) === y && (f.ml ?? 0) === x && (f.mr ?? 0) === x; return <button key={label} type="button" aria-pressed={on} onClick={() => put({ mt: y || undefined, mb: y || undefined, ml: x || undefined, mr: x || undefined })} className={chip(on)}>{label}</button>; })}
            </div>
            <div className="grid @md:grid-cols-[9rem_minmax(0,1fr)] gap-3 items-center">
              {box.node}
              <div className={`h-28 rounded-xl border border-dashed border-eu-ink-3/40 bg-eu-surface grid ${box.className}`} aria-hidden>{zoneSw.node}<div className={`grid place-items-center font-bold text-[length:var(--fs-12)] ring-1 ring-eu-ink-3/30 ${dark ? "text-white" : "text-eu-navy"} ${hasMargin ? "rounded-md" : "rounded-xl"} ${zoneSw.className}`}>Ζώνη</div></div>
              <div className="grid grid-cols-1 @xs:grid-cols-2 gap-2">
                {SIDES.map((s) => (
                  <div key={s.key} className="grid gap-1 min-w-0">
                    <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{s.label}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => stepSide(s.key, -1)} disabled={!f[s.key]} aria-label={`Λιγότερο: ${s.label}`} className="size-11 shrink-0 grid place-items-center rounded-full border-2 border-eu-line hover:border-eu-navy disabled:opacity-30"><Minus className="size-4" aria-hidden /></button>
                      <span className="relative min-w-0 flex-1"><input type="number" inputMode="numeric" min={0} max={160} step={8} value={f[s.key] ?? 0} onChange={(e) => setSide(s.key, Number(e.target.value) || 0)} aria-label={`Περιθώριο ${s.label.toLowerCase()} σε px`} className="w-full rounded-xl border-2 border-eu-line pl-2 pr-7 min-h-11 text-center tabular-nums bg-white text-[length:var(--fs-15)]" /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-eu-muted text-[length:var(--fs-12)]" aria-hidden>px</span></span>
                      <button type="button" onClick={() => stepSide(s.key, 1)} disabled={(f[s.key] ?? 0) >= 160} aria-label={`Περισσότερο: ${s.label}`} className="size-11 shrink-0 grid place-items-center rounded-full border-2 border-eu-line hover:border-eu-navy disabled:opacity-30"><Plus className="size-4" aria-hidden /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <label className="inline-flex items-center gap-2 min-h-11 text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" checked={linkV} onChange={(e) => setLinkV(e.target.checked)} className="size-5 accent-eu-navy" />Ίδιο πάνω και κάτω</label>
              <label className="inline-flex items-center gap-2 min-h-11 text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" checked={linkH} onChange={(e) => setLinkH(e.target.checked)} className="size-5 accent-eu-navy" />Ίδιο αριστερά και δεξιά</label>
            </div>
            {inner && (
              <details data-help="zones.spacing" className="group/in rounded-xl bg-eu-surface">
                <summary className="list-none cursor-pointer flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Κενά μέσα στη ζώνη<ChevronDown className="ml-auto size-4 transition-transform group-open/in:rotate-180" aria-hidden /></summary>
                <div className="grid gap-3 px-3 pb-3">
                  {([["headGap", "Τίτλος → περιεχόμενο", "Το κενό ανάμεσα στον τίτλο και σε ό,τι ακολουθεί."], ["padY", "Πάνω και κάτω, μέσα στο φόντο", "Το κενό πριν και μετά το περιεχόμενο, μέσα στη ζώνη."]] as const).map(([k, label, help]) => (
                    <div key={k} className="grid gap-1">
                      <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{label}</span>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
                        {([[undefined, "Κανονική"], [0, "Κολλητά"], [1, "Μικρή"], [2, "Μεσαία"], [3, "Μεγάλη"]] as const).map(([v, t]) => <button key={t} type="button" aria-pressed={f[k] === v} onClick={() => put({ [k]: v })} className={`${chip(f[k] === v)} bg-white`}>{t}</button>)}
                      </div>
                      <span className={sub}>{help}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        <div data-help="look.copy" className="grid gap-2 border-t border-eu-line pt-4">
          <div className="flex flex-wrap gap-2">
            {total > 0 && <button type="button" onClick={copy} className={tool}><Copy className="size-4" aria-hidden /> Αντιγραφή εμφάνισης</button>}
            {pasted && pasteCount > 0 && !same && <button type="button" onClick={() => { onChange(pasted); setNote(`Επικολλήθηκε: ${pasteCount} ${pasteCount === 1 ? "ρύθμιση" : "ρυθμίσεις"} από την άλλη ζώνη.`); }} className={`${tool} border-eu-navy text-eu-navy`}><ClipboardPaste className="size-4" aria-hidden /> Επικόλληση ({pasteCount})</button>}
            {total > 0 && <button type="button" onClick={() => { if (window.confirm("Να σβηστούν όλες οι ρυθμίσεις εμφάνισης, σε όλες τις συσκευές;")) { onChange({}); setNote(null); } }} className={tool}><RotateCcw className="size-4" aria-hidden /> Επαναφορά στο σχέδιο</button>}
          </div>
          {note ? <p role="status" className="m-0 inline-flex items-start gap-1.5 text-eu-green font-bold text-[length:var(--fs-13)]"><Check className="size-4 mt-0.5 shrink-0" aria-hidden />{note}</p>
            : pasted && pasteCount > 0 && !same ? <p className={`m-0 ${sub}`}>Έχεις αντιγράψει την εμφάνιση μιας άλλης ζώνης. Η επικόλληση αντικαθιστά τις ρυθμίσεις αυτής εδώ, σε όλες τις συσκευές{groups.length < 3 ? " (μόνο όσα ισχύουν εδώ)" : ""}.</p>
            : total === 0 ? <p className={`m-0 ${sub}`}>Όταν ρυθμίσεις μια ζώνη, μπορείς να αντιγράψεις την εμφάνισή της σε άλλη.</p> : null}
        </div>
      </div>
    </details>
  );
}

/** Επιλογή χρώματος: «αυτόματο», έτοιμα χρώματα της μάρκας, δικό σου χρώμα — πάντα με το όνομα ή τον κωδικό δίπλα. */
function Swatches({ label, value, colors, autoLabel, onChange, help, badge }: { label: string; value: string; colors: [string, string][]; autoLabel: string; onChange: (v: string) => void; help?: string; badge?: ReactNode }) {
  const name = value ? colors.find(([c]) => c === value.toLowerCase())?.[1] ?? value : autoLabel;
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-1 min-w-0">
      <legend className="contents"><span className="flex flex-wrap items-center justify-between gap-x-2"><span className={legend}>{label} <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">· {name}</span></span>{badge}</span></legend>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={!value} onClick={() => onChange("")} title={autoLabel} aria-label={`${label}: ${autoLabel}`} className={`size-11 grid place-items-center rounded-full border-2 ${!value ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-transparent text-eu-muted hover:border-eu-line"}`}><Ban className="size-5" aria-hidden /></button>
        {colors.map(([c, n]) => { const s = sx({ background: c }); const on = value.toLowerCase() === c; return (
          <button key={c} type="button" aria-pressed={on} onClick={() => onChange(c)} title={n} aria-label={`${label}: ${n}`} className={`size-11 grid place-items-center rounded-full border-2 ${on ? "border-eu-navy" : "border-transparent hover:border-eu-line"}`}>{s.node}<span className={`size-7 rounded-full ring-1 ring-eu-ink-3/40 ${s.className}`} aria-hidden /></button>
        ); })}
        <input type="color" value={value || "#122a58"} onChange={(e) => onChange(e.target.value)} title="Δικό σου χρώμα" aria-label={`${label}: δικό σου χρώμα`} className="size-11 rounded-lg border-2 border-eu-line bg-white p-0.5 cursor-pointer" />
      </div>
      {help && <span className={sub}>{help}</span>}
    </fieldset>
  );
}

/** Αν το χρώμα διαβάζεται πάνω στο φόντο (αντίθεση WCAG): 4,5 και πάνω καλά, 3–4,5 οριακά, κάτω από 3 δύσκολα. */
function Readable({ ratio }: { ratio: number }) {
  const ok = ratio >= 4.5, mid = ratio >= 3;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${ok ? "bg-eu-green/10 text-eu-green" : mid ? "bg-eu-amber/15 text-eu-ink-2" : "bg-eu-red/10 text-eu-red"}`}>{ok ? <Check className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}{ok ? "Διαβάζεται καλά" : mid ? "Οριακά" : "Δύσκολα διαβάζεται"}</span>;
}
