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
  // Allow embedding CozyCopilot widget inside cross-origin iframes
  async headers() {
    if (!isEmbed) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
