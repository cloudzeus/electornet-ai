import type { MetadataRoute } from "next";

/** robots.txt: όλο το κατάστημα ανοιχτό· εκτός ευρετηρίου η διαχείριση, τα API και οι προσωπικές σελίδες (καλάθι, ταμείο, λογαριασμός). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/kalathi", "/checkout", "/logariasmos", "/eisodos", "/eggrafi", "/syndesi", "/ksexasa-kodiko", "/newsletter/u/", "/protasi"] }],
  };
}
