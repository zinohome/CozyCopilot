import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 7.x configuration for CozyCopilot.
 *
 * `webDir: "out"` is the static-exported Next.js bundle (produced by
 * `next build` with `output: 'export'`). Capacitor copies that directory
 * into `ios/App/App/public` and `android/app/src/main/assets/public` on
 * `npx cap sync` and serves it from the native WebView.
 *
 * The native iOS/Android project files in `ios/` and `android/` were
 * scaffolded by hand (M3.9 ships before `npx cap add ios` could run in
 * CI); re-run `npx cap add ios` / `npx cap add android` on a machine
 * with Xcode / Android Studio installed to refresh them.
 *
 * `initialFocus: true` is the Capacitor 7 default — the WebView
 * receives focus on launch so keyboard / input fields work on the
 * first frame.
 *
 * server.androidScheme / server.iosScheme = "https" so the app loads
 * content from `https://localhost` (Capacitor's recommended scheme
 * for the static bundle). Service workers and other secure-context
 * APIs work without an HTTP server.
 *
 * SplashScreen.showDuration is intentionally short — the warm orange
 * theme should not be a barrier to the user seeing the app.
 */
const config: CapacitorConfig = {
  appId: "com.zinohome.cozycopilot",
  appName: "CozyCopilot",
  webDir: "out",
  initialFocus: true,
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
    },
  },
};

export default config;
