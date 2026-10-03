"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Box, X, Smartphone, RotateCcw, Ruler, Copy, Check, ExternalLink } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import type { Dims } from "@/lib/data/dims";
import type { Product } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";
import { priceLong } from "@/lib/format";
import { useCart } from "@/components/commerce/CartProvider";
import { SURFACE_LABEL, SURFACE_TARGET, anchorOf, type Surface } from "@/lib/ar/placement";
import { detectEnv, type ArEnv as Env } from "@/lib/ar/env";

const c = copyOf("ar");
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

type TvLayout = { panelH: number; panelD: number; standH: number; standD: number };

/**
 * @dynamic «Δες το στον χώρο σου»: ο όγκος της συσκευής σε πραγματική κλίμακα, με τη φωτογραφία της στην πρόσοψη και
 * τις διαστάσεις ψημένες πάνω του. Στο κινητό ανοίγει κατευθείαν το εγγενές AR (ένα αντικείμενο — χωρίς ενδιάμεσο
 * παράθυρο)· η προεπισκόπηση 3D με τις διαστάσεις είναι δεύτερη επιλογή και η διέξοδος όπου το AR δεν ανοίγει.
 * Τα μοντέλα χτίζονται στο /api/ar/{id}/model.{glb,usdz} από τις ελεγμένες διαστάσεις (βλ. arPlan).
 */
