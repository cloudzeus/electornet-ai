import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Coolify / Docker: self-contained server in .next/standalone */
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.euronics.gr" }, { protocol: "https", hostname: "*.b-cdn.net" }],
    formats: ["image/avif", "image/webp"],
  },
  typedRoutes: false,
};

export default nextConfig;
