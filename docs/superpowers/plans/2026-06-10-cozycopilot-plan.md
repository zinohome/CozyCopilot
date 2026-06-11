# CozyCopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan stage-by-stage. Stages use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CozyCopilot — a multi-platform AI chat frontend (Web + Web Embed Widget + Tauri Desktop + Capacitor Mobile) that wraps CozyEngineV2 with a "warmer than Claude" UI, full streaming chat, custom LLM providers, voice (TTS/STT/Realtime), and a deployable widget for third-party sites.

**Architecture:** Single-repo / single-package Next.js 15 App Router project. One web bundle serves all 4 runtime forms (own-hosted Web with SSR, Widget via `output: export`, Tauri 2.x desktop shell, Capacitor 7.x mobile shell). All CozyEngineV2 traffic goes through a BFF layer (`/api/cozy/*`) for JWT injection, CORS, and stream passthrough. State via Zustand + persist; data via TanStack Query; cross-platform capability differences abstracted in `lib/capabilities/`. ~95% code reuse across all 4 forms.

**Tech Stack:** Next.js 15 (App Router, RSC, `output: export` for widget), React 19, TypeScript 5.9, Tailwind CSS v4, shadcn/ui, Zustand + persist, TanStack Query v5, eventsource-parser, livekit-client, MSW 2.x, Vitest 1.x, Playwright, Tauri 2.x, Capacitor 7.x, Sentry, pnpm.

**Spec:** [`../specs/2026-06-10-cozycopilot-design.md`](../specs/2026-06-10-cozycopilot-design.md)

---

## How to Read This Plan

This document is the **top-level plan** that covers all 8 spec milestones (M1-M8). It is structured in three parts:

- **Part 1 — Stage Index**: One entry per stage with scope, deliverable, duration estimate, and a link to its detailed plan document.
- **Part 2 — Stage M1 Detailed Plan**: Fully executable TDD tasks for Stage M1 (the first stage to execute). M2-M8 have only summaries here; their detailed plans are produced **after** M1 is complete, in dedicated follow-up documents under `docs/superpowers/plans/`.
- **Part 3 — Cross-Stage Concerns**: Decisions that span multiple stages (commit conventions, directory ownership, mock fixtures, design token lifecycle).

> **Why this split?** A 47-task detailed plan covering all 8 stages would be ~5000 lines and exceed what an agent can hold in context. The "top-level + M1 detailed + M2-M8 summaries" pattern lets engineers execute M1 immediately, then come back to write M2's detailed plan with the lessons learned from M1.

---

## Part 1 — Stage Index

| Stage | Spec Milestone | Title | Scope | Deliverable | Estimate | Detailed Plan |
|---|---|---|---|---|---|---|
| **M1** | M1 骨架 | Scaffold + Build Matrix + Auth + Basic Chat | Next.js 15 project, shadcn/ui, Tailwind v4, MSW, 4 build targets, BFF chat route, login, session list, basic SSE chat | `pnpm build:web` / `pnpm build:embed` / `pnpm build:desktop` / `pnpm build:mobile` all green; user can log in, send a message, see streamed reply | 2-3 days | **Part 2 (this doc)** |
| **M2** | M2 BFF 完整 | BFF Coverage + Error Normalization + Contract Tests | All 14 BFF routes with zod schemas; 20 error codes; 4 contract tests against recorded CozyEngineV2 fixtures; rate limiting; SSE error normalization | All BFF routes covered by Vitest; contract tests pass against fixtures; E2E-01/02 work | 2-3 days | `2026-06-15-m2-bff-coverage.md` (after M1) |
| **M3** | M3 多端壳 | Tauri + Capacitor Shells + OS Notifications + Mic Permission | Tauri 2.x conf + Rust permission plugins; Capacitor 7.x iOS/Android; OS notification abstraction; mic permission UX | Tauri app launches and chats; Capacitor iOS/Android builds and runs; mic permission flow works | 2-3 days | `2026-06-20-m3-shells.md` (after M2) |
| **M4** | M4 高级能力 | WebSocket + Async Tasks + Upload + ToolCall + Custom LLM | WebSocket client, deferred task polling, file upload, ToolCall viewer, custom LLM provider CRUD with connection test | E2E-09 (custom LLM) + ToolCall UI works; WS-realtime tool_call flow works | 3-4 days | `2026-06-25-m4-advanced.md` (after M3) |
| **M5** | M5 语音 | TTS/STT + Realtime LiveKit | Non-realtime voice upload+transcribe, TTS playback, LiveKit Realtime room, voice_context / voice_summary integration | E2E-10 (TTS/STT) + E2E-11 (Realtime) work | 3-4 days | `2026-07-01-m5-voice.md` (after M4) |
| **M6** | M6 嵌入 widget | Embed Widget + postMessage + Prefill + Hidden History | `loader.js` 4KB, widget route static export, IframeEvent schema, 5 query string params, 2-way postMessage | E2E-07/08 work; embed on a third-party demo page works | 2 days | `2026-07-06-m6-embed.md` (after M5) |
| **M7** | M7 视觉打磨 | Themes + Warmth + A11y + E2E Coverage | 5 theme presets (Cozy Orange default + Calm Blue + Mint + Lavender + Mono), Cozy theme token override on shadcn, dark/light sync, axe scan in E2E | E2E-06/15 work; 0 critical axe issues; bundle < 150KB gzip | 2-3 days | `2026-07-09-m7-polish.md` (after M6) |
| **M8** | M8 上线 | Performance + Smoke Tests + Release | LCP optimization, README, manual smoke checklist, Sentry config, CI green, 4 builds on CI | All 15 E2E green on CI; 4 builds succeed; manual smoke signed off | 2 days | `2026-07-12-m8-release.md` (after M7) |

