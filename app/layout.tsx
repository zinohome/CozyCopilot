import type { Metadata } from "next";
import Script from "next/script";
import "../src/styles/globals.css";
import { RootThemeBridge } from "@/components/theme/RootThemeBridge";

export const metadata: Metadata = {
  title: "CozyCopilot",
  description: "A warmer AI chat experience",
};

/**
 * Inline blocking script. Runs synchronously in <head> before React
 * hydration so the first paint already shows the right palette.
 *
 * Zustand persists under `cozy-theme` with shape
 * `{ state: { theme, mode } }` (the default `createJSONStorage`
 * envelope). We read it, validate against the known theme/mode names,
 * and stamp `<html>` with `data-theme` + `data-mode` so the attribute-
 * scoped CSS in `src/styles/themes/*.css` resolves immediately.
 *
 * The `cozy-theme` key is a forward reference to `src/stores/theme.ts`
 * (which can't be imported here — it's a Server Component, and the
 * store pulls in zustand). Keeping it inline keeps the boot path tiny.
 */
const themeBootScript = `
(function(){try{
  var raw=localStorage.getItem('cozy-theme');
  if(!raw)return;
  var data=JSON.parse(raw);
  var state=data&&data.state;
  if(!state)return;
  var themeNames=['cozy-orange','calm-blue','mint','lavender','mono'];
  var theme=themeNames.indexOf(state.theme)>=0?state.theme:'cozy-orange';
  var mode=state.mode==='dark'?'dark':'light';
  var root=document.documentElement;
  root.setAttribute('data-theme',theme);
  root.setAttribute('data-mode',mode);
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/*
          `beforeInteractive` runs the script before hydration. The body
          is intentionally empty of JS dependencies; the script reads
          localStorage only and falls back silently on failure.
        */}
        <Script id="cozy-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <RootThemeBridge />
        {children}
      </body>
    </html>
  );
}