export function ArButton({ id, title, dims, tv, version = "", ios = true, light = false, surface = "floor", alt, hint, buy, className = "" }: {
  id: string; title: string; dims: Dims | null;
  /** τηλεόραση: πάνελ και βάση (εκ.), για να μπουν σωστά οι ετικέτες της προεπισκόπησης */
  tv?: TvLayout;
  /** πού μπαίνει η συσκευή (προφίλ κατηγορίας ή επιλογή διαχειριστή) */ surface?: Surface;
  /** δεύτερη επιφάνεια για τον πελάτη (π.χ. τηλεόραση στον τοίχο) */ alt?: Surface;
  /** «Πού μπαίνει» — οδηγία για τον πελάτη */ hint?: string;
  /** υπάρχει ελαφριά έκδοση για αργές συνδέσεις */ light?: boolean;
  /** υπάρχει USDZ; αλλιώς το model-viewer μετατρέπει το GLB για το Quick Look μέσα στη συσκευή */ ios?: boolean;
  /** αποτύπωμα του μοντέλου — αλλάζει το URL όταν αλλάξουν διαστάσεις/φωτογραφία, ώστε να μην μείνει παλιό στην cache */ version?: string;
  /** «Προσθήκη στο καλάθι» μέσα στο AR του iPhone */ buy?: { product: Product; price: number };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "ar">("loading");
  const [progress, setProgress] = useState(0);
  const [canAr, setCanAr] = useState<boolean | null>(null);
  const [env, setEnv] = useState<Env | null>(null);
  /** ήρθαμε από αποτυχημένο Scene Viewer (λείπει η εφαρμογή Google / ARCore): χωρίς ξανά το ίδιο κουμπί */
  const [noSceneViewer, setNoSceneViewer] = useState(false);
  /** Android: πατήθηκε το AR αλλά η σελίδα έμεινε μπροστά — κάτι δεν άνοιξε */
  const [stuck, setStuck] = useState(false);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const mvRef = useRef<(HTMLElement & { cameraOrbit?: string; activateAR?: () => Promise<void> }) | null>(null);
  const { add } = useCart();
  void light; // ο server σερβίρει την ελαφριά έκδοση όταν υπάρχει· η πλήρης ζητείται μόνο ρητά με ?q=full

  const placement = anchorOf(surface);
  const glbFor = (sf: Surface) => `/api/ar/${id}/model.glb?v=${version}&p=${sf}`;
  const usdzFor = (sf: Surface) => `/api/ar/${id}/model.usdz?v=${version}&p=${sf}`; // το p στο URL: άλλη επιφάνεια = άλλο αρχείο, όχι παλιό από την cache
  const isQl = env === "quicklook";
  // Προεπισκόπηση: χωρίς ψημένες ετικέτες, με ζωντανές HTML ετικέτες. Εξαίρεση το iPhone χωρίς USDZ, όπου το AR βγαίνει από τη σκηνή της προεπισκόπησης.
  const liveLabels = !!dims && !(isQl && !ios);
  const previewGlb = liveLabels ? `${glbFor(surface)}&labels=0` : glbFor(surface);

  /**
   * Quick Look: αρχείο + παράμετροι στο fragment. Πραγματικό μέγεθος (χωρίς τσίμπημα για μεγέθυνση), κοινοποίηση της
   * σελίδας αντί για το αρχείο, και — όταν αγοράζεται — μπάρα με τιμή και «Προσθήκη στο καλάθι».
   */
  const qlHref = (sf: Surface) => {
    const page = typeof location === "undefined" ? "" : `${location.origin}${location.pathname}`;
    const q = new URLSearchParams({ allowsContentScaling: "0", ...(page ? { canonicalWebPageURL: page } : {}) });
    if (buy) { q.set("callToAction", "Προσθήκη στο καλάθι"); q.set("checkoutTitle", title); q.set("checkoutSubtitle", "Euronics"); q.set("price", priceLong(buy.price)); }
    return `${usdzFor(sf)}#${q.toString().replace(/\+/g, "%20")}`;
  };
  // Το Quick Look στέλνει «message» στο <a rel="ar"> όταν πατηθεί το κουμπί της μπάρας. Ένας listener ανά στοιχείο,
  // που καλεί πάντα την τρέχουσα εκδοχή (το add του καλαθιού αλλάζει με την κατάστασή του).
  const onBuy = useRef<() => void>(() => {});
  useEffect(() => {
    onBuy.current = () => { if (!buy) return; add({ ...buy.product, price: buy.price }, { openMiniCart: true }); setAdded(true); };
  }, [buy, add]);
  const qlRef = useCallback((a: HTMLAnchorElement | null) => {
    if (!a || a.dataset.euQl) return;
    a.dataset.euQl = "1";
    a.addEventListener("message", (e) => { if ((e as MessageEvent).data === "_apple_ar_quicklook_button_tapped") onBuy.current(); });
  }, []);

  // Android: intent προς το Scene Viewer με το GLB μας (απόλυτο https URL), σε πραγματικό μέγεθος. Αν λείπει η εφαρμογή
  // Google, ο Chrome πηγαίνει στο fallback: η ίδια σελίδα με ?ar=3d, που ανοίγει την προεπισκόπηση χωρίς αυτό το κουμπί.
  const sceneViewer = (sf: Surface = surface) => {
    const page = `${location.origin}${location.pathname}`;
    const file = `${location.origin}${glbFor(sf)}`;
    return `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(file)}&mode=ar_preferred&resizable=false${anchorOf(sf) === "wall" ? "&enable_vertical_placement=true" : ""}&title=${encodeURIComponent(title)}&link=${encodeURIComponent(page)}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(`${page}?ar=3d`)};end;`;
  };
  // Άνοιγμα της σελίδας στον Chrome από browser εφαρμογής (Android)
  const inChrome = () => `intent://${location.host}${location.pathname}?ar=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`${location.origin}${location.pathname}`)};end;`;
  /** Μετά το πάτημα στο Android: αν σε 3″ η σελίδα είναι ακόμη μπροστά, το AR δεν άνοιξε — δείχνουμε διέξοδο. */
  const watchLaunch = () => {
    setStuck(false);
    let left = false;
    const away = () => { left = true; };
    document.addEventListener("visibilitychange", away, { once: true });
    window.addEventListener("blur", away, { once: true });
    window.addEventListener("pagehide", away, { once: true });
    setTimeout(() => {
      document.removeEventListener("visibilitychange", away); window.removeEventListener("blur", away); window.removeEventListener("pagehide", away);
      if (!left && document.visibilityState === "visible") setStuck(true);
    }, 3000);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setEnv(detectEnv());
      // Βαθύς σύνδεσμος: ?ar=1 από το QR · ?ar=3d από το fallback του Scene Viewer. Ανοίγει μία φορά και φεύγει από το URL.
      const sp = new URLSearchParams(location.search);
      const v = sp.get("ar");
      if (v === "1" || v === "3d") {
        if (v === "3d") setNoSceneViewer(true);
        setOpen(true);
        sp.delete("ar");
        const rest = sp.toString();
        history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Παράθυρο: κλείδωμα κύλισης της σελίδας, εστίαση στο κλείσιμο και επιστροφή της εστίασης στο κουμπί, Escape
  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = "hidden";
    // εστίαση στο κλείσιμο μόνο με ποντίκι/πληκτρολόγιο· στην αφή θα έβγαζε δαχτυλίδι εστίασης χωρίς λόγο
    const f = setTimeout(() => { if (matchMedia("(pointer: fine)").matches) closeRef.current?.focus(); }, 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(f); html.style.overflow = prev; window.removeEventListener("keydown", onKey); triggerRef.current?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (!open || !env) return;
    let alive = true;
    import("@google/model-viewer").then(() => {
      if (!alive || !holder.current) return;
      holder.current.innerHTML = "";
      const mv = document.createElement("model-viewer") as HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void>; cameraOrbit?: string };
      mvRef.current = mv;
      mv.setAttribute("src", previewGlb);
      // Το Quick Look ανοίγει από τα δικά μας <a rel="ar">· το Quick Look του viewer μόνο όταν δεν υπάρχει USDZ (το φτιάχνει
      // από το GLB). Με ios-src + quick-look ενεργά, το iPhone άνοιγε το Quick Look μόνο του, χωρίς πάτημα.
      mv.setAttribute("alt", title);
      mv.setAttribute("ar", "");
      // Στο Android το Scene Viewer ανοίγει από το δικό μας κουμπί· εδώ μόνο WebXR, για όταν λείπει το Scene Viewer
      mv.setAttribute("ar-modes", env === "quicklook" && !ios ? "quick-look" : env === "desktop" ? "webxr quick-look" : "webxr");
      mv.setAttribute("ar-scale", "fixed"); // πραγματικό μέγεθος: ο πελάτης δεν μπορεί να το μεγεθύνει με τα δάχτυλα
      mv.setAttribute("ar-placement", placement);
      mv.setAttribute("camera-controls", "");
      mv.setAttribute("touch-action", "none"); // μέσα στο παράθυρο δεν υπάρχει σελίδα να κυλήσει: κάθε σύρσιμο γυρίζει το μοντέλο
      mv.setAttribute("interaction-prompt", "none");
      mv.setAttribute("loading", "eager");
      mv.setAttribute("camera-orbit", "32deg 74deg auto"); // από μπροστά-δεξιά: φαίνονται πρόσοψη και οι ετικέτες ύψους/βάθους στη δεξιά έδρα
      mv.setAttribute("min-camera-orbit", "auto 20deg auto");
      mv.setAttribute("max-camera-orbit", "auto 92deg auto");
      mv.setAttribute("field-of-view", "26deg");
      mv.setAttribute("shadow-intensity", "1.4");
      mv.setAttribute("shadow-softness", "0.7");
      mv.setAttribute("exposure", "1");
      mv.setAttribute("environment-image", "neutral");
      mv.setAttribute("xr-environment", "");
      mv.style.width = "100%";
      mv.style.height = "100%";
      mv.style.background = "radial-gradient(70% 60% at 50% 62%, #ffffff 0%, #eef2f9 100%)";
      mv.style.setProperty("--progress-bar-color", "transparent"); // δική μας μπάρα προόδου
      // Μετά τη φόρτωση ξανακεντράρουμε: με το αρχικό auto-framing πριν φορτώσει, η κάμερα μπορεί να μείνει σε παράξενη γωνία
      mv.addEventListener("load", () => { if (alive) { setStatus("ready"); setCanAr(!!mv.canActivateAR); mv.cameraOrbit = "32deg 74deg auto"; } });
      mv.addEventListener("progress", (e) => { if (alive) setProgress((e as unknown as CustomEvent<{ totalProgress: number }>).detail?.totalProgress ?? 0); });
      mv.addEventListener("error", () => alive && setStatus("error"));
      mv.addEventListener("ar-status", (e) => { const s = (e as CustomEvent<{ status: string }>).detail?.status; if (alive) setStatus(s === "session-started" || s === "object-placed" ? "ar" : "ready"); });
      // Ζωντανές ετικέτες διαστάσεων (hotspots): HTML, άρα κοιτούν πάντα τον χρήστη. Κάθε διάσταση υπάρχει σε δύο
      // απέναντι ακμές· το model-viewer σημαδεύει με data-visible όποια κοιτά την κάμερα, κι εμείς την «πετάμε» μέσα.
      if (liveLabels && dims) {
        for (const [k, pos, normal, letter, value, i] of hotspots(dims, tv, placement === "wall")) {
          const hs = document.createElement("div");
          hs.setAttribute("slot", `hotspot-${k}`);
          hs.setAttribute("data-position", pos);
          hs.setAttribute("data-normal", normal);
          hs.setAttribute("data-visibility-attribute", "visible"); // χωρίς αυτό το model-viewer δεν σημαδεύει ποια ετικέτα κοιτά την κάμερα
          hs.className = "eu-dim";
          hs.style.setProperty("--i", String(i));
          hs.innerHTML = `<span class="eu-dim-pill"><b>${letter}</b>${value.toLocaleString("el-GR")}<small>εκ.</small></span>`;
          mv.appendChild(hs);
        }
      }
      // Σήμα Euronics και το κουμπί AR του viewer (μόνο όπου δεν έχουμε δικό μας): παιδιά του <model-viewer>, άρα και μέσα στο WebXR.
      const brand = document.createElement("img");
      brand.src = "/design/euronics-logo.png";
      brand.alt = "Euronics";
      brand.className = "pointer-events-none absolute left-4 top-4 h-6 w-auto opacity-90 drop-shadow";
      mv.appendChild(brand);
      const btn = document.createElement("button");
      btn.setAttribute("slot", "ar-button");
      btn.dataset.euSlot = "1";
      btn.className = "absolute left-1/2 -translate-x-1/2 bottom-4 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-12 shadow-[var(--shadow-overlay)]";
      btn.style.fontSize = "var(--fs-15)";
      btn.textContent = "Άνοιξε σε AR στον χώρο σου";
      mv.appendChild(btn);
      holder.current.appendChild(mv);
    }).catch(() => alive && setStatus("error"));
    if (env === "desktop") QRCode.toDataURL(`${location.origin}${location.pathname}?ar=1`, { margin: 1, width: 168, color: { dark: "#122A58", light: "#ffffff" } }).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; mvRef.current = null; };
  }, [open, env, previewGlb, ios, title, liveLabels, dims, tv, placement]);

  const sourceText = dims?.source === "eprel" ? "από το ευρωπαϊκό μητρώο EPREL, χωρίς προεξοχές όπως πόρτα ή λαβές" : dims?.source === "specs" ? "του κατασκευαστή" : "τυπικές για την κατηγορία";
  const openPreview = () => { setStatus("loading"); setProgress(0); setCanAr(null); setStuck(false); setOpen(true); };
  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}?ar=1`;
    try { await navigator.clipboard.writeText(url); } catch { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const pill = `group inline-flex items-center justify-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-navy hover:text-white transition-colors ${className}`;
  const label = <><Box className="size-4 shrink-0 transition-transform group-hover:rotate-12" aria-hidden /> Δες το στον χώρο σου</>;
  const altLabel = !alt ? "" : surface === "wall" && alt === "floor" ? "Δεν πιάνει τον τοίχο; Στο πάτωμα" : `Δες το ${SURFACE_LABEL[alt].toLowerCase()}`;
  const preview3d = <button type="button" onClick={openPreview} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 px-1 hover:underline"><Ruler className="size-4" aria-hidden /> Προβολή 3D με διαστάσεις</button>;
  // Quick Look: ανοίγει μόνο από <a rel="ar"> με ένα <img> ως πρώτο παιδί. Το ορατό κείμενο ορίζει το μέγεθος του
  // κουμπιού (χωράει σε κάθε γραμματοσειρά/οθόνη) και ο σύνδεσμος το σκεπάζει ολόκληρο από πάνω.
  const qlLink = (sf: Surface, cls: string, content: ReactNode, aria: string) => (
    // η θέση έρχεται από τον καλούντα (absolute μέσα στην προεπισκόπηση)· αλλιώς relative, για τον σύνδεσμο από πάνω
    <span className={`${/\babsolute\b/.test(cls) ? "" : "relative"} inline-flex items-center justify-center overflow-hidden focus-within:ring-2 focus-within:ring-eu-blue focus-within:ring-offset-2 ${cls}`}>
      <span aria-hidden className="pointer-events-none inline-flex items-center justify-center gap-2 whitespace-nowrap">{content}</span>
      <a rel="ar" href={qlHref(sf)} ref={qlRef} className="absolute inset-0 z-10 block outline-none" aria-label={aria}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={aria} width={1} height={1} className="block w-full h-full opacity-0" src={PIXEL} />
      </a>
    </span>
  );
  // πόσα κουμπιά κάθονται πάνω στην προεπισκόπηση (εγγενές AR + «Δεν πιάνει τον τοίχο;»)
  const launchShown = (isQl && (ios || status === "ready")) || ((env === "sceneviewer" || env === "inapp-android") && (!noSceneViewer || !!canAr));
  const wallShown = placement === "wall" && ((isQl && ios) || ((env === "sceneviewer" || env === "inapp-android") && !noSceneViewer));
  const launchReserve = wallShown ? "bottom-[8.5rem]" : launchShown ? "bottom-[5.25rem]" : "bottom-0";
  const direct = env === "quicklook" ? !!ios : env === "sceneviewer";

  // Ίδια θέση πριν και μετά το hydration (το env ξέρουμε μόνο στον browser): στον server ένα απλό κουμπί προεπισκόπησης
  const launchCls = "absolute left-1/2 -translate-x-1/2 bottom-4 z-10 inline-flex items-center justify-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-6 min-h-14 shadow-[var(--shadow-overlay)] whitespace-nowrap no-underline text-[length:var(--fs-16)]";
  const tip = placement === "wall"
    ? `Στόχευσε τον τοίχο. Η συσκευή εμφανίζεται μόλις το κινητό αναγνωρίσει τον τοίχο: κούνα το αργά δεξιά-αριστερά, με καλό φως, ξεκινώντας από σημείο με κάδρο, πρίζα ή γωνία. Σε εντελώς λευκό, άδειο τοίχο μπορεί να μην εμφανιστεί — τότε δες το στο πάτωμα.`
    : `Στόχευσε ${SURFACE_TARGET[surface]} και κούνα λίγο το κινητό μέχρι να εμφανιστεί η συσκευή· άφησέ τη στη θέση της και περπάτα γύρω της. Οι ετικέτες δείχνουν πλάτος, ύψος και βάθος.`;

  return (
    <>
      {direct ? (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          {env === "sceneviewer" ? (
            <a href={sceneViewer()} onClick={watchLaunch} className={pill}>{label}</a>
          ) : qlLink(surface, pill, label, "Δες το στον χώρο σου")}
          {preview3d}
          {alt && (env === "sceneviewer" ? (
            <a href={sceneViewer(alt)} onClick={watchLaunch} className="inline-flex items-center min-h-11 px-1 text-eu-blue font-bold text-[length:var(--fs-14)] underline">{altLabel}</a>
          ) : qlLink(alt, "rounded-full text-eu-blue font-bold text-[length:var(--fs-14)] underline min-h-11 px-1", altLabel, altLabel))}
          {stuck && (
            <span role="status" className="basis-full rounded-xl bg-eu-surface p-3 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">
              Δεν άνοιξε το AR; Το κινητό χρειάζεται την εφαρμογή Google και τις «Υπηρεσίες Google Play για AR». <button type="button" onClick={openPreview} className="font-bold text-eu-blue underline min-h-11">Δες το σε 3D με διαστάσεις</button>
            </span>
          )}
          {added && <span role="status" className="basis-full inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden /> Μπήκε στο καλάθι</span>}
          {hint && <span className="basis-full inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug max-w-[34rem]"><Box className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />{hint}</span>}
        </span>
      ) : (
        <button type="button" onClick={openPreview} className={pill}>{label}</button>
      )}
      {/* Portal: ο διάλογος πρέπει να βγει από προγόνους με transforms, αλλιώς το `fixed` μετριέται ως προς αυτούς. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[70] overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="ar-title">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label={c.kleisimo} onClick={() => setOpen(false)} />
          <div className="absolute inset-0 h-[100dvh] @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(960px,92vw)] @md:h-[min(92dvh,700px)] bg-white @md:rounded-3xl shadow-[var(--shadow-overlay)] overflow-hidden grid grid-rows-[minmax(0,1fr)_auto] @md:grid-rows-[minmax(0,1fr)] @md:grid-cols-[minmax(0,1fr)_320px] [@media(orientation:landscape)_and_(max-height:520px)]:grid-rows-none [@media(orientation:landscape)_and_(max-height:520px)]:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative min-h-0 min-w-0 h-full bg-[#eef2f9]">
              {/* Χώρος για τα κουμπιά κάτω: το μοντέλο και οι ετικέτες του κάθονται πάνω από αυτά, όχι από κάτω τους */}
              <div ref={holder} className={`absolute inset-x-0 top-0 ${launchReserve}`} />
              {status === "loading" && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none p-6">
                  <div className="grid gap-2 justify-items-center rounded-2xl bg-white/90 px-5 py-3 shadow w-[min(80%,18rem)]">
                    <span className="text-eu-ink-3 text-[length:var(--fs-14)] text-center">Χτίζουμε το μοντέλο στις διαστάσεις του…</span>
                    <span className="block h-1.5 w-full rounded-full bg-eu-line overflow-hidden" role="progressbar" aria-label="Φόρτωση μοντέλου" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                      <span className="block h-full rounded-full bg-eu-blue transition-[width] duration-200" style={{ width: `${Math.max(6, progress * 100)}%` }} />
                    </span>
                  </div>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div className="grid gap-3 justify-items-center rounded-2xl bg-white p-4 shadow">
                    <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Το μοντέλο δεν φορτώθηκε — ίσως κόπηκε η σύνδεση.</p>
                    <button type="button" onClick={() => { setOpen(false); setTimeout(openPreview, 50); }} className="rounded-full bg-eu-navy text-white font-bold px-5 min-h-11 text-[length:var(--fs-14)]">Δοκίμασε ξανά</button>
                  </div>
                </div>
              )}
              {/* Κινητό: εγγενής εκκίνηση AR, ανεξάρτητη από το αν φόρτωσε ο viewer. Το κουμπί του viewer κρύβεται για να μην υπάρχουν δύο. */}
              {(env === "sceneviewer" || env === "inapp-android") && !noSceneViewer && <a href={sceneViewer()} onClick={watchLaunch} className={launchCls}><Box className="size-5 shrink-0" aria-hidden /> Δες το στον χώρο σου</a>}
              {env === "sceneviewer" && noSceneViewer && status === "ready" && canAr && (
                <button type="button" onClick={() => { void mvRef.current?.activateAR?.(); }} className={launchCls}><Box className="size-5 shrink-0" aria-hidden /> Δες το στον χώρο σου</button>
              )}
              {isQl && ios && qlLink(surface, launchCls, <><Box className="size-5 shrink-0" aria-hidden /> Δες το στον χώρο σου</>, "Δες το στον χώρο σου")}
              {isQl && !ios && status === "ready" && (
                <button type="button" onClick={() => { void mvRef.current?.activateAR?.(); }} className={launchCls}><Box className="size-5 shrink-0" aria-hidden /> Δες το στον χώρο σου</button>
              )}
              {/* Τοίχος: αν το κινητό δεν αναγνωρίσει τον τοίχο (λευκός, άδειος), το ίδιο μοντέλο στο πάτωμα */}
              {placement === "wall" && isQl && ios && qlLink("floor", "absolute left-1/2 -translate-x-1/2 bottom-[4.75rem] z-10 rounded-full bg-white/95 text-eu-navy font-bold shadow px-4 min-h-11 max-w-[calc(100%-2rem)] text-[length:var(--fs-14)]", "Δεν πιάνει τον τοίχο; Δες το στο πάτωμα", "Δες το στο πάτωμα")}
              {placement === "wall" && (env === "sceneviewer" || env === "inapp-android") && !noSceneViewer && (
                <a href={sceneViewer("floor")} onClick={watchLaunch} className="absolute left-1/2 -translate-x-1/2 bottom-[4.75rem] z-10 rounded-full bg-white/95 text-eu-navy font-bold shadow px-4 min-h-11 inline-flex items-center whitespace-nowrap no-underline text-[length:var(--fs-14)]">Δεν πιάνει τον τοίχο; Δες το στο πάτωμα</a>
              )}
              {env !== "desktop" && <style>{`model-viewer [data-eu-slot]{display:none!important}`}</style>}
              <style>{`
                .eu-dim{pointer-events:none;transform:translate(-50%,-50%) scale(.3) rotate(-8deg);opacity:0;transition:transform .45s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;transition-delay:calc(var(--i,0) * 60ms)}
                .eu-dim[data-visible]{transform:translate(-50%,-50%) scale(1) rotate(0);opacity:1}
                .eu-dim-pill{display:inline-flex;align-items:baseline;gap:.35em;white-space:nowrap;border-radius:999px;padding:.3em .7em .3em .3em;background:#122A58;color:#fff;font-weight:800;font-size:var(--fs-15);line-height:1;box-shadow:0 6px 18px rgba(18,42,88,.35),0 0 0 2px rgba(255,255,255,.85);animation:eu-dim-float 3.2s ease-in-out infinite;animation-delay:calc(var(--i,0) * -1s)}
                .eu-dim-pill b{display:inline-grid;place-items:center;width:1.7em;height:1.7em;border-radius:999px;background:#F1C400;color:#122A58;font-weight:800;align-self:center}
                .eu-dim-pill small{font-size:.8em;font-weight:700;opacity:.8}
                @keyframes eu-dim-float{0%,100%{translate:0 0}50%{translate:0 -4px}}
                @media (prefers-reduced-motion:reduce){.eu-dim{transition:opacity .2s}.eu-dim-pill{animation:none}}
                @media (max-width:767px){.eu-dim-pill{font-size:var(--fs-12);gap:.3em;padding:.22em .55em .22em .22em;box-shadow:0 3px 10px rgba(18,42,88,.3),0 0 0 1.5px rgba(255,255,255,.85)}.eu-dim-pill b{width:1.55em;height:1.55em}@keyframes eu-dim-float{0%,100%{translate:0 0}50%{translate:0 -2px}}}
              `}</style>
              {status === "ready" && (
                <button type="button" onClick={() => { const mv = mvRef.current; if (mv) mv.cameraOrbit = "32deg 74deg auto"; }} aria-label="Επαναφορά προβολής" className="absolute right-4 top-4 size-11 rounded-full bg-white/90 text-eu-navy inline-flex items-center justify-center shadow hover:bg-white">
                  <RotateCcw className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="p-4 @md:p-5 grid [grid-template-columns:minmax(0,1fr)] content-start gap-3 @md:gap-4 border-t @md:border-t-0 @md:border-l border-eu-line-2 min-h-0 min-w-0 max-h-[45dvh] @md:max-h-none overflow-y-auto overflow-x-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{c.ar_se_pragmatiki_klimaka}</div>
                  <h2 id="ar-title" className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] @md:text-[length:var(--fs-20)] leading-tight line-clamp-2 break-words [overflow-wrap:anywhere]">{title}</h2>
                </div>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={c.kleisimo} className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              {dims && (
                <dl className="m-0 grid grid-cols-3 gap-2">
                  {([["Πλάτος", dims.w], ["Ύψος", placement === "wall" && tv ? tv.panelH : dims.h], ["Βάθος", placement === "wall" && tv ? tv.panelD : dims.d]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-eu-surface p-2 min-w-0">
                      <dt className="m-0 text-eu-muted text-[length:var(--fs-14)]">{l}</dt>
                      <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-16)] tabular-nums whitespace-nowrap">{v.toLocaleString("el-GR")} <span className="text-eu-muted font-bold text-[length:var(--fs-13)]">εκ.</span></dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug inline-flex items-start gap-2">
                <Ruler className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
                <span>Διαστάσεις {sourceText}{tv ? (placement === "wall" ? " — χωρίς τη βάση" : " — με τη βάση") : ""}. Το μοντέλο είναι σε πραγματικό μέγεθος και δεν μεγεθύνεται.</span>
              </p>
              {hint && <p className="m-0 text-eu-ink-2 font-semibold text-[length:var(--fs-14)] leading-snug inline-flex items-start gap-2"><Box className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>{hint}</span></p>}
              {(isQl || (env === "sceneviewer" && !noSceneViewer)) && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Πάτα το κίτρινο κουμπί. {tip}</p>}
              {env === "sceneviewer" && noSceneViewer && (
                <p role="status" className="m-0 rounded-xl bg-eu-surface p-3 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">Το AR της Google δεν άνοιξε σε αυτό το κινητό (χρειάζεται η εφαρμογή Google και οι «Υπηρεσίες Google Play για AR»). {canAr ? "Δοκίμασε το κίτρινο κουμπί ή δες" : "Δες"} εδώ το μοντέλο σε 3D με τις διαστάσεις του.</p>
              )}
              {stuck && (env === "sceneviewer" || env === "inapp-android") && !noSceneViewer && (
                <p role="status" className="m-0 rounded-xl bg-eu-surface p-3 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">Δεν άνοιξε το AR; Το κινητό χρειάζεται την εφαρμογή Google και τις «Υπηρεσίες Google Play για AR». Μέχρι τότε, γύρνα το μοντέλο εδώ με το δάχτυλο.</p>
              )}
              {(env === "inapp-ios" || env === "inapp-android") && (
                <div className="grid gap-2 rounded-xl bg-eu-surface p-3">
                  <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">
                    {env === "inapp-ios"
                      ? <>Το AR ανοίγει στο <b>Safari</b>, όχι μέσα σε αυτή την εφαρμογή. Πάτα <b>⋯</b> ή το εικονίδιο της πυξίδας και διάλεξε «Άνοιγμα στο Safari» — ή αντίγραψε τον σύνδεσμο.</>
                      : <>Αν το κίτρινο κουμπί δεν ανοίγει το AR, άνοιξε τη σελίδα στον <b>Chrome</b> — μέσα σε αυτή την εφαρμογή συχνά δεν επιτρέπεται.</>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {env === "inapp-android" && <a href={inChrome()} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-4 min-h-11 no-underline text-[length:var(--fs-14)]"><ExternalLink className="size-4" aria-hidden /> Άνοιξε στον Chrome</a>}
                    <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)]">{copied ? <><Check className="size-4" aria-hidden /> Αντιγράφηκε</> : <><Copy className="size-4" aria-hidden /> Αντιγραφή συνδέσμου</>}</button>
                  </div>
                </div>
              )}
              {env === "desktop" && canAr === false && status !== "loading" && (
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Σε αυτή τη συσκευή βλέπεις την προεπισκόπηση 3D: γύρνα το με το ποντίκι, ζούμαρε με τη ροδέλα. Για να το βάλεις στον χώρο σου, άνοιξέ το από κινητό.</p>
              )}
              {env === "desktop" && canAr && (
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Πάτα «Άνοιξε σε AR». {tip}</p>
              )}
              {added && <p role="status" className="m-0 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden /> Μπήκε στο καλάθι</p>}
              {env === "desktop" && (
                <div className="hidden @md:flex items-center gap-3 rounded-xl border border-eu-line p-3">
                  {qr ? <Image src={qr} alt={c.qr_gia_anoigma_sto} width={84} height={84} unoptimized className="rounded-md" /> : <span className="size-[84px] rounded-md bg-eu-surface" />}
                  <div className="text-[length:var(--fs-14)] text-eu-ink-2 leading-snug"><Smartphone className="size-4 text-eu-blue inline mr-1" aria-hidden />{c.skanare_me_to_kinito}</div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Θέσεις των ζωντανών ετικετών (μέτρα, κέντρο βάσης στο 0). Κάθε διάσταση σε δύο απέναντι ακμές, ώστε μία να κοιτά
 * πάντα την κάμερα. Π κάτω στη μέση, Υ στην αριστερή ακμή, Β στη δεξιά πλευρά: δεν στοιβάζονται ούτε σε χαμηλές συσκευές. Τηλεόραση: πάνω στο πάνελ (που κάθεται πάνω στη βάση, λίγο πίσω από το κέντρο της) — όχι στον αέρα.
 */
function hotspots(d: Dims, tv: TvLayout | undefined, wall: boolean): [string, string, string, string, number, number][] {
  const n = (v: number) => v.toFixed(3);
  if (tv) {
    const w = d.w / 100, ph = tv.panelH / 100, pd = Math.min(0.1, Math.max(0.008, tv.panelD / 100));
    const sh = wall ? 0 : Math.max(0.02, tv.standH / 100), bd = Math.min(0.55, Math.max(0.12, tv.standD / 100));
    const pz = wall ? 0 : Math.min(0, -bd / 2 + pd / 2 + bd * 0.3);
    const front = pz + pd / 2, back = pz - pd / 2, mid = sh + ph / 2;
    const hv = wall ? tv.panelH : d.h, dv = wall ? tv.panelD : d.d;
    return [
      ["w1", `0 ${n(sh)} ${n(front)}`, "0 -0.25 1", "Π", d.w, 0], ["w2", `0 ${n(sh)} ${n(back)}`, "0 -0.25 -1", "Π", d.w, 0],
      ["h1", `${n(-w / 2)} ${n(mid)} ${n(front)}`, "0 0 1", "Υ", hv, 1], ["h2", `${n(w / 2)} ${n(mid)} ${n(back)}`, "0 0 -1", "Υ", hv, 1],
      ["d1", `${n(w / 2)} ${n(sh + ph * 0.1)} ${n(pz)}`, "1 -0.25 0", "Β", dv, 2], ["d2", `${n(-w / 2)} ${n(sh + ph * 0.1)} ${n(pz)}`, "-1 -0.25 0", "Β", dv, 2],
    ];
  }
  const w = d.w / 100, h = d.h / 100, dd = d.d / 100;
  return [
    ["w1", `0 0 ${n(dd / 2)}`, "0 -0.25 1", "Π", d.w, 0], ["w2", `0 0 ${n(-dd / 2)}`, "0 -0.25 -1", "Π", d.w, 0],
    ["h1", `${n(-w / 2)} ${n(h / 2)} ${n(dd / 2)}`, "0 0 1", "Υ", d.h, 1], ["h2", `${n(w / 2)} ${n(h / 2)} ${n(-dd / 2)}`, "0 0 -1", "Υ", d.h, 1],
    ["d1", `${n(w / 2)} 0 0`, "1 -0.25 0", "Β", d.d, 2], ["d2", `${n(-w / 2)} 0 0`, "-1 -0.25 0", "Β", d.d, 2],
  ];
}
