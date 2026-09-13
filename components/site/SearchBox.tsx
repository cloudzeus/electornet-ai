"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, X, Clock, TrendingUp, ArrowRight, BookOpen, Mic, Camera, Sparkles, Check, AlertTriangle } from "lucide-react";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { useVoice } from "@/lib/voice/client";
import { useMySpace } from "@/components/space/MySpaceProvider";
import { navCategories } from "@/lib/data/nav";
import type { SuggestResult } from "@/lib/data/repo";
import { priceShort, instalment, priceLong } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("search");

const PLACEHOLDER_FULL = "Προϊόν, μάρκα, κωδικός ή ερώτηση…";
const PLACEHOLDER_SHORT = "Ψάξε προϊόν, μάρκα ή κωδικό";
const RECENT_KEY = "euronics.recentSearches.v1";

/**
 * @dynamic Search with live results in four groups (products with photo
 * and price, categories with counts, brands, guides) from
 * /api/search — Meilisearch in production, same JSON. Empty state shows
 * recent + popular searches and the promoted product. Arrow keys move,
 * Enter opens, Esc closes; the form still submits to /anazitisi.
 */
/** A query reads as a question when it has 3+ words or ends with «;» / «?». */
const isQuestion = (q: string) => /[;?]\s*$/.test(q) || q.trim().split(/\s+/).length >= 3;