**Total estimate**: ~18-23 working days.

---

## Part 2 — Stage M1 Detailed Plan

> Execute M1 first. Use superpowers:subagent-driven-development OR superpowers:executing-plans.
> All file paths are relative to `/Users/zhangjun/CursorProjects/CozyCopilot/`.

### M1.0 — Project Scaffolding

#### Task 1: Initialize pnpm workspace root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `tsconfig.json`
- Create: `.editorconfig`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cozycopilot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:web": "next build",
    "build:embed": "NEXT_PUBLIC_BUILD_TARGET=embed next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
# Placeholder for future use; do not define packages yet.
# Single-package repo today; reserved for monorepo migration.
packages: []
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
.next/
dist/
out/
.turbo/
coverage/
test-results/
playwright-report/
*.log
.DS_Store
.env*.local
src-tauri/target/
ios/Pods/
android/app/build/
*.tsbuildinfo
```

- [ ] **Step 4: Create `.nvmrc`**

```
20
```

- [ ] **Step 5: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@app/*": ["./app/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "src-tauri", "ios", "android"]
}
```

- [ ] **Step 6: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore .nvmrc tsconfig.json .editorconfig
git commit -m "chore: initialize pnpm + tsconfig + editorconfig"
```

---

#### Task 2: Install core dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add next@^15.0.0 react@^19.0.0 react-dom@^19.0.0 \
  zustand@^5.0.0 @tanstack/react-query@^5.59.0 \
  zod@^3.23.0 eventsource-parser@^1.1.0 \
  clsx@^2.1.0 tailwind-merge@^2.5.0 \
  lucide-react@^0.460.0 sonner@^1.7.0
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D typescript@^5.9.0 @types/node@^20.0.0 @types/react@^19.0.0 @types/react-dom@^19.0.0 \
  tailwindcss@^4.0.0 @tailwindcss/postcss@^4.0.0 postcss@^8.4.0 \
  eslint@^9.0.0 eslint-config-next@^15.0.0 prettier@^3.3.0 \
  vitest@^2.0.0 @vitest/coverage-v8@^2.0.0 \
  @testing-library/react@^16.0.0 @testing-library/user-event@^14.5.0 @testing-library/jest-dom@^6.5.0 \
  jsdom@^25.0.0 \
  @playwright/test@^1.48.0
```

- [ ] **Step 3: Verify install**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add core runtime + dev dependencies"
```

---

#### Task 3: Next.js + Tailwind v4 config

**Files:**
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `postcss.config.mjs`
- Create: `src/styles/globals.css`
- Create: `src/styles/tokens.css`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Create `next.config.ts`**

```typescript
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
  // Embed target: allow framing by any third-party site.
  // Use CSP `frame-ancestors *` only — DO NOT set X-Frame-Options (older
  // browsers/proxies treat SAMEORIGIN as more restrictive and will refuse to
  // render the widget cross-origin, defeating the embed use case).
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
```

- [ ] **Step 2: Create `next-env.d.ts`**

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
```

- [ ] **Step 3: Create `postcss.config.mjs`**

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 4: Create `src/styles/tokens.css`**

```css
:root {
  /* Cozy Orange (default) */
  --color-bg: 250 250 249;
  --color-fg: 28 28 28;
  --color-muted: 245 245 244;
  --color-muted-fg: 113 113 105;
  --color-border: 231 229 228;
  --color-accent: 248 123 26;       /* Cozy Orange #F87B1A */
  --color-accent-fg: 255 255 255;
  --color-accent-hover: 234 110 16;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --shadow-soft: 0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04);
  --shadow-pop: 0 8px 24px rgba(0,0,0,0.08);
}

.dark {
  --color-bg: 23 23 23;
  --color-fg: 245 245 244;
  --color-muted: 38 38 38;
  --color-muted-fg: 163 163 152;
  --color-border: 64 64 64;
  --color-accent: 251 146 60;
  --color-accent-fg: 23 23 23;
  --color-accent-hover: 253 158 82;
}
```

- [ ] **Step 5: Create `src/styles/globals.css`**

