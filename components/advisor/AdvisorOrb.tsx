"use client";

import { isFitQuestion } from "@/lib/catalog/fit-types";
import { isEnergyQuestion } from "@/lib/catalog/energy-types";
import { useSettings } from "@/components/site/SettingsProvider";
import { tpl } from "@/lib/cms/settings";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Send, Sparkles, Store, Ruler, Zap, Scale, Mic, Square, Volume2, VolumeX, Loader2 } from "lucide-react";
import { useVoice } from "@/lib/voice/client";
import gsap from "gsap";
import { STAR_PATH } from "@/components/motion/star";
import { useAdvisor } from "./AdvisorContext";
import { useMySpace } from "@/components/space/MySpaceProvider";
import { fitVerdict } from "@/lib/space/fit";
import { StoreHandoff } from "./StoreHandoff";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("advisorOrb");

interface Msg {
  role: "user" | "advisor";
  text: string;
  chips?: { label: string; href: string }[];
}
type AnswerLike = { text: string; products: { slug: string; brand: string; title: string; price: number; fit?: string }[]; href?: { label: string; href: string } };
const CHAT_KEY = "eu-aris-chat";
const WELCOME_KEY = "eu-aris-welcomed";
const chipsOf = (ans: AnswerLike) => [
  ...ans.products.slice(0, 3).map((p) => ({ label: `${p.brand} ${p.title.split(" ").slice(0, 3).join(" ")} · ${p.price.toLocaleString("el-GR")} €${p.fit === "fits" ? " ✓" : ""}`, href: `/proion/${p.slug}` })),
  ...(ans.href ? [ans.href] : []),
];

/**
 * @dynamic AI Sales Advisor entry point: the brand star breathing in the
 * corner («ανάβει» when it has something to say about the page). Opens a
 * stage with three ready questions for the current page (product-aware),
 * streams an answer, and offers hand-off to a human at the nearest store.
 * Demo: answers are composed locally from catalogue data (dimensions, fit,
 * energy, price); production: the AI Sales Engine (OpenRouter routing,
 * pgvector retrieval, Fit-My-Space and Energy tools) behind /api/advisor
 * with SSE streaming — same message shape.
 */
