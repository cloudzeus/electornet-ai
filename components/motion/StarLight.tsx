import { STAR_PATH } from "./star";
import { sx } from "@/components/ui/sx";

/**
 * The brand star as a light source: a yellow star that breathes, with a
 * soft glow and rotating rays behind it. Pure CSS animation (no JS), all
 * decorative (aria-hidden). `size` is the star box; rays extend ×3.
 * Το μέγεθος περνά ως μεταβλητή `--sl` (κλάση sx — το CSP δεν επιτρέπει style attributes)· τα υπόλοιπα μέτρα με calc().
 */
export function StarLight({ size = 56, className = "", rays = true, glow = true }: { size?: number; className?: string; rays?: boolean; glow?: boolean }) {
  const s = sx({ "--sl": `${size}px` });
  return (
    <span className={`pointer-events-none absolute w-[var(--sl)] h-[var(--sl)] ${s.className} ${className}`} aria-hidden>
      {s.node}
      {rays && <span className="eu-rays w-[calc(var(--sl)*3.4)] left-[calc(var(--sl)*-1.2)] top-[calc(var(--sl)*-1.2)]" />}
      {glow && <span className="absolute rounded-full bg-[radial-gradient(closest-side,rgba(241,196,0,.55),rgba(241,196,0,0))] blur-xl inset-[calc(var(--sl)*-0.6)]" />}
      <svg viewBox="0 12 72 85" className="relative block eu-breathe w-[var(--sl)] h-[var(--sl)]">
        <path d={STAR_PATH} fill="var(--eu-yellow)" />
      </svg>
    </span>
  );
}
