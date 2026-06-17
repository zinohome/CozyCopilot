import type { NextConfig } from "next";

// Two static-export targets today:
//   - embed: same Next bundle, iframe-friendly CSP
//   - desktop: shipped to the Tauri 2.x shell as `out/`
// Both share the same static-export config below; the only difference
// is the CSP header (embed relaxes frame-ancestors, desktop doesn't
// need any since Tauri renders inside a native window).
const buildTarget = process.env.NEXT_PUBLIC_BUILD_TARGET;
const isEmbed = buildTarget === "embed";
const isDesktop = buildTarget === "desktop";
const isStaticExport = isEmbed || isDesktop;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export for embed and desktop surfaces; SSR for the web app.
  // We rely on the embed route being under (embed) which is a separate
  // build in the future; for M1 the entire app is SSR on the web.
  output: isStaticExport ? "export" : undefined,
  images: {
    // Static export requires `unoptimized` (no image optimizer runtime).
    unoptimized: isStaticExport,
    remotePatterns: [{ protocol: "https", hostname: "**.cozycopilot.com" }],
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
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
  // Static export writes a trailingSlash so the resulting directory works
  // as a Tauri `frontendDist` (file:// loads) without needing rewrites.
  trailingSlash: isStaticExport,
};

export default nextConfig;
