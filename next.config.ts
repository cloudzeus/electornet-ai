import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Coolify / Docker: self-contained server in .next/standalone */
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.euronics.gr" }, { protocol: "https", hostname: "*.b-cdn.net" }, { protocol: "https", hostname: "cdn.brandfetch.io" }],
    formats: ["image/avif", "image/webp"],
  },
  typedRoutes: false,
  /** τα screenshots του wiki (εκτός public/) μπαίνουν στο standalone για το /api/help-shot */
  outputFileTracingIncludes: { "/api/help-shot/[name]": ["./help-shots/**"] },
};

export default nextConfig;
