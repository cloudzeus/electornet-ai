import { getImageProps, type ImageProps } from "next/image";
import { preload } from "react-dom";
import { sx } from "./sx";

/**
 * Το next/image χωρίς style attribute (το Content-Security-Policy δεν επιτρέπει inline styles): ίδιο API και ίδιο
 * <img> (srcset, sizes, lazy loading, βελτιστοποίηση μέσω /_next/image)· το style που βάζει το Next (fill, color,
 * placeholder χωρίς το θολό προσχέδιο) γίνεται κλάση sx. Οι εικόνες priority / preload προφορτώνονται όπως στο next/image.
 * Χρήση: `import Image from "@/components/ui/Image"` αντί για "next/image".
 */
export default function Image(p: ImageProps) {
  const { props } = getImageProps(p);
  const { style, className, ...rest } = props;
  // το θολό προσχέδιο (placeholder="blur") το αφαιρεί το next/image όταν φορτώσει· εδώ θα έμενε πίσω από εικόνες με
  // διαφάνεια — το παραλείπουμε
  const st = Object.fromEntries(Object.entries((style ?? {}) as Record<string, string | number>).filter(([k]) => !k.startsWith("background")));
  const s = sx(st);
  if ((p.priority || p.preload) && typeof rest.src === "string") preload(rest.src, { as: "image", imageSrcSet: rest.srcSet, imageSizes: rest.sizes, fetchPriority: "high" });
  return (
    <>
      {s.node}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- το <img> του next/image, με alt από τα props */}
      <img {...rest} className={[className, s.className].filter(Boolean).join(" ") || undefined} />
    </>
  );
}