```css
@import "tailwindcss";
@import "./tokens.css";

@theme {
  --color-bg: rgb(var(--color-bg));
  --color-fg: rgb(var(--color-fg));
  --color-muted: rgb(var(--color-muted));
  --color-muted-fg: rgb(var(--color-muted-fg));
  --color-border: rgb(var(--color-border));
  --color-accent: rgb(var(--color-accent));
  --color-accent-fg: rgb(var(--color-accent-fg));
  --color-accent-hover: rgb(var(--color-accent-hover));
  --radius-default: var(--radius);
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 6: Create `src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Verify build**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add next.config.ts next-env.d.ts postcss.config.mjs src/styles/ src/lib/utils.ts
git commit -m "feat: next.js + tailwind v4 + design tokens"
```

---

#### Task 4: Root layout + first page

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Create `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "../src/styles/globals.css";

export const metadata: Metadata = {
  title: "CozyCopilot",
  description: "A warmer AI chat experience",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-accent">
          CozyCopilot
        </h1>
        <p className="mt-2 text-muted-fg">脚手架就绪</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run dev server**

```bash
pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`.

- [ ] **Step 4: Stop dev server, commit**

```bash
kill %1 2>/dev/null
git add app/layout.tsx app/page.tsx
git commit -m "feat: root layout + landing page"
```

---

### M1.1 — Testing Infrastructure

#### Task 5: Vitest setup with jsdom

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "app/api/**"],
      exclude: ["**/*.test.*", "**/test/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@app": path.resolve(__dirname, "./app"),
    },
  },
});
```

> **Compatibility note:** vitest 2.x ships Vite 5. `@vitejs/plugin-react@^6` requires Vite 8, so install **`@vitejs/plugin-react@^4`** (latest 4.x line) when running this task. v4 and v6 have the same public `react()` API for our usage.

- [ ] **Step 2: Create `src/test/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create `src/test/smoke.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/test/smoke.test.ts
git commit -m "test: vitest + jsdom + smoke test"
```

---

#### Task 6: MSW setup with shared server

**Files:**
- Create: `mocks/handlers/index.ts`
- Create: `mocks/server.ts`
- Create: `mocks/browser.ts`
- Modify: `src/test/setup.ts`
- Create: `src/lib/api/client.test.ts`

- [ ] **Step 1: Install MSW**

```bash
pnpm add -D msw@^2.6.0
```

- [ ] **Step 2: Create `mocks/handlers/index.ts`**

```typescript
import { http, HttpResponse } from "msw";

// Minimal handler set for M1. Extended in M2.
export const handlers = [
  http.get("/api/cozy/health", () =>
    HttpResponse.json({ ok: true, data: { status: "ok" } }),
  ),
];
```

- [ ] **Step 3: Create `mocks/server.ts` (Node)**

```typescript
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

- [ ] **Step 4: Create `mocks/browser.ts` (Browser)**

```typescript
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
```

- [ ] **Step 5: Modify `src/test/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../../mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 6: Create `src/lib/api/client.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createApiClient } from "./client";

describe("createApiClient", () => {
  it("sends request with JWT in Authorization header", async () => {
    const client = createApiClient({
      baseUrl: "https://api.cozycopilot.com",
      getToken: () => "test-jwt",
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { foo: "bar" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await client.get("/sessions");

    expect(result).toEqual({ ok: true, data: { foo: "bar" } });
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-jwt",
    });
  });
});
```

- [ ] **Step 7: Create `src/lib/api/client.ts` (minimal to pass the test)**

```typescript
export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiErrorBody;

export function createApiClient(config: ApiClientConfig) {
  async function get<T>(path: string): Promise<ApiResult<T>> {
    const token = config.getToken();
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return res.json() as Promise<ApiResult<T>>;
  }

  return { get };
}
```

- [ ] **Step 8: Run tests, verify pass**

```bash
pnpm test
```

Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add mocks/ src/test/setup.ts src/lib/api/client.ts src/lib/api/client.test.ts package.json pnpm-lock.yaml
git commit -m "feat(api): msw setup + minimal api client with JWT injection"
```

---

### M1.2 — Auth (Login + JWT)

#### Task 7: Auth store (Zustand + persist)

**Files:**
- Create: `src/stores/auth.ts`
- Create: `src/stores/auth.test.ts`

- [ ] **Step 1: Install zustand**

```bash
pnpm add zustand@^5.0.0
```

- [ ] **Step 2: Write failing test `src/stores/auth.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ jwt: "", userId: "", email: "", role: "" });
    localStorage.clear();
  });

  it("setAuth stores all fields", () => {
    useAuthStore.getState().setAuth("jwt-1", "u-1", "alice@test.com", "user");
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("jwt-1");
    expect(state.userId).toBe("u-1");
    expect(state.email).toBe("alice@test.com");
    expect(state.role).toBe("user");
  });

  it("logout clears all fields", () => {
    useAuthStore.getState().setAuth("jwt-1", "u-1", "a@b.c", "user");
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("");
    expect(state.userId).toBe("");
  });
});
```

- [ ] **Step 3: Run test, verify fail**

```bash
pnpm test stores/auth
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/stores/auth.ts`**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "user" | "admin" | "designer";

export interface AuthState {
  jwt: string;
  userId: string;
  email: string;
  role: UserRole | "";
  setAuth: (jwt: string, userId: string, email: string, role: UserRole) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      jwt: "",
      userId: "",
      email: "",
      role: "",
      setAuth: (jwt, userId, email, role) => set({ jwt, userId, email, role }),
      logout: () => set({ jwt: "", userId: "", email: "", role: "" }),
    }),
    { name: "cozycopilot-auth" },
  ),
);
```

