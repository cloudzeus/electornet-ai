import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Coolify / Docker: self-contained server in .next/standalone */
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.euronics.gr" }, { protocol: "https", hostname: "*.b-cdn.net" }, { protocol: "https", hostname: "cdn.brandfetch.io" }],
    formats: ["image/avif", "image/webp"],
  },
  typedRoutes: false,
  /** χωρίς «x-powered-by: Next.js» (δεν χρειάζεται να δηλώνουμε τεχνολογία) */
  poweredByHeader: false,
  /** κεφαλίδες ασφαλείας σε κάθε απάντηση */
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        // ο browser δεν «μαντεύει» τύπο αρχείου (π.χ. δεν εκτελεί ως script κάτι που δηλώνεται εικόνα)
        { key: "X-Content-Type-Options", value: "nosniff" },
        // το site δεν μπαίνει σε iframe άλλου site (clickjacking)
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        // σε εξωτερικούς συνδέσμους φεύγει μόνο το domain, όχι η πλήρης διεύθυνση
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // μόνο https για έναν χρόνο
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        // δικαιώματα browser: μικρόφωνο (φωνητική αναζήτηση) και τοποθεσία (διευθύνσεις, καταστήματα) μόνο από εμάς· όχι κάμερα / USB
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=(self), usb=(), browsing-topics=()" },
        // βασικό CSP που δεν αγγίζει scripts / εικόνες / πληρωμές: όχι σε iframe τρίτων, όχι <base>/<object>, φόρμες μόνο σε https
        { key: "Content-Security-Policy", value: ["frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self' https:", ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])].join("; ") },
      ],
    }];
  },
  /** τα screenshots του wiki (εκτός public/) μπαίνουν στο standalone για το /api/help-shot */
  /** η γραμματοσειρά (ελληνικά) του δελτίου παράδοσης PDF διαβάζεται από αρχείο */
  outputFileTracingIncludes: { "/api/help-shot/[name]": ["./help-shots/**"], "/api/admin/shipments/deltio": ["./lib/couriers/fonts/**"] },
};

export default nextConfig;
