"use client";

import { tpl } from "@/lib/cms/settings";
import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("greeting");

const KEY = "euronics.arisGreeted.v1";

/**
 * @dynamic Discreet welcome from «Ερμής»: once per session, 2 s after the
 * first page, a small speech bubble above the advisor orb («Γεια! Είμαι ο
 * Ερμής…»), slides in, leaves by itself after 8 s or on tap. Never on
 * checkout. Production: message and timing from the CMS; personalised
 * («Καλώς ήρθες πάλι, Μαρία») when a session exists.
 */
export function AdvisorGreeting() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const { advisor } = useSettings();
  useEffect(() => {
    if (!advisor.greeting.enabled || location.pathname.startsWith("/checkout")) return;
    try {
      if (sessionStorage.getItem(KEY) === "1") return;
      const raw = localStorage.getItem("euronics.session");
      if (raw) setTimeout(() => setName((JSON.parse(raw).name as string).split(" ")[0]), 0);
    } catch {}
    const t = setTimeout(() => {
      setShow(true);
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {}
    }, advisor.greeting.delayMs);
    const off = setTimeout(() => setShow(false), advisor.greeting.hideAfterMs);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show) return null;
  return (
    <div className="fixed z-[59] right-4 bottom-[7.2rem] @md:right-6 @md:bottom-24 max-w-[min(320px,calc(100vw-2rem))] animate-[eu-sheet_.4s_var(--eu-ease-out)]" role="status" aria-live="polite">
      <div className="relative bg-white text-eu-ink rounded-2xl rounded-br-md shadow-[var(--shadow-overlay)] border border-eu-line p-3 pr-9 flex items-start gap-3">
        <span className="relative size-11 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-eu-yellow/60">
          <Image src={advisor.avatarHead} alt="" fill sizes="44px" className="object-cover scale-[1.15] translate-y-[6%]" />
        </span>
        <div className="text-[length:var(--fs-14)] leading-snug">
          <div className="font-extrabold text-eu-navy">{name ? tpl(advisor.greeting.titleReturning, { name }) : advisor.greeting.title}</div>
          <div className="text-eu-ink-3">{advisor.greeting.body}</div>
        </div>
        <button type="button" onClick={() => setShow(false)} aria-label={c.kleisimo} className="absolute top-2 right-2 size-7 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-surface">
          <X className="size-4" aria-hidden />
        </button>
        <span className="absolute -bottom-2 right-6 size-4 rotate-45 bg-white border-r border-b border-eu-line" aria-hidden />
      </div>
    </div>
  );
}