export function SearchBox({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const router = useRouter();
  const { space } = useMySpace();
  const { advisor } = useSettings();
  const SUGGEST_Q = advisor.suggestions.search;
  const [ans, setAns] = useState<AdvisorAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const advisorMode = isQuestion(q);
  const [res, setRes] = useState<SuggestResult | null>(null);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      if (Array.isArray(saved) && saved.length) setTimeout(() => setRecent(saved), 0);
    } catch {}
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    if (!open) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&cat=${scope}`, { signal: ac.signal });
        if (r.ok) {
          const data = (await r.json()) as SuggestResult;
          setRes(data);
          setActive(-1);
        }
      } catch {}
    }, q ? 140 : 0);
    return () => clearTimeout(t);
  }, [q, scope, open]);

  // Advisor mode: a sentence instead of a keyword → ask the advisor (debounced).
  useEffect(() => {
    if (!open || !advisorMode) {
      const t0 = setTimeout(() => setAns(null), 0);
      return () => clearTimeout(t0);
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setThinking(true);
      try {
        const r = await fetch(`/api/advisor?q=${encodeURIComponent(q)}${space ? `&door=${space.door}` : ""}`, { signal: ac.signal });
        if (r.ok) setAns((await r.json()) as AdvisorAnswer);
      } catch {}
      setThinking(false);
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, open, advisorMode, space]);

  const voice = useVoice();
  // Voice search: Whisper through the AI engine when the voice feature is on (Greek: excellent), else the browser's own recogniser.
  const listen = async () => {
    if (voice.enabled) {
      if (voice.listening) { voice.stop(); return; }
      setListening(true);
      const r = await voice.listen();
      setListening(false);
      if (r.text) { setQ(r.text); setOpen(true); }
      return;
    }
    type SR = new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void };
    const Ctor = (window as unknown as { webkitSpeechRecognition?: SR; SpeechRecognition?: SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SR }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "el-GR";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setQ(text);
      setOpen(true);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const remember = (term: string) => {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };
  const submitTo = (href: string, term?: string) => {
    if (term) remember(term);
    setOpen(false);
    router.push(href);
  };

  const items: { href: string; term?: string }[] = advisorMode
    ? (ans?.products ?? []).map((p) => ({ href: `/proion/${p.slug}`, term: q }))
    : res
    ? q
      ? [...res.products.map((p) => ({ href: `/proion/${p.slug}`, term: q })), ...res.categories.map((c) => ({ href: c.href, term: q })), ...res.guides.map((g) => ({ href: `/odigoi/${g.slug}`, term: q }))]
      : [...recent.map((r) => ({ href: `/anazitisi?q=${encodeURIComponent(r)}`, term: r })), ...res.popular.map((r) => ({ href: `/anazitisi?q=${encodeURIComponent(r)}`, term: r }))]
    : [];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      submitTo(items[active].href, items[active].term);
    }
  };
  const hl = (text: string) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="bg-eu-yellow/60 text-inherit rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  };
  let idx = -1;
  const row = (href: string, term: string | undefined, children: React.ReactNode) => {
    idx++;
    const i = idx;
    return (
      <Link href={href} onClick={() => term && remember(term)} onMouseEnter={() => setActive(i)} className={`block rounded-xl ${active === i ? "bg-eu-chip" : "hover:bg-eu-surface"}`}>
        {children}
      </Link>
    );
  };
  const avail = { "in-stock": ["bg-eu-green", "Άμεσα"], days: ["bg-eu-amber", "2–4 εργάσιμες"], order: ["bg-eu-muted", "Κατόπιν παραγγελίας"] } as const;
  const nothing = res && q && res.total === 0 && res.categories.length === 0 && res.brands.length === 0 && res.guides.length === 0;

  return (
    <div ref={box} className="relative min-w-0">
      <form action="/anazitisi" role="search" onSubmit={() => q && remember(q)} className={`flex bg-white rounded-full overflow-hidden min-w-0 shadow-[var(--shadow-card)] ${open ? "ring-2 ring-eu-yellow" : ""}`}>
        <label htmlFor={`${id}-scope`} className="sr-only">
          {c.katigoria_anazitisis}
        </label>
        <div className={`relative shrink-0 bg-eu-chip text-eu-ink-3 font-semibold text-[length:var(--fs-15)] ${compact ? "hidden" : "hidden @6xl:flex"} items-center`}>
          <select id={`${id}-scope`} name="cat" value={scope} onChange={(e) => setScope(e.target.value)} className="appearance-none bg-transparent pl-3.5 pr-7 h-full min-h-11 outline-none cursor-pointer text-[length:var(--fs-15)]">
            <option value="all">{c.katigoria}</option>
            {navCategories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <ChevronDown className="size-3.5 absolute right-3 pointer-events-none" aria-hidden />
        </div>
        <label htmlFor={`${id}-q`} className="sr-only">
          {c.anazitisi_proionton}
        </label>
        <input
          id={`${id}-q`}
          name="q"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          aria-autocomplete="list"
          placeholder={compact ? PLACEHOLDER_SHORT : PLACEHOLDER_FULL}
          className="flex-1 min-w-0 px-4 py-3 text-eu-ink placeholder:text-eu-muted-2 text-[length:var(--fs-16)] outline-none bg-transparent text-ellipsis"
        />
        {q && (
          <button type="button" aria-label={c.katharismos} onClick={() => setQ("")} className="shrink-0 px-2 text-eu-muted hover:text-eu-ink">
            <X className="size-4" aria-hidden />
          </button>
        )}
        <button type="button" onClick={listen} aria-label={listening ? "Ακούω…" : "Φωνητική αναζήτηση"} aria-pressed={listening} className={`shrink-0 w-10 items-center justify-center transition-colors ${compact ? "flex" : "hidden @6xl:flex"} ${listening ? "text-eu-red animate-pulse" : "text-eu-muted hover:text-eu-navy"}`}>
          <Mic className="size-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("eu:snap")); }} aria-label={c.snap_find_fotografise_tin} className={`shrink-0 w-10 items-center justify-center text-eu-muted hover:text-eu-navy transition-colors ${compact ? "flex" : "hidden @6xl:flex"}`}>
          <Camera className="size-[18px]" aria-hidden />
        </button>
        <button type="submit" className="shrink-0 bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 @md:px-[22px] flex items-center gap-2 hover:bg-eu-yellow-dark transition-colors min-h-11">
          <Search className="size-4" aria-hidden />
          <span className={compact ? "sr-only" : "hidden @7xl:inline whitespace-nowrap"}>{c.anazitisi}</span>
        </button>
      </form>

      {open && (res || advisorMode) && (
        <div id={`${id}-panel`} role="listbox" className={`absolute z-50 top-[calc(100%+8px)] left-0 bg-white text-eu-ink rounded-2xl shadow-[var(--shadow-overlay)] border border-eu-line overflow-hidden eu-container ${compact ? "right-0" : "w-[min(900px,calc(100vw-2rem))]"}`}>
          {advisorMode ? (
            <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div className="relative bg-eu-navy text-white p-4 @md:p-5 overflow-hidden isolate">
                <span className="eu-ambient" aria-hidden />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span className="relative size-9 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-white/60">
                      <Image src={advisor.avatarHead} alt="" fill sizes="36px" className="object-cover scale-[1.15] translate-y-[6%]" />
                    </span>
                    <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
                      <Sparkles className="size-3.5" aria-hidden /> Ο {advisor.name} απαντά
                    </div>
                  </div>
                  {thinking && !ans ? (
                    <div className="mt-3 flex gap-1" aria-label={c.o_symvoylos_skeftetai}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-2 rounded-full bg-eu-yellow animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                      ))}
                    </div>
                  ) : ans ? (
                    <>
                      {ans.understood.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {ans.understood.map((u) => (
                            <span key={u} className="rounded-full bg-white/12 px-2.5 py-1 text-[length:var(--fs-13)] font-bold">
                              {u}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="m-0 mt-3 text-[length:var(--fs-15)] leading-snug text-eu-on-dark">{ans.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ans.href && (
                          <Link href={ans.href.href} onClick={() => remember(q)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-yellow-dark">
                            {ans.href.label} <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        )}
                        {/* Hand the answered question over to the chat: the orb shows it as history and continues from there. */}
                        <button type="button" onClick={() => { remember(q); setOpen(false); window.dispatchEvent(new CustomEvent("eu:ask", { detail: { q, answer: ans } })); }} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-white/20">
                          <Sparkles className="size-3.5" aria-hidden /> Συνέχισε τη συζήτηση
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="p-3 grid gap-1 content-start">
                {(ans?.products ?? []).map((p) => (
                  <div key={p.id}>
                    {row(
                      `/proion/${p.slug}`,
                      q,
                      <div className="flex items-center gap-3 p-2">
                        <ProductImage src={p.image} sizes="72px" className="size-[72px]" rounded="rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase truncate">{p.brand}</div>
                          <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-1">{p.title}</div>
                          <div className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug mt-0.5 line-clamp-1">{p.why}</div>
                          {p.fit && (
                            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold ${p.fit === "fits" ? "bg-eu-green/12 text-eu-green" : p.fit === "tight" ? "bg-eu-amber/15 text-eu-amber" : "bg-eu-surface-3 text-eu-ink-3"}`}>
                              {p.fit === "no" ? <X className="size-3" aria-hidden /> : p.fit === "tight" ? <AlertTriangle className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}
                              {p.fit === "fits" ? "Χωράει" : p.fit === "tight" ? "Οριακά" : "Δεν χωράει"}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-eu-ink text-[length:var(--fs-17)]">{priceShort(p.price)}</div>
                          {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-13)]">{priceShort(p.wasPrice)}</s>}
                        </div>
                      </div>,
                    )}
                  </div>
                ))}
                {ans && ans.products.length === 0 && <p className="m-0 p-3 text-eu-muted text-[length:var(--fs-14)]">{c.den_vrethikan_proionta_gia}</p>}
              </div>
            </div>
          ) : !res ? null : nothing ? (
            <div className="p-6 grid gap-2">
              <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">Δεν βρέθηκε κάτι για «{q}»</div>
              <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">{c.dokimase_marka_montelo_i}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {res.popular.slice(0, 5).map((p) => (
                  <Link key={p} href={`/anazitisi?q=${encodeURIComponent(p)}`} className="rounded-full bg-eu-surface px-3 min-h-9 inline-flex items-center text-[length:var(--fs-14)] font-semibold text-eu-ink-2 hover:bg-eu-chip">
                    {p}
                  </Link>
                ))}
                <Link href="/odigos-agoras" className="rounded-full bg-eu-navy text-white px-3 min-h-9 inline-flex items-center text-[length:var(--fs-14)] font-bold">
                  {c.exypnos_odigos_agoras}
                </Link>
              </div>
            </div>
          ) : q ? (
            <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"}`}>
              <div className="p-3">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">{c.proionta}</span>
                  {res.total > 0 && (
                    <Link href={`/anazitisi?q=${encodeURIComponent(q)}${scope !== "all" ? `&cat=${scope}` : ""}`} onClick={() => remember(q)} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline">
                      Όλα τα {res.total} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
                {res.products.length === 0 && <p className="m-0 px-2 py-2 text-eu-muted text-[length:var(--fs-14)]">{c.kanena_proion_me_aytoys}</p>}
                <ul className="m-0 p-0 list-none grid gap-0.5">
                  {res.products.map((p) => (
                    <li key={p.id}>
                      {row(
                        `/proion/${p.slug}`,
                        q,
                        <div className="flex items-center gap-3 p-2">
                          <ProductImage src={p.image} sizes="56px" className="size-14" rounded="rounded-lg" />
                          <div className="min-w-0 flex-1">
                            <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase truncate">
                              {p.brand} · {p.path}
                            </div>
                            <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-1">{hl(p.title)}</div>
                            <div className="flex items-center gap-2 text-[length:var(--fs-13-5)] text-eu-muted">
                              <span className={`size-2 rounded-full ${avail[p.avail][0]}`} aria-hidden /> {avail[p.avail][1]} · 12 × {priceLong(instalment(p.price))}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{priceShort(p.price)}</div>
                            {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-13)]">{priceShort(p.wasPrice)}</s>}
                          </div>
                        </div>,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-eu-surface/60 border-t @3xl:border-t-0 @3xl:border-l border-eu-line grid gap-3 content-start">
                {res.categories.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">{c.katigories}</div>
                    <ul className="m-0 p-0 list-none grid gap-0.5">
                      {res.categories.map((c) => (
                        <li key={c.href}>
                          {row(
                            c.href,
                            q,
                            <div className="flex items-center justify-between gap-2 px-2 py-2">
                              <span className="font-semibold text-eu-ink text-[length:var(--fs-15)]">
                                {hl(c.name)}
                                {c.parent && <span className="text-eu-muted font-normal"> · {c.parent}</span>}
                              </span>
                              <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{c.count}</span>
                            </div>,
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {res.brands.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">{c.markes}</div>
                    <div className="flex flex-wrap gap-1.5 px-2">
                      {res.brands.map((b) => (
                        <Link key={b.slug} href={`/brands/${b.slug}`} onClick={() => remember(q)} className="rounded-full bg-white border border-eu-line px-3 min-h-9 inline-flex items-center gap-1.5 text-[length:var(--fs-14)] font-bold text-eu-ink hover:border-eu-blue">
                          {hl(b.name)} <span className="text-eu-muted-2 font-normal">{b.count}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {res.guides.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">{c.odigoi}</div>
                    <ul className="m-0 p-0 list-none grid gap-0.5">
                      {res.guides.map((g) => (
                        <li key={g.slug}>
                          {row(
                            `/odigoi/${g.slug}`,
                            q,
                            <div className="flex items-center gap-2 px-2 py-2">
                              <BookOpen className="size-4 text-eu-blue shrink-0" aria-hidden />
                              <span className="font-semibold text-eu-ink text-[length:var(--fs-14)] line-clamp-1">{g.title}</span>
                            </div>,
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_300px]"}`}>
              <div className="p-4 grid gap-4 content-start">
                {recent.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="inline-flex items-center gap-1.5 font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">
                        <Clock className="size-3.5" aria-hidden /> {c.prosfates}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecent([]);
                          try {
                            localStorage.removeItem(RECENT_KEY);
                          } catch {}
                        }}
                        className="text-eu-muted text-[length:var(--fs-13)] hover:text-eu-red"
                      >
                        {c.katharismos}
                      </button>
                    </div>
                    <ul className="m-0 p-0 list-none grid gap-0.5">
                      {recent.map((r) => (
                        <li key={r}>{row(`/anazitisi?q=${encodeURIComponent(r)}`, r, <div className="px-2 py-2 text-[length:var(--fs-15)] text-eu-ink">{r}</div>)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="inline-flex items-center gap-1.5 px-1 mb-1.5 font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">
                    <Sparkles className="size-3.5" aria-hidden /> Ρώτα τον {advisor.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGEST_Q.map((sq) => (
                      <button key={sq} type="button" onClick={() => { setQ(sq); setOpen(true); }} className="rounded-full bg-eu-chip text-eu-blue px-3 min-h-9 inline-flex items-center text-[length:var(--fs-14)] font-bold hover:bg-eu-blue hover:text-white transition-colors">
                        {sq}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-1 mb-1.5 font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase">
                    <TrendingUp className="size-3.5" aria-hidden /> {c.dimofileis_anazitiseis}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {res.popular.map((p) => {
                      idx++;
                      const i = idx;
                      return (
                        <Link key={p} href={`/anazitisi?q=${encodeURIComponent(p)}`} onClick={() => remember(p)} onMouseEnter={() => setActive(i)} className={`rounded-full border px-3 min-h-9 inline-flex items-center text-[length:var(--fs-14)] font-semibold ${active === i ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink-2 hover:border-eu-blue"}`}>
                          {p}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
              {res.promo && !compact && (
                <Link href={`/proion/${res.promo.slug}`} onClick={() => setOpen(false)} className="bg-eu-navy text-white p-4 grid gap-2 content-start hover:bg-eu-blue transition-colors">
                  <span className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase">{c.prosfora_imeras}</span>
                  <ProductImage src={res.promo.image} sizes="260px" className="w-full" />
                  <span className="text-eu-on-dark text-[length:var(--fs-13)] uppercase font-bold">{res.promo.brand}</span>
                  <span className="font-bold text-[length:var(--fs-15)] leading-tight line-clamp-2">{res.promo.title}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-extrabold text-[length:var(--fs-22)]">{priceShort(res.promo.price)}</span>
                    {res.promo.wasPrice && <s className="text-eu-on-dark-2 text-[length:var(--fs-14)]">{priceShort(res.promo.wasPrice)}</s>}
                  </span>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
