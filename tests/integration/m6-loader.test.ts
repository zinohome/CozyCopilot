// M6.3 — loader.js integration test.
//
// Validates the third-party embed script end-to-end inside jsdom:
//
//   1. loader.js reads data-key and includes it in the iframe URL
//   2. loader.js reads data-personality and includes it
//   3. loader.js reads data-theme and includes it
//   4. loader.js creates an iframe with position: fixed; bottom: 0; right: 0
//   5. loader.js exposes window.CozyCopilot.{open, close, send, on}
//   6. loader.js filters postMessage by evt.source (rejects foreign sources)
//
// The loader mutates `window` and `document` directly when it runs.
// jsdom does NOT execute the inline `textContent` of a <script> element
// that we append programmatically (only scripts the HTML parser sees
// at parse time fire), so we run the loader via `window.eval` instead.
// To keep the loader's `me.src` reading honest we first append a real
// <script> tag with the host's `data-*` attributes — the loader walks
// `document.getElementsByTagName('script')` and picks the last one, so
// the tag we drop in IS the one the loader inspects. `eval` then runs
// the source against `window` as the global.
//
// Each test starts with a fresh DOM + a fresh `window.CozyCopilot`
// slot.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOADER_PATH = resolve(__dirname, "../../public/embed/loader.js");

/**
 * Inject a <script data-*> tag with the supplied attributes into the
 * document body, then run the loader.js source against `window` as
 * the global via `window.eval`. Returns the loader source so callers
 * can poke at it.
 *
 * The loader reads `data-*` attrs from `scripts[scripts.length - 1]`,
 * so the <script> we drop in must be the last one in document order
 * at the time the loader runs — which it is, since this is the only
 * script we add.
 */
function injectLoader(attrs: Record<string, string>) {
  const script = document.createElement("script");
  script.setAttribute("src", "./loader.js");
  for (const [k, v] of Object.entries(attrs)) {
    script.setAttribute(k, v);
  }
  document.body.appendChild(script);

  const source = readFileSync(LOADER_PATH, "utf8");
  // Run inside jsdom's window so the loader sees the same `document`,
  // `window`, and `MessageEvent` constructor it would in a real browser.
  window.eval(source);
  return source;
}

describe("M6.3 — loader.js", () => {
  beforeEach(() => {
    // jsdom's <body> carries iframes + <script>s across tests because the
    // test runner reuses one document. Wipe both before each test so we
    // always start from a clean DOM and a clean `window.CozyCopilot`.
    document.body.innerHTML = "";
    delete (window as unknown as { CozyCopilot?: unknown }).CozyCopilot;
  });

  it("reads data-key and includes it in the iframe URL", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "cozy-orange",
    });

    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain("/widget/");
    expect(iframe.src).toContain("key=ck_abc123");
  });

  it("reads data-personality and includes it in the iframe URL", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "cozy-orange",
    });

    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.src).toContain(
      "personality=00000000-0000-0000-0000-000000000001",
    );
  });

  it("reads data-theme and includes it in the iframe URL", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "calm-blue",
    });

    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.src).toContain("theme=calm-blue");
  });

  it("creates an iframe with position: fixed; bottom: 0; right: 0", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "cozy-orange",
    });

    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // The loader applies these styles via `cssText` so we get them
    // straight off the style attribute.
    const css = iframe.getAttribute("style") ?? "";
    expect(css).toMatch(/position\s*:\s*fixed/i);
    expect(css).toMatch(/bottom\s*:\s*0/i);
    expect(css).toMatch(/right\s*:\s*0/i);
  });

  it("exposes window.CozyCopilot.open / close / send / on", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "cozy-orange",
    });

    const api = (window as unknown as { CozyCopilot?: Record<string, unknown> })
      .CozyCopilot;
    expect(api).toBeTruthy();
    expect(typeof api!.open).toBe("function");
    expect(typeof api!.close).toBe("function");
    expect(typeof api!.send).toBe("function");
    expect(typeof api!.on).toBe("function");
  });

  it("filters postMessage by evt.source (rejects foreign sources)", () => {
    injectLoader({
      "data-key": "ck_abc123",
      "data-personality": "00000000-0000-0000-0000-000000000001",
      "data-theme": "cozy-orange",
    });

    const api = (window as unknown as {
      CozyCopilot: {
        on: (type: string, fn: (msg: unknown) => void) => void;
      };
    }).CozyCopilot;

    const handler = vi.fn();
    api.on("cozy:ready", handler);

    // Foreign message: same shape, but `evt.source` is NOT the iframe's
    // contentWindow. The loader must drop it without calling the handler.
    const foreignEvt = new MessageEvent("message", {
      data: { type: "cozy:ready", version: "0.1.0" },
      source: window, // pretend it's the parent / another frame
    });
    window.dispatchEvent(foreignEvt);

    expect(handler).not.toHaveBeenCalled();
  });
});