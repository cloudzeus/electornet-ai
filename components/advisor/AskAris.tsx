"use client";

import { Sparkles } from "lucide-react";

/** Chip that opens the advisor with a ready question (custom event `eu:ask`). */
export function AskAris({ q, tone = "dark" }: { q: string; tone?: "dark" | "light" }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("eu:ask", { detail: q }))}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] transition-colors ${tone === "dark" ? "bg-white/10 text-white hover:bg-eu-yellow hover:text-eu-navy" : "bg-eu-chip text-eu-blue hover:bg-eu-blue hover:text-white"}`}
    >
      <Sparkles className="size-3.5" aria-hidden /> {q}
    </button>
  );
}