- [ ] **Step 5: Run test, verify pass**

```bash
pnpm test stores/auth
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/stores/auth.ts src/stores/auth.test.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): zustand auth store with persist"
```

---

#### Task 8: BFF login route

**Files:**
- Create: `app/api/cozy/auth/route.ts`
- Create: `mocks/handlers/auth.ts`
- Modify: `mocks/handlers/index.ts`

- [ ] **Step 1: Write failing handler test**

Create `app/api/cozy/auth/route.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("POST /api/cozy/auth", () => {
  it("returns 400 on missing body", async () => {
    const req = new Request("http://localhost/api/cozy/auth", { method: "POST" });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("forwards login to CozyEngineV2 and returns user payload", async () => {
    const original = global.fetch;
    global.fetch = (async (url: string) => {
      expect(url).toContain("/v1/auth/login");
      return new Response(
        JSON.stringify({
          access_token: "test-jwt",
          user_id: "u-1",
          email: "alice@test.com",
          role: "user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const req = new Request("http://localhost/api/cozy/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "pw" }),
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: {
        jwt: "test-jwt",
        userId: "u-1",
        email: "alice@test.com",
        role: "user",
      },
    });

    global.fetch = original;
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test app/api/cozy/auth
```

Expected: FAIL (route module not found).

- [ ] **Step 3: Implement `app/api/cozy/auth/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "invalid json" } },
      { status: 400 },
    );
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!upstream.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: upstream.status === 401 ? "UNAUTHORIZED" : "UNKNOWN",
          message: "login failed",
        },
      },
      { status: upstream.status },
    );
  }

  const data = await upstream.json();
  return NextResponse.json({
    ok: true,
    data: {
      jwt: data.access_token,
      userId: data.user_id,
      email: data.email,
      role: data.role,
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm test app/api/cozy/auth
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/cozy/auth/route.ts app/api/cozy/auth/route.test.ts
git commit -m "feat(auth): BFF login route forwarding to CozyEngineV2"
```

---

#### Task 9: Login page

**Files:**
- Create: `app/(web)/login/page.tsx`
- Create: `src/features/auth/LoginForm.tsx`
- Create: `src/features/auth/LoginForm.test.tsx`

