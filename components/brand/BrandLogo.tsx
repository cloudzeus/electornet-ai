import { logoBox } from "@/lib/cms/logo-trim";
import { sx } from "@/components/ui/sx";

/**
 * Λογότυπο μάρκας με ΟΜΟΙΟΜΟΡΦΟ μέγεθος: ίδιο οπτικό βάρος για φαρδιά wordmarks και τετράγωνα σήματα
 * (βλ. logoBox). Χωρίς λογότυπο: το wordmark ως κείμενο. base = ύψος σε rem για λογότυπο 3:1.
 */
export function BrandLogo({ logo, aspect, wordmark, base = 2.5, className = "", textClass = "font-heading font-extrabold text-[length:var(--fs-28)] tracking-[-0.04em]" }: { logo?: string; aspect?: number; wordmark: string; base?: number; className?: string; textClass?: string }) {
  if (!logo) return <span className={`${textClass} ${className}`}>{wordmark}</span>;
  const box = logoBox(aspect, base);
  const s = sx({ height: box.height, maxWidth: `min(${box.maxWidth}, 100%)` });
  return (
    <>
      {s.node}
      {/* eslint-disable-next-line @next/next/no-img-element -- λογότυπο SVG/PNG από τη βιβλιοθήκη (ή hotlink Brandfetch) */}
      <img src={logo} alt={wordmark} className={`block w-auto object-contain object-left ${s.className} ${className}`} />
    </>
  );
}
