import type { NextConfig } from "next";

const isEmbed = process.env.NEXT_PUBLIC_BUILD_TARGET === "embed";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Only the embed route uses static export; the rest of the app is SSR.
  // We rely on the embed route being under (embed) which is a separate build
  // in the future; for M1 the entire app is SSR.
  output: isEmbed ? "export" : undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cozycopilot.com" },
    ],
  },
  // Allow embedding CozyCopilot widget inside cross-origin iframes.
  // We intentionally do NOT set X-Frame-Options here: it only understands
  // SAMEORIGIN/DENY (no ALLOW-FROM), and SAMEORIGIN would defeat the embed
  // use case on legacy browsers/proxies that prefer the more restrictive
  // header. CSP frame-ancestors * is the modern, embed-friendly equivalent.
  async headers() {
    if (!isEmbed) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