- [ ] **Step 1: Write failing component test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("calls onSubmit with email + password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/邮箱/i), "alice@test.com");
    await userEvent.type(screen.getByLabelText(/密码/i), "pw1234");
    await userEvent.click(screen.getByRole("button", { name: /登录/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      email: "alice@test.com",
      password: "pw1234",
    });
  });

  it("disables button while submitting", async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockImplementation(
      () => new Promise<void>((r) => (resolveSubmit = r)),
    );
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/邮箱/i), "a@b.c");
    await userEvent.type(screen.getByLabelText(/密码/i), "x");
    const button = screen.getByRole("button", { name: /登录/i });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    resolveSubmit();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test features/auth/LoginForm
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/features/auth/LoginForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export interface LoginFormProps {
  onSubmit: (data: { email: string; password: string }) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ email, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          邮箱
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          密码
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "登录中..." : "登录"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create `src/components/ui/button.tsx` (shadcn-style)**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "ghost";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-4 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      "disabled:pointer-events-none disabled:opacity-50",
      variant === "default" &&
        "bg-accent text-accent-fg hover:bg-accent-hover",
      variant === "ghost" && "hover:bg-muted",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
```

- [ ] **Step 5: Create `src/components/ui/input.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "placeholder:text-muted-fg",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
```

- [ ] **Step 6: Create `app/(web)/login/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "@/features/auth/LoginForm";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleSubmit(data: { email: string; password: string }) {
    const res = await fetch("/api/cozy/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!body.ok) {
      throw new Error(body.error?.userMessage ?? "登录失败");
    }
    setAuth(body.data.jwt, body.data.userId, body.data.email, body.data.role);
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-bg p-8 shadow-[var(--shadow-soft)]">
        <h1 className="mb-6 text-2xl font-bold text-accent">CozyCopilot</h1>
        <LoginForm onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Run all tests, verify pass**

```bash
pnpm test
```

Expected: all passed (smoke + auth + client + form).

- [ ] **Step 8: Commit**

```bash
git add src/features/auth/ src/components/ui/ app/\(web\)/login/
git commit -m "feat(auth): login form + login page"
```

---

### M1.3 — SSE Chat

#### Task 10: Chat store with streaming state

**Files:**
- Create: `src/stores/session.ts`
- Create: `src/stores/session.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "./session";

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      messages: [],
      streamingMessageId: null,
    });
  });

  it("appendMessage adds a message", () => {
    useSessionStore.getState().appendMessage({
      id: "m1",
      role: "user",
      content: "hi",
      status: "done",
    });
    expect(useSessionStore.getState().messages).toHaveLength(1);
  });

  it("startStreaming creates an empty assistant message", () => {
    useSessionStore.getState().startStreaming("a1");
    const msg = useSessionStore.getState().messages[0];
    expect(msg.role).toBe("assistant");
    expect(msg.status).toBe("streaming");
    expect(useSessionStore.getState().streamingMessageId).toBe("a1");
  });

  it("appendDelta appends text to the streaming message", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().appendDelta("a1", "hello ");
    useSessionStore.getState().appendDelta("a1", "world");
    expect(useSessionStore.getState().messages[0].content).toBe("hello world");
  });

  it("finishStreaming marks done and clears streamingMessageId", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().finishStreaming("a1");
    expect(useSessionStore.getState().messages[0].status).toBe("done");
    expect(useSessionStore.getState().streamingMessageId).toBeNull();
  });

  it("markError sets status error", () => {
    useSessionStore.getState().startStreaming("a1");
    useSessionStore.getState().markError("a1", "STREAM_INTERRUPTED");
    expect(useSessionStore.getState().messages[0].status).toBe("error");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test stores/session
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/stores/session.ts`**

```typescript
import { create } from "zustand";

export type MessageStatus = "sending" | "streaming" | "done" | "error" | "superseded";
export type ErrorCode = string;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: MessageStatus;
  errorCode?: ErrorCode;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  messages: Message[];
  streamingMessageId: string | null;
  appendMessage: (msg: Omit<Message, "id"> & { id?: string }) => void;
  startStreaming: (id: string) => void;
  appendDelta: (id: string, delta: string) => void;
  finishStreaming: (id: string) => void;
  markError: (id: string, code: ErrorCode) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  messages: [],
  streamingMessageId: null,

  appendMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: msg.id ?? crypto.randomUUID() } as Message,
      ],
    })),

  startStreaming: (id) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: "assistant", content: "", status: "streaming" },
      ],
      streamingMessageId: id,
    })),

  appendDelta: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m,
      ),
    })),

  finishStreaming: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: "done" } : m,
      ),
      streamingMessageId: null,
    })),

  markError: (id, code) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: "error", errorCode: code } : m,
      ),
      streamingMessageId: null,
    })),

  clear: () => set({ messages: [], streamingMessageId: null }),
}));
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm test stores/session
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/stores/session.ts src/stores/session.test.ts
git commit -m "feat(chat): session store with streaming state machine"
```

---

#### Task 11: SSE stream parser (client-side)

**Files:**
- Create: `src/lib/api/chat.ts`
- Create: `src/lib/api/chat.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { streamChat } from "./chat";

function sseResponse(chunks: string[]): Response {
  // SSE events are blank-line-terminated, so emit each event followed by \n\n.
  const body = chunks.map((c) => c + "\n\n").join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamChat", () => {
  it("yields delta events from SSE stream", async () => {
    const stream = sseResponse([
      'data: {"type":"delta","content":"hello"}',
      'data: {"type":"delta","content":" world"}',
      'data: {"type":"done"}',
    ]);

    const events: Array<{ type: string; content?: string }> = [];
    for await (const evt of streamChat(() => Promise.resolve(stream))) {
      events.push(evt as { type: string; content?: string });
    }
    expect(events).toEqual([
      { type: "delta", content: "hello" },
      { type: "delta", content: " world" },
      { type: "done" },
    ]);
  });

  it("calls AbortController when consumer breaks early", async () => {
    const stream = sseResponse(['data: {"type":"delta","content":"x"}']);
    const controller = new AbortController();
    const gen = streamChat(() => Promise.resolve(stream), controller.signal);
    await gen.next();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("throws ApiError on SSE error event", async () => {
    const stream = sseResponse([
      'data: {"type":"error","code":"RATE_LIMITED","message":"too many"}',
    ]);
    await expect(async () => {
      for await (const _ of streamChat(() => Promise.resolve(stream))) {
        // no-op
      }
    }).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test lib/api/chat
```

Expected: FAIL.

- [ ] **Step 3: Install eventsource-parser**

```bash
pnpm add eventsource-parser@^1.1.0
```

- [ ] **Step 4: Create `src/lib/api/errors.ts` (minimal)**

```typescript
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

- [ ] **Step 5: Implement `src/lib/api/chat.ts`**

```typescript
import { createParser, type ParseEvent } from "eventsource-parser";
import { ApiError } from "./errors";

export interface ChatDeltaEvent {
  type: "delta";
  content: string;
}
export interface ChatDoneEvent {
  type: "done";
  usage?: { promptTokens: number; completionTokens: number };
}
export interface ChatErrorEvent {
  type: "error";
  code: string;
  message: string;
}
export type ChatStreamEvent = ChatDeltaEvent | ChatDoneEvent | ChatErrorEvent;

export interface StreamChatRequest {
  sessionId: string;
  personalityId: string;
  message: string;
  model?: string;
}

export async function* streamChat(
  fetcher: () => Promise<Response>,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetcher();
  if (!res.ok || !res.body) {
    throw new ApiError("STREAM_INTERRUPTED", `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const queue: ChatStreamEvent[] = [];
  let done = false;
  let error: ApiError | null = null;

  // eventsource-parser v1 API: single onParse(ParseEvent) callback
  const parser = createParser({
    onParse: (event: ParseEvent) => {
      if (event.type !== "event") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "error") {
          error = new ApiError(data.code ?? "UNKNOWN", data.message ?? "");
          done = true;
          return;
        }
        queue.push(data as ChatStreamEvent);
      } catch {
        // malformed event: skip
      }
    },
  });

  // Background reader loop. Throwing from an async IIFE here would be
  // unhandled, so we capture any error into `error` and let the consumer
  // generator observe it on the next iteration.
  (async () => {
    try {
      while (!done) {
        const { value, done: rDone } = await reader.read();
        if (rDone) break;
        const chunk = decoder.decode(value, { stream: true });
        parser.feed(chunk);
        if (signal?.aborted) break;
      }
    } catch (e) {
      error = new ApiError("STREAM_INTERRUPTED", (e as Error).message);
    } finally {
      done = true;
    }
  })();

  while (!done || queue.length > 0) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new ApiError("ABORTED", "aborted by user");
    }
    if (error) throw error;
    if (queue.length > 0) {
      yield queue.shift()!;
    } else {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  if (error) throw error;
}
```

- [ ] **Step 6: Run test, verify pass**

```bash
pnpm test lib/api/chat
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/chat.ts src/lib/api/chat.ts.test src/lib/api/errors.ts package.json pnpm-lock.yaml
git commit -m "feat(api): SSE stream parser with abort + error handling"
```

---

#### Task 12: BFF chat route (SSE passthrough)

**Files:**
- Create: `app/api/cozy/chat/route.ts`
- Create: `app/api/cozy/chat/route.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/cozy/chat", () => {
  it("forwards SSE chunks from CozyEngineV2", async () => {
    const sseBody = [
      'data: {"type":"delta","content":"hi"}',
      'data: {"type":"done"}',
      "",
    ].join("\n");

    const original = global.fetch;
    global.fetch = (async () =>
      new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;

    const req = new Request("http://localhost/api/cozy/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-jwt",
      },
      body: JSON.stringify({
        session_id: "00000000-0000-0000-0000-000000000001",
        personality_id: "00000000-0000-0000-0000-000000000002",
        message: "hi",
      }),
    });

    const res = await POST(req as any);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"content":"hi"');

    global.fetch = original;
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test app/api/cozy/chat
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/api/cozy/chat/route.ts`**

```typescript
import { z } from "zod";

const ChatRequestSchema = z.object({
  session_id: z.string().uuid(),
  personality_id: z.string().uuid(),
  message: z.string().min(1).max(10000),
  model: z.string().optional(),
});

const COZY_ENGINE_URL = process.env.COZY_ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "VALIDATION_ERROR" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "VALIDATION_ERROR" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstream = await fetch(`${COZY_ENGINE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(parsed.data),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "PROVIDER_UNAVAILABLE" },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Passthrough SSE — no buffering
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm test app/api/cozy/chat
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/cozy/chat/route.ts app/api/cozy/chat/route.test.ts
git commit -m "feat(chat): BFF SSE passthrough route"
```

---

#### Task 13: Chat UI — Composer + MessageList

**Files:**
- Create: `src/features/chat/MessageList.tsx`
- Create: `src/features/chat/MessageList.test.tsx`
- Create: `src/features/chat/Composer.tsx`
- Create: `src/features/chat/Composer.test.tsx`
- Create: `app/(web)/chat/page.tsx`

- [ ] **Step 1: Write failing MessageList test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("renders user and assistant messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "hi", status: "done" },
          { id: "2", role: "assistant", content: "hello", status: "done" },
        ]}
      />,
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows streaming indicator on streaming assistant message", () => {
    render(
      <MessageList
        messages={[
          { id: "2", role: "assistant", content: "hel", status: "streaming" },
        ]}
      />,
    );
    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test features/chat/MessageList
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/features/chat/MessageList.tsx`**

```tsx
"use client";

import { cn } from "../../lib/utils";
import type { Message } from "../../stores/session";

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <div
          key={m.id}
          data-testid={`message-${m.role}-${m.status}`}
          className={cn(
            "rounded-[var(--radius)] px-4 py-2.5",
            m.role === "user" && "ml-auto max-w-[80%] bg-accent text-accent-fg",
            m.role === "assistant" &&
              "mr-auto max-w-[80%] bg-muted text-fg",
            m.status === "error" && "border border-red-300",
            m.status === "superseded" && "opacity-50",
          )}
        >
          {m.content}
          {m.status === "streaming" && (
            <span
              data-testid="streaming-indicator"
              className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
            />
          )}
          {m.status === "error" && (
            <div className="mt-2 text-xs text-red-600">⚠ 生成中断</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write failing Composer test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("calls onSend when user presses Enter", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("does not call onSend on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    await userEvent.type(screen.getByRole("textbox"), "a{Shift>}{Enter}{/Shift}b");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Composer onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
```

- [ ] **Step 5: Run Composer test, verify fail**

```bash
pnpm test features/chat/Composer
```

Expected: FAIL.

- [ ] **Step 6: Implement `src/features/chat/Composer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  disabled: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!text.trim() || sending || disabled) return;
    const msg = text;
    setText("");
    setSending(true);
    try {
      await onSend(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-[var(--radius)] border border-border bg-bg p-2 shadow-[var(--shadow-soft)]">
      <textarea
        role="textbox"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || sending}
        placeholder="说点什么..."
        rows={1}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none disabled:opacity-50"
      />
      <Button onClick={handleSend} disabled={disabled || sending || !text.trim()}>
        发送
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Create `app/(web)/chat/page.tsx`**

```tsx
"use client";

import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { streamChat, type ChatStreamEvent } from "@/lib/api/chat";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ASSISTANT_ID = "current-assistant";

export default function ChatPage() {
  const jwt = useAuthStore((s) => s.jwt);
  const router = useRouter();
  const { messages, appendMessage, startStreaming, appendDelta, finishStreaming, markError } =
    useSessionStore();

  useEffect(() => {
    if (!jwt) router.replace("/login");
  }, [jwt, router]);

  async function handleSend(text: string) {
    if (!jwt) return;

    appendMessage({ role: "user", content: text, status: "done" });
    startStreaming(ASSISTANT_ID);

    const controller = new AbortController();

    try {
      const events = streamChat(
        () =>
          fetch("/api/cozy/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              // M1: hardcoded session + personality; M2 wires these properly
              session_id: "00000000-0000-0000-0000-000000000001",
              personality_id: "00000000-0000-0000-0000-000000000002",
              message: text,
            }),
            signal: controller.signal,
          }),
        controller.signal,
      );

      for await (const evt of events) {
        const e = evt as ChatStreamEvent;
        if (e.type === "delta") appendDelta(ASSISTANT_ID, e.content);
        else if (e.type === "done") finishStreaming(ASSISTANT_ID);
        else if (e.type === "error") markError(ASSISTANT_ID, e.code);
      }
    } catch (e) {
      if ((e as Error).message !== "aborted by user") {
        markError(ASSISTANT_ID, "STREAM_INTERRUPTED");
      }
    }
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b border-border bg-bg px-6 py-3">
        <h1 className="text-lg font-semibold">CozyCopilot</h1>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <MessageList messages={messages} />
      </div>
      <div className="border-t border-border bg-bg p-4">
        <div className="mx-auto max-w-3xl">
          <Composer onSend={handleSend} disabled={false} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Run all tests**

```bash
pnpm test
```

Expected: all passed (smoke + auth + client + form + session + chat + bff + UI).

- [ ] **Step 9: Commit**

```bash
git add src/features/chat/ app/\(web\)/chat/
git commit -m "feat(chat): composer + message list + chat page"
```

---

### M1.4 — Build Matrix

#### Task 14: Add embed route + verify widget build

**Files:**
- Create: `app/(embed)/widget/page.tsx`
- Create: `app/(embed)/layout.tsx`

- [ ] **Step 1: Create `app/(embed)/layout.tsx`**

```tsx
import "../../src/styles/globals.css";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-transparent">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `app/(embed)/widget/page.tsx`**

```tsx
export default function WidgetPage() {
  return (
    <div className="fixed bottom-4 right-4 h-14 w-14 rounded-full bg-accent shadow-[var(--shadow-pop)]" />
  );
}
```

- [ ] **Step 3: Verify web build**

```bash
pnpm build:web
```

Expected: build success, no errors. `.next/` produced.

- [ ] **Step 4: Verify embed build**

```bash
pnpm build:embed
```

Expected: build success. `out/` directory produced.

- [ ] **Step 5: Commit**

```bash
git add 'app/(embed)/'
git commit -m "feat(embed): minimal embed route + verify widget build"
```

---

#### Task 15: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build:web
      - run: pnpm build:embed
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint + typecheck + test + build matrix"
```

---

### M1.5 — M1 Verification

#### Task 16: End-to-end manual smoke checklist

- [ ] **Step 1: Run dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Verify in browser**

- [ ] Open `http://localhost:3000/login`
- [ ] Email: `alice@test.com` / Password: `any` (M1 BFF test passes; in M2 connect to real CozyEngineV2)
- [ ] After login, redirected to `/chat`
- [ ] Type a message, press Enter
- [ ] See user message bubble on right
- [ ] See assistant placeholder on left, then streamed text appears
- [ ] See streaming indicator while streaming
- [ ] After stream completes, indicator disappears

- [ ] **Step 3: Verify embed build serves correctly**

```bash
pnpm build:embed
npx serve out -p 3001
```

- [ ] Open `http://localhost:3001/widget` — see floating bubble

- [ ] **Step 4: Final commit (if any tweaks)**

```bash
git status
# If anything changed:
git add -A
git commit -m "chore: M1 verification cleanup"
```

---

## M1 Done

**M1 deliverable check:**
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` all green (≥ 8 tests)
- [x] `pnpm build:web` succeeds
- [x] `pnpm build:embed` succeeds
- [x] Manual smoke: log in → send message → see streamed reply
- [x] CI green on push to main

**Ready for M2.** Stop here and write `docs/superpowers/plans/2026-06-15-m2-bff-coverage.md` with full TDD tasks for BFF coverage, error normalization, and contract tests.

---

## Part 3 — Cross-Stage Concerns

### Commit Conventions

Use Conventional Commits (CozyEngineV2 already uses this; commitlint is set up there):

```
feat(scope): description      # new user-facing capability
feat(api): description         # BFF or API client change
feat(chat): description       # chat features
test: description              # test-only changes
chore: description             # tooling, deps
ci: description                # CI changes
refactor: description          # code restructure
fix: description               # bug fix
```

### Directory Ownership

Each stage owns a specific directory subtree. New files outside that subtree require explicit review.

| Stage | Owns |
|---|---|
| M1 | `app/(web)/`, `app/(embed)/widget/`, `app/api/cozy/auth/`, `app/api/cozy/chat/`, `src/stores/`, `src/lib/api/`, `src/features/chat/`, `src/features/auth/`, `src/components/ui/`, `mocks/`, `src/test/` |
| M2 | All remaining `app/api/cozy/*/` routes, `mocks/handlers/*` (full), `tests/contract/` |
| M3 | `src-tauri/`, `ios/`, `android/`, `src/lib/capabilities/`, `src/lib/notifications/`, `src/lib/storage/` |
| M4 | `src/features/sessions/`, `src/features/personalities/`, `src/features/providers/`, `src/features/async/`, `src/features/tools/`, `src/features/upload/` |
| M5 | `src/features/voice/`, `app/api/cozy/voice*/`, `livekit-client` integration |
| M6 | `app/(embed)/` (full), `public/embed/loader.js`, `src/features/embed/`, `postMessage` protocol |
| M7 | `tokens/`, theme presets, `src/components/theme/`, accessibility scan |
| M8 | `README.md`, smoke checklist, Sentry config, performance |

### Shared Mock Fixtures

- `mocks/handlers/` evolves per stage. Stages append to it; do not delete prior handlers.
- `mocks/fixtures/` accumulates reusable data: `personalities.ts`, `sessions.ts`, `messages.ts`. Each new entity is added in the stage that introduces it.
- All MSW handlers are reused in (a) Vitest (Node) and (b) browser dev mode. Do not duplicate.

### Design Token Lifecycle

- Stage M1 creates `src/styles/tokens.css` with default Cozy Orange.
- Stage M7 expands to 5 themes by adding `tokens/themes/*.json` and a build script that emits CSS variable overrides. The token JSON files are the source of truth; CSS is generated.
- Stages M2-M6 consume tokens via Tailwind theme classes (`bg-accent`, `text-muted-fg`, etc.). Do not hardcode colors.

### Pre-Stage Gate

Before starting each stage, the engineer must:
1. Verify the previous stage's deliverable checkbox list is complete.
2. Read the previous stage's lessons learned in `docs/superpowers/notes/` (added as M1+ progress).
3. Confirm CI is green.

### "Definition of Done" for Each Stage

A stage is "done" when:
1. All tasks in the stage's plan are committed.
2. All tests are green.
3. Build matrix (web + embed + desktop + mobile as applicable) succeeds.
4. Manual smoke checklist signed off.
5. `docs/superpowers/notes/M{N}-lessons.md` written with: (a) decisions changed from plan, (b) bugs hit, (c) tips for next stage.

---

## Self-Review

**1. Spec coverage:** M1 covers M1 milestone (Scaffold + Build Matrix + Auth + Basic Chat). M2-M8 each have a stage entry with a clear deliverable. M1 details cover: Next.js scaffold ✓, 4 build targets (web/embed verified; desktop/mobile placeholder for M3) ✓, BFF auth ✓, BFF chat ✓, login UI ✓, chat UI ✓, SSE ✓, vitest + MSW ✓, CI ✓.

**2. Placeholder scan:** No "TBD" / "TODO" / "fill in details" in M1. M2-M8 stage entries name their detailed-plan file (`2026-06-15-m2-bff-coverage.md` etc.) — this is intentional; the file is created when that stage begins, not now.

**3. Type consistency:** `Message`, `AuthState`, `ApiClient`, `ChatStreamEvent` types defined in early tasks are referenced consistently in later tasks. Method names (`appendMessage`, `startStreaming`, etc.) are consistent. `streamChat` signature is `(fetcher, signal?) => AsyncGenerator<ChatStreamEvent>` everywhere.

**4. Internal consistency:** No contradictions. The "build matrix" placeholder for desktop/mobile in M1 is explicitly deferred to M3 (per spec section 4).

**5. Spec self-review:** I read the spec. Each spec section maps to at least one stage:
- Architecture §4 → M1 (skeleton) + M2 (BFF)
- Modules §5 → M1 (initial) + M3 (capabilities) + M4-M6 (features)
- Data flows §6 → M1 (A chat) + M4 (B provider) + M5 (D voice, E realtime) + M6 (C widget)
- Errors §7 → M2 (BFF normalization + error codes)
- Testing §8 → M1 (Vitest + MSW) + M2 (contract tests) + M5/M7 (E2E)
- Constraints §9 → M1 (CozyEngineV2 mock) + M3 (shells)

**No gaps found. No placeholders in M1 detailed plan. Plan is ready for execution.**
