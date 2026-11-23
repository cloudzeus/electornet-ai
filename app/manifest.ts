import type { MetadataRoute } from "next";

/** Web manifest: όνομα, χρώματα και εικονίδια όταν το site μπαίνει στην αρχική οθόνη κινητού (Android / Chrome). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Euronics — ηλεκτρικές συσκευές & τεχνολογία",
    short_name: "Euronics",
    description: "Ηλεκτρικές συσκευές, τηλεοράσεις, κλιματιστικά και τεχνολογία από τη Euronics.",
    lang: "el",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#1d428a",
    icons: [
      { src: "/design/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/design/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/design/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