export function AdvisorOrb() {
  const { product } = useAdvisor();
  const { space, setOpen: openSpace } = useMySpace();
  const { advisor } = useSettings();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [handoff, setHandoff] = useState(false);
  const askRef = useRef<((q: string) => void) | null>(null);
  const voice = useVoice();
  const greeted = useRef(false);
  // Voice: the advisor reads its answers aloud (cached audio for repeated phrases) when the speaker is on.
  const say = (text: string, key?: string) => { void voice.speak(text, key); };
  const sayRef = useRef(say);
  useEffect(() => { sayRef.current = say; });
  // Opening the panel with an empty thread greets once per session («welcome back» for returning visitors).
  useEffect(() => {
    if (open && voice.speakOn && voice.enabled && !greeted.current && msgs.length === 0) {
      greeted.current = true;
      let returning = false;
      try { returning = !!localStorage.getItem(WELCOME_KEY); } catch {}
      void voice.speak("", returning ? "welcome-back" : "welcome");
    }
    if (!open && voice.listening) voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voice.speakOn, voice.enabled]);
  // First visit: the welcome plays once per browser (after the first gesture if autoplay is blocked).
  useEffect(() => {
    if (!voice.enabled) return;
    try { if (localStorage.getItem(WELCOME_KEY)) return; } catch { return; }
    greeted.current = true;
    void voice.playPreset("welcome").then((played) => { if (played) { try { localStorage.setItem(WELCOME_KEY, new Date().toISOString()); } catch {} } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.enabled]);
  const onMic = async () => {
    if (voice.listening) { voice.stop(); return; }
    const r = await voice.listen();
    if (r.text) { ask(r.text); return; }
    if (r.error === "denied") { setMsgs((m) => [...m, { role: "advisor", text: "Δεν έχω πρόσβαση στο μικρόφωνο. Γράψε μου την ερώτησή σου." }]); say("", "mic-denied"); }
    else if (r.error === "failed") { setMsgs((m) => [...m, { role: "advisor", text: "Δεν σε άκουσα καθαρά. Μπορείς να το επαναλάβεις;" }]); say("", "not-heard"); }
    else if (r.error === "unavailable") { setMsgs((m) => [...m, { role: "advisor", text: "Η φωνητική αναγνώριση δεν είναι διαθέσιμη αυτή τη στιγμή. Γράψε μου την ερώτησή σου." }]); }
  };

  // The conversation survives navigation and reopening (session storage), so the
  // search box, product chips and the orb all continue the same thread.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_KEY);
      if (raw) { const saved = JSON.parse(raw) as Msg[]; if (Array.isArray(saved) && saved.length) setTimeout(() => setMsgs(saved), 0); }
    } catch {}
  }, []);
  useEffect(() => {
    try { if (msgs.length) sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40))); } catch {}
  }, [msgs]);

  // «Ρώτα τον Ερμή» chips anywhere on the site open the panel with the question.
  // The search box can also hand over a question it has ALREADY answered
  // ({ q, answer }): it is appended as history, not asked again.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<string | { q: string; answer?: AnswerLike }>).detail;
      setOpen(true);
      if (typeof d === "string") { setTimeout(() => askRef.current?.(d), 60); return; }
      if (d.answer) {
        const a = d.answer;
        setMsgs((m) => (m.length && m[m.length - 1].role === "advisor" && m[m.length - 2]?.text === d.q ? m : [...m, { role: "user", text: d.q }, { role: "advisor", text: a.text, chips: chipsOf(a) }]));
        sayRef.current(a.text);
      } else setTimeout(() => askRef.current?.(d.q), 60);
    };
    window.addEventListener("eu:ask", on);
    return () => window.removeEventListener("eu:ask", on);
  }, []);
  const list = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);

  // The star «lights up» for a moment when the page context changes.
  useEffect(() => {
    const el = orb.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    gsap.fromTo(
      el,
      { scale: 0.9 },
      { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.5)" },
    );
  }, [product?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, typing]);

  const allSuggestions: { q: string; a: () => Msg }[] = product
    ? [
        {
          q: "Χωράει στον χώρο μου;",
          a: () => {
            if (!product.dims)
              return {
                role: "advisor",
                text: "Δεν έχω διαστάσεις για αυτό το προϊόν ακόμη. Ρώτησέ με για κάτι άλλο ή πες μου τις διαστάσεις της εσοχής σου.",
              };
            const d = product.dims;
            if (!space)
              return {
                role: "advisor",
                text: `Είναι ${d.w} × ${d.h} × ${d.d} εκ. (Π×Υ×Β)${d.source === "category" ? ", τυπικές διαστάσεις κατηγορίας" : ""}. Πες μου το πλάτος της στενότερης πόρτας σου και θα σου απαντήσω με σιγουριά.`,
                chips: [{ label: "Ο χώρος μου", href: "#myspace" }],
              };
            const v = fitVerdict(d, space);
            if (v.kind === "fits")
              return {
                role: "advisor",
                text: `Ναι. Με πόρτα ${space.door} εκ. περνάει με ${v.margin.toFixed(0)} εκ. περιθώριο${space.niche ? " και χωράει στην εσοχή σου" : ""}. Ο τεχνικός του καταστήματος το τοποθετεί την ημέρα παράδοσης.`,
              };
            if (v.kind === "tight")
              return {
                role: "advisor",
                text: `Οριακά: περνάει με μόλις ${v.margin.toFixed(0)} εκ. Αν θες, ζήτα «παράδοση με τεχνικό» για να το φέρουν χωρίς συσκευασία.`,
              };
            return {
              role: "advisor",
              text: `Όχι, λείπουν ${v.by.toFixed(0)} εκ. ${v.where === "door" ? "στην πόρτα" : "στην εσοχή"}. Θες να σου δείξω αντίστοιχα μοντέλα που χωρούν;`,
              chips: [
                { label: "Δες όσα χωρούν", href: `/k/${product.category}` },
              ],
            };
          },
        },
        {
          q: "Πόσο ρεύμα καίει;",
          a: () => ({
            role: "advisor",
            text: product.energy
              ? `Είναι κλάσης ${product.energy}. Στη σελίδα, στο πλαίσιο «Ρεύμα σε ευρώ», βλέπεις πόσο κοστίζει τον χρόνο σε σχέση με μια παλιά συσκευή και πόσα γλιτώνεις σε 5 χρόνια.`
              : "Δεν έχει ενεργειακή σήμανση αυτή η κατηγορία. Ρώτα με για κάτι άλλο.",
          }),
        },
        {
          q: "Τι διαφορά έχει από το επόμενο μοντέλο;",
          a: () => ({
            role: "advisor",
            text: `Κάνε «Σύγκριση» με 2–3 μοντέλα από τη λίστα και θα σου πω σε τρεις προτάσεις τι αλλάζει σε τιμή, κατανάλωση και δυνατότητες.`,
            chips: [{ label: "Σύγκριση", href: "/sygkrisi" }],
          }),
        },
      ]
    : [
        {
          q: "Αθόρυβο πλυντήριο για διαμέρισμα",
          a: () => ({
            role: "advisor",
            text: "Ψάχνεις κάτι κάτω από 72 dB στο στύψιμο και με πρόγραμμα νυχτερινό. Δες τα πλυντήρια με φίλτρο θορύβου.",
            chips: [
              { label: "Πλυντήρια", href: "/k/leykes-syskeyes/plyntiria" },
            ],
          }),
        },
        {
          q: "Ποια τηλεόραση για φωτεινό σαλόνι;",
          a: () => ({
            role: "advisor",
            text: "Σε φωτεινό χώρο προτίμησε QLED/Neo QLED ή OLED με αντιανακλαστική επίστρωση (π.χ. Samsung S95F). Δες τις προτάσεις.",
            chips: [
              { label: "Τηλεοράσεις", href: "/k/eikona-ixos/tileoraseis" },
            ],
          }),
        },
        {
          q: "Θέλω να μιλήσω με το κατάστημα",
          a: () => ({
            role: "advisor",
            text: "Το κοντινότερο κατάστημα είναι το ΜΠΡΙΛΑΚΗ ΑΦΟΙ Ε.Ε. (3,6 km), ανοιχτό έως 21:00. Να ζητήσω να σε πάρουν;",
            chips: [{ label: "Καταστήματα", href: "/katastimata" }],
          }),
        },
      ];
  // στη σελίδα προϊόντος: «χωράει;» μόνο όπου ο χώρος είναι κριτήριο, «πόσο ρεύμα;» μόνο όπου υπάρχει ενεργειακή ετικέτα
  const suggestions = product ? allSuggestions.filter((s) => (product.fit || !isFitQuestion(s.q)) && (product.energy || !isEnergyQuestion(s.q))) : allSuggestions;

  const ask = (q: string, a?: () => Msg) => {
    if (!a) {
      const hit = suggestions.find((s) => s.q === q);
      if (hit) a = hit.a;
    }
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setTyping(true);
    if (a) {
      const answer = a;
      setTimeout(() => {
        setTyping(false);
        const a = answer();
        setMsgs((m) => [...m, a]);
        say(a.text);
      }, 900);
      return;
    }
    // Free text → the advisor engine (demo rules; production: LLM + retrieval).
    say("", "thinking");
    fetch(`/api/advisor?q=${encodeURIComponent(q)}${space ? `&door=${space.door}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ans: { text: string; products: { slug: string; brand: string; title: string; price: number; fit?: string }[]; href?: { label: string; href: string } } | null) => {
        setTyping(false);
        if (!ans) {
          setMsgs((m) => [...m, { role: "advisor", text: "Κάτι πήγε στραβά. Δοκίμασε ξανά ή ζήτα άνθρωπο από το κατάστημα.", chips: [{ label: "Να με πάρουν", href: "#handoff" }] }]);
          say("", "error");
          return;
        }
        setMsgs((m) => [...m, { role: "advisor", text: ans.text, chips: chipsOf(ans) }]);
        say(ans.text);
      })
      .catch(() => {
        setTyping(false);
        setMsgs((m) => [...m, { role: "advisor", text: "Δεν μπόρεσα να απαντήσω τώρα. Θες να σε πάρει το κατάστημα;", chips: [{ label: "Να με πάρουν", href: "#handoff" }] }]);
      });
  };

  useEffect(() => {
    askRef.current = (q) => ask(q);
  });

  return (
    <>
      <button
        ref={orb}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={c.symvoylos_agoras}
        aria-expanded={open}
        className={`fixed z-[60] right-4 bottom-24 @md:bottom-6 @md:right-6 size-16 rounded-full bg-eu-navy shadow-[0_16px_40px_rgba(18,42,88,.45)] flex items-center justify-center group ${open ? "opacity-0 pointer-events-none" : "opacity-100"} transition-opacity ${voice.speaking ? "ring-4 ring-eu-yellow/60 animate-pulse" : ""}`}
      >
        <span
          className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(241,196,0,.5),rgba(241,196,0,0))] blur-md eu-breathe"
          aria-hidden
        />
        <span className="relative size-14 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-white/80">
          <Image src={advisor.avatarHead} alt="" fill sizes="56px" className="object-cover scale-[1.15] translate-y-[6%] transition-transform duration-300 group-hover:scale-[1.28]" />
        </span>
        <svg viewBox="0 12 72 85" className="absolute -top-1 -right-1 size-5 eu-breathe drop-shadow" aria-hidden>
          <path d={STAR_PATH} fill="var(--eu-yellow)" />
        </svg>
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-white text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 py-2 shadow-[var(--shadow-raised)] opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all hidden @md:block">
          {product ? advisor.orb.tooltipProduct : advisor.orb.tooltip}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="advisor-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-eu-navy/55 backdrop-blur-sm"
            aria-label={c.kleisimo}
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 @md:inset-auto @md:right-6 @md:bottom-6 @md:w-[440px] max-h-[88dvh] @md:max-h-[min(720px,90dvh)] bg-white rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
            <div className="relative bg-eu-navy text-white p-4 pr-3 flex items-start gap-3 overflow-hidden">
              <span className="eu-ambient" aria-hidden />
              <span className="relative size-12 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-white/60">
                <Image src={advisor.avatarHead} alt="" fill sizes="48px" className="object-cover scale-[1.15] translate-y-[6%]" />
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1">
                  <Sparkles className="size-3.5" aria-hidden /> Ο {advisor.name} · Σύμβουλος αγοράς
                </div>
                <h2
                  id="advisor-title"
                  className="m-0 font-heading font-bold text-[length:var(--fs-18)] leading-tight truncate"
                >
                  {product
                    ? tpl(advisor.panel.titleProduct, { brand: product.brand, title: product.title })
                    : advisor.panel.title}
                </h2>
                <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-14)]">
                  {advisor.panel.subtitle}
                </p>
              </div>
              {voice.enabled && (
                <button
                  type="button"
                  onClick={() => { const v = !voice.speakOn; voice.setSpeakOn(v); setMsgs((m) => [...m, { role: "advisor", text: v ? "Η φωνή άνοιξε: θα σου απαντώ και φωναχτά." : "Η φωνή έκλεισε: θα σου απαντώ μόνο γραπτά." }]); if (v) setTimeout(() => sayRef.current("", "listening"), 50); }}
                  aria-pressed={voice.speakOn}
                  aria-label={voice.speakOn ? "Απενεργοποίηση φωνής" : "Ενεργοποίηση φωνής"}
                  title={voice.speakOn ? "Ο Ερμής μιλάει" : "Ο Ερμής γράφει μόνο"}
                  className={`relative size-11 rounded-full inline-flex items-center justify-center shrink-0 ${voice.speakOn ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}
                >
                  {voice.speakOn ? <Volume2 className={`size-5 ${voice.speaking ? "animate-pulse" : ""}`} aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={c.kleisimo}
                className="relative size-11 rounded-full bg-white/10 inline-flex items-center justify-center hover:bg-white/20 shrink-0"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div
              ref={list}
              className="overflow-y-auto p-4 grid gap-3 content-start bg-eu-surface"
            >
              {msgs.length === 0 && (
                <div className="grid gap-2">
                  <div className="text-eu-muted text-[length:var(--fs-14)] font-semibold">
                    {c.rota_me}
                  </div>
                  {suggestions.map((s) => (
                    <button
                      key={s.q}
                      type="button"
                      onClick={() => ask(s.q, s.a)}
                      className="text-left rounded-2xl bg-white border border-eu-line px-4 py-3 font-bold text-eu-ink text-[length:var(--fs-15)] hover:border-eu-blue hover:text-eu-blue transition-colors"
                    >
                      {s.q}
                    </button>
                  ))}
                </div>
              )}
              {msgs.map((m, k) => (
                <div
                  key={k}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-[length:var(--fs-15)] leading-snug ${m.role === "user" ? "justify-self-end bg-eu-navy text-white rounded-br-md" : "justify-self-start bg-white border border-eu-line text-eu-ink rounded-bl-md"}`}
                >
                  {m.text}
                  {m.chips && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips.map((c) =>
                        c.href === "#handoff" ? (
                          <button key={c.label} type="button" onClick={() => setHandoff(true)} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue font-extrabold text-[length:var(--fs-14)] px-3 min-h-9">
                            <Store className="size-3.5" aria-hidden /> {c.label}
                          </button>
                        ) : c.href === "#myspace" ? (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              openSpace(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue font-extrabold text-[length:var(--fs-14)] px-3 min-h-9"
                          >
                            <Ruler className="size-3.5" aria-hidden /> {c.label}
                          </button>
                        ) : (
                          <Link
                            key={c.label}
                            href={c.href}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue font-extrabold text-[length:var(--fs-14)] px-3 min-h-9"
                          >
                            {c.label}
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
              {typing && (
                <div
                  className="justify-self-start rounded-2xl rounded-bl-md bg-white border border-eu-line px-4 py-3 flex gap-1"
                  aria-label={c.o_symvoylos_grafei}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-2 rounded-full bg-eu-blue/60 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              )}
              {msgs.length > 0 && !typing && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {suggestions
                    .filter((s) => !msgs.some((m) => m.text === s.q))
                    .slice(0, 2)
                    .map((s) => (
                      <button
                        key={s.q}
                        type="button"
                        onClick={() => ask(s.q, s.a)}
                        className="rounded-full bg-white border border-eu-line px-3 min-h-9 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-blue"
                      >
                        {s.q}
                      </button>
                    ))}
                  <Link
                    href="/katastimata"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line px-3 min-h-9 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-blue"
                  >
                    <Store className="size-3.5" aria-hidden /> {c.anthropos_apo_to_katastima}
                  </Link>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim()) return;
                ask(input.trim());
                setInput("");
              }}
              className="p-3 border-t border-eu-line-2 flex gap-2 bg-white"
            >
              <label className="sr-only" htmlFor="advisor-q">
                {c.i_erotisi_soy}
              </label>
              <input
                id="advisor-q"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={voice.listening ? "Σε ακούω…" : voice.transcribing ? "Καταγράφω…" : advisor.panel.placeholder}
                className="flex-1 min-w-0 rounded-full border-2 border-eu-line px-4 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue"
              />
              {voice.enabled && (
                <button
                  type="button"
                  onClick={onMic}
                  disabled={voice.transcribing}
                  aria-pressed={voice.listening}
                  aria-label={voice.listening ? "Σταμάτημα ηχογράφησης" : "Μίλησε στον Ερμή"}
                  className={`size-12 rounded-full inline-flex items-center justify-center shrink-0 border-2 transition-colors ${voice.listening ? "bg-eu-red border-eu-red text-white animate-pulse" : "border-eu-navy text-eu-navy hover:bg-eu-chip"} disabled:opacity-60`}
                >
                  {voice.transcribing ? <Loader2 className="size-5 animate-spin" aria-hidden /> : voice.listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-5" aria-hidden />}
                </button>
              )}
              <button
                type="submit"
                aria-label={c.apostoli}
                className="size-12 rounded-full bg-eu-yellow text-eu-navy inline-flex items-center justify-center hover:bg-eu-yellow-dark shrink-0"
              >
                <Send className="size-5" aria-hidden />
              </button>
            </form>
            {handoff && <StoreHandoff summary={msgs.filter((m) => m.role === "user").map((m) => m.text).join(" · ") || (product ? `${product.brand} ${product.title}` : "Γενική ερώτηση")} onClose={() => setHandoff(false)} />}
            <div className="sr-only">
              <Zap /> <Scale />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
