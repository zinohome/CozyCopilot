# CozyCopilot 设计 Spec

| 字段 | 值 |
|---|---|
| 日期 | 2026-06-10 |
| 作者 | (brainstorm 协作产出) |
| 状态 | 待用户复核 |
| 后端依赖 | CozyEngineV2（已完成，本仓库不实现）、CozyMemory（独立服务）、CozyVoice（独立服务） |
| 范围 | 单仓单包，4 个发布形态（web 自有站 / web 嵌入 widget / Tauri 桌面 / Capacitor 移动） |

---

## 1. 背景与目标

### 1.1 背景

CozyEngineV2 已是生产级的 FastAPI 后端：4 个 LLM provider、多人格系统、WebSocket/SSE、JWT 鉴权、ToolCall、Cerebellum 工具网关、Realtime 语音（经 CozyVoice）、四重记忆（经 CozyMemory）。但**唯独缺一个面向终端用户的多端聊天前端**。

CozyCopilot 填补这个缺口，对接 CozyEngineV2 的完整能力，并要求"比 Claude Chat 更好看"。

### 1.2 目标

1. 在 4 个形态（web 自有站 / web 嵌入 widget / Tauri 桌面 / Capacitor 移动）提供一致且高质量的聊天体验。
2. UI 风格走"温暖交互风"路线，区别于 Claude 的中性冷淡，确立产品身份。
3. 完整对接 CozyEngineV2 的核心能力：聊天、人格、历史、WebSocket、异步任务、文件图片、ToolCall、TTS/STT、Realtime 语音、自定义 LLM 接入。
4. 单仓单包，**多端代码复用率 ≥ 95%**。
5. 性能：web 自有站 LCP < 2.5s，widget bundle < 150KB gzip。

### 1.3 非目标（v1.0 不做）

- 后端实现（CozyEngineV2、CozyMemory、CozyVoice 各自独立仓库，本项目不实现）
- 多用户协作会话
- 自定义 LLM Provider 的"多协议"扩展（仅 OpenAI 兼容协议）
- 插件市场
- 移动端推送通知（仅 web 端 OS 通知）
- Storybook / 视觉回归 / 性能基准
- tauri-driver / Appium 自动化（仅手动 smoke）

---

## 2. 范围

### 2.1 v1.0 必须包含

| 类别 | 能力 |
|---|---|
| 聊天 | 流式聊天（SSE `/v1/chat/completions`）、乐观消息、停止生成、重新生成、断流恢复 |
| 人格 | 浏览、选择、查看详情 |
| 历史 | 会话列表、加载历史消息、删除/归档、虚拟滚动 |
| 实时 | WebSocket 双向（`/v1/ws/chat`）：工具调用可视化、输入状态、中途打断 |
| 异步 | `/v1/chat/async` + DeferredResponse，轮询/WebSocket 推送，OS 通知 |
| 附件 | 文件/图片本地选择，提示词内嵌（base64 或 OSS URL） |
| ToolCall | 渲染工具调用块（紫条带样式），折叠/展开 arguments/result |
| TTS/STT | 录音→上传→转写→回复，文字转语音回放 |
| Realtime | LiveKit 进房、语音通话、通话结束回写 turns + tool_calls |
| 自定义 LLM | 用户级 OpenAI 兼容 Provider 增删查、连接测试、Key 加密存储 |
| 嵌入 widget | 浮动气泡、postMessage 双向通信、query string 配置、预填消息、隐藏历史 |
| 认证 | 邮箱 + 密码、JWT 自动 refresh、HttpOnly cookie（web）/ 持久化（壳子） |
| 主题 | 多主题预设可切换，默认 Cozy 橙 |

### 2.2 v1.1+ 候选

- 多 LLM 协议（Gemini / Bedrock / Azure OpenAI 原生）
- Storybook + Chromatic 视觉回归
- 桌面 tauri-driver E2E
- 移动 Appium E2E
- 移动推送通知
- 协作文战（多人同时编辑同一 session）
- 离线消息草稿本地持久化（已部分支持，留作完整版）

---

## 3. 用户场景

### 3.1 主要用户画像

| 画像 | 描述 | 主要形态 |
|---|---|---|
| 个人用户 | 注册、登录、与 AI 多轮对话、管理自己的会话 | Web 自有站、Tauri 桌面、Capacitor 移动 |
| 嵌入站点访客 | 第三方网站嵌入 CozyCopilot widget 与 AI 交互 | Web 嵌入 widget |
| 高级用户 | 配置自定义 LLM Provider、调试连接 | Web 自有站设置页 |

### 3.2 关键场景

1. 用户在桌面 Tauri 应用打开一个旧会话，AI 流式回复历史问题。
2. 用户在手机 Capacitor app 录音提问，看到文字 + 听到 AI 语音回复。
3. 用户在第三方网站点击右下角气泡，AI 解答问题并通过 postMessage 触发"加入购物车"。
4. 高级用户在设置页添加一个 OpenRouter 的 API Key，在人格编辑页选用，AI 用 OpenRouter 的模型回复。
5. 用户中途网络断开，看到"重新生成"按钮，点击后 AI 重新回答。
6. 主题切换为 Calm Blue，整站颜色变化，刷新后保持。
7. Realtime 通话中，iOS 后台杀进程，回到前台时自动重连或降级到非实时。

---

## 4. 架构

### 4.1 系统全景

```
┌──────────────────────────────────────────────────────────────┐
│  终端形态（同一份 web bundle，多种宿主）                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Web 自有站│  │ Web 嵌入  │  │ Tauri 桌面│  │Capacitor │    │
│  │ (browser) │  │ (iframe) │  │(mac/win)  │  │ (iOS/   │    │
│  │          │  │          │  │          │  │  Android)│    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼──────────────┼──────────────┼──────────────┼─────────┘
        │              │              │              │
        └──────────────┴──────┬───────┴──────────────┘
                             │  HTTPS / WSS
                             ▼
        ┌────────────────────────────────────────┐
        │   CozyCopilot BFF (Next.js API routes)  │  ← JWT 注入、CORS、限流、stream 转发
        │   - /api/cozy/* （薄代理 + 鉴权）       │
        │   - /api/ws/chat （WebSocket 中转）     │
        └────────────────────┬───────────────────┘
                             │  HTTPS / WSS
                             ▼
        ┌────────────────────────────────────────┐
        │   CozyEngineV2 (FastAPI)               │  ← 已存在
        │   - /v1/chat/completions, /v1/ws/chat  │
        │   - /v1/personalities, /v1/sessions    │
        │   - /v1/voice/*, /v1/auth, /v1/tools    │
        │   - /v1/chat/voice_context, voice_summary │
        │   - /v1/users/me/providers (CozyEngineV2 增量) │
        └─────┬───────────────────────────┬───────┘
              │                           │
              ▼                           ▼
        ┌──────────────────┐      ┌──────────────────┐
        │  CozyVoice        │      │  CozyMemory       │
        │  (独立服务)        │      │  (独立服务)        │
        │  - /v1/voice/*    │      │  - /api/v1/*      │
        │  - LiveKit Worker │      │  - X-Cozy-API-Key │
        └──────────────────┘      └──────────────────┘
```

### 4.2 关键决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 仓库结构 | **单仓单包** | 一人项目，monorepo 收益 < 成本 |
| Web 自有站渲染 | **Next.js 15 App Router + RSC** | 与 CozyEngineV2 ui/admin、ui/design 风格统一 |
| Widget 渲染 | 同一项目 `(embed)` 路由 + `output: export` | 零代码分叉，桌面/移动壳共享 |
| BFF | **Next.js API routes** | JWT 注入、CORS、限流、stream 转发 |
| 桌面壳 | **Tauri 2.x** | 安装包 5-10MB、系统托盘、全局快捷键、OS 通知 |
| 移动壳 | **Capacitor 7.x** | iOS / Android 双平台商店上架 |
| 自定义 LLM | **用户级 Provider 配置**（OpenAI 兼容协议） | 90% 需求满足，UI 工作量最小 |
| 鉴权 | JWT（Zustand persist） | CozyEngineV2 `/v1/auth` |
| 状态管理 | Zustand + persist | 鉴权、当前会话、UI 偏好 |
| 数据请求 | TanStack Query v5 | 缓存、重试、乐观更新 |
| 流式 | fetch SSE + eventsource-parser | 不依赖 EventSource |
| WebSocket | 客户端直连 BFF | Tauri 走 native 桥、web 走浏览器原生 |
| 录音 | 分层抽象 | web=MediaRecorder、Capacitor/Tauri 原生权限 |
| 国际化 | 首版仅中文 | 命名规范预留 |
| 设计 tokens | tokens/ JSON + CSS variables | 多主题切换零运行时 |
| 状态机 | 显式 enum | 鉴权、录音、Realtime、网络状态 |

### 4.3 范围外但必需的后端增量

这些由 CozyEngineV2 侧提供，CozyCopilot 假设已交付：

| 增量 | 说明 |
|---|---|
| `user_provider_configs` 表 | user_id、base_url、api_key（加密）、model、label、is_default |
| `GET/POST/DELETE /v1/users/me/providers` | 用户自定义 LLM Provider 增删查 |
| `POST /v1/users/me/providers/test` | 连接测试（不存库） |
| `POST /v1/users/me/providers/{id}/use` | 标记为某 session 的 provider |
| 引擎池 user-scoped 解析 | `ChatRequest.model = "<provider_id>:<model_name>"` 编码 |

> 详细 schema 在 CozyEngineV2 自己的 spec 中。本 spec 不替后端写设计。

---

## 5. 模块与目录结构

### 5.1 顶层目录

```
CozyCopilot/
├─ app/                          # Next.js 15 App Router
│  ├─ layout.tsx                 # 根布局（字体、主题、Providers）
│  ├─ (web)/                     # 自有 Web 站路由组
│  │  ├─ layout.tsx              # 带侧边栏 + 顶栏
│  │  ├─ page.tsx                # /              新会话 / 会话列表
│  │  ├─ chat/[sessionId]/       # 已有会话
│  │  ├─ personalities/          # 人格浏览/编辑
│  │  ├─ settings/
│  │  │  ├─ page.tsx             # 通用设置
│  │  │  ├─ providers/           # 自定义 LLM Provider 管理
│  │  │  ├─ memory/              # 记忆预览
│  │  │  └─ theme/               # 主题切换
│  │  ├─ login/
│  │  └─ forbidden/
│  ├─ (embed)/                   # Widget 路由组
│  │  ├─ layout.tsx              # 极简：仅 chat + 浮动气泡根
│  │  ├─ widget/page.tsx         # /widget         嵌入式入口
│  │  └─ widget/compact/page.tsx # /widget/compact 紧凑模式
│  └─ api/                       # BFF（CozyEngineV2 代理层）
│     ├─ cozy/
│     │  ├─ chat/route.ts        # POST → /v1/chat/completions (SSE 透传)
│     │  ├─ chat/async/route.ts  # POST → /v1/chat/async
│     │  ├─ chat/voice/route.ts  # POST → /v1/voice/chat
│     │  ├─ chat/voice-token/route.ts
│     │  ├─ chat/voice-summary/route.ts
│     │  ├─ chat/voice-context/route.ts
│     │  ├─ sessions/route.ts
│     │  ├─ sessions/[id]/route.ts
│     │  ├─ personalities/route.ts
│     │  ├─ providers/route.ts
│     │  ├─ providers/[id]/route.ts
│     │  ├─ providers/test/route.ts
│     │  ├─ memory/preview/route.ts
│     │  ├─ memory/[id]/route.ts
│     │  ├─ voice/token/route.ts
│     │  └─ auth/route.ts
│     └─ ws/chat/route.ts        # WebSocket 中转
│
├─ src/
│  ├─ components/                # 跨业务可复用 UI（原子级）
│  │  ├─ ui/                     # shadcn 基础
│  │  ├─ chat/                   # MessageBubble / MessageList / Composer / ToolCallViewer / ReasoningTrace
│  │  ├─ nav/                    # AppSidebar / TopBar
│  │  └─ theme/                  # ThemeSwitcher / CozyTheme provider
│  ├─ features/                  # 业务模块（垂直切分）
│  │  ├─ chat/                   # 消息流、composer、stream consumer
│  │  ├─ sessions/               # 会话列表、CRUD
│  │  ├─ personalities/          # 人格卡片、选择、详情
│  │  ├─ auth/                   # 登录、注册、JWT 刷新
│  │  ├─ providers/              # 自定义 LLM Provider CRUD
│  │  ├─ voice/                  # TTS / STT 抽象层
│  │  ├─ async/                  # 异步任务轮询 + 通知
│  │  ├─ tools/                  # ToolCall 渲染
│  │  ├─ upload/                 # 文件/图片
│  │  ├─ memory/                 # 记忆预览
│  │  └─ embed/                  # 浮动气泡、iframe 通信
│  ├─ lib/
│  │  ├─ api/                    # 类型化客户端（fetch 包装）
│  │  │  ├─ client.ts            # 统一 fetch + JWT + 错误规范化
│  │  │  ├─ chat.ts              # SSE 流式解析
│  │  │  ├─ ws.ts                # WebSocket 客户端
│  │  │  └─ schemas/             # zod schemas
│  │  ├─ capabilities/           # 多端能力检测
│  │  │  ├─ index.ts             # unified API
│  │  │  ├─ web.ts
│  │  │  ├─ tauri.ts
│  │  │  └─ capacitor.ts
│  │  ├─ storage/                # 统一存储抽象
│  │  ├─ notifications/          # OS 通知
│  │  └─ utils/                  # cn()、date、id
│  ├─ stores/                    # Zustand stores
│  │  ├─ auth.ts
│  │  ├─ session.ts
│  │  ├─ ui.ts
│  │  └─ persist.ts
│  ├─ hooks/
│  ├─ styles/
│  │  ├─ globals.css
│  │  └─ tokens.css              # CSS variables
│  └─ test/                      # 测试工具
│
├─ src-tauri/                    # Tauri 2.x 桌面壳
│  ├─ src/                       # Rust 桥接
│  ├─ tauri.conf.json
│  └─ capabilities/default.json  # 配 microphone 权限
│
├─ ios/ android/                 # Capacitor 7.x 移动壳
│
├─ public/
│  └─ embed/                     # 静态资源（widget bundle 公开）
│
├─ scripts/
│  ├─ build:web
│  ├─ build:embed                # next build + output: export
│  ├─ build:desktop
│  └─ build:mobile
│
├─ tokens/
│  ├─ base.json
│  ├─ themes/
│  │  ├─ cozy-orange.json        # 默认
│  │  ├─ calm-blue.json
│  │  ├─ mint.json
│  │  ├─ lavender.json
│  │  └─ mono.json
│  └─ index.ts
│
├─ tests/
│  ├─ e2e/                       # Playwright
│  └─ contract/                  # BFF ↔ CozyEngineV2 契约
│
├─ mocks/                        # MSW handlers + fixtures
│
├─ next.config.ts                # output: 'export' 仅在 embed 构建时启用
├─ tailwind.config.ts
├─ components.json
├─ tsconfig.json
├─ package.json
└─ pnpm-workspace.yaml           # 占位，不创建真实 workspace
```

### 5.2 模块依赖图

```
                    app/
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    features/    components/    lib/api  ──→ CozyEngineV2 (via app/api)
        │            │            │
        └─────► stores/hooks ◄────┘
                     │
                     ▼
              lib/capabilities
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     Tauri      Capacitor       Web API
```

### 5.3 关键设计杠杆

1. **`features/` vs `components/` 边界**：`components/` 全部是 presentational 组件（不带状态），`features/` 是带状态、调用 hooks 的 container。`components/` 100% 可被 widget / 设置页 / 详情页复用。
2. **`lib/capabilities` 抽象**：业务代码只调 `useCapability('mic')` / `notify(...)` / `store(key, val)`，**不知道自己在 web/tauri/capacitor**。运行时分支只在 `capabilities/{web,tauri,capacitor}.ts` 三个文件。
3. **`app/api/cozy/*` BFF 职责**：鉴权注入、流式透传、错误规范化、限流。**不解析 SSE 内容**，避免缓冲。
4. **`stores/persist.ts` 多端存储**：web=localStorage / Tauri=`@tauri-apps/plugin-store` / Capacitor=`@capacitor/preferences`。
5. **路由组隔离**：`app/(web)` 和 `app/(embed)` 在 Next.js 是**隔离的 layout 树**，互不污染，自动实现轻量 widget bundle。
6. **`output: export` 仅 widget 启用**：自有 Web 站保留 SSR；widget 路由静态导出供 Tauri/Capacitor 加载。

---

## 6. 关键数据流

### 6.1 流 A：聊天（流式 + 取消）

```
用户 → Composer → session store → lib/api/chat → BFF /api/cozy/chat → CozyEngineV2 /v1/chat/completions
                                                                            │
                                                              SSE chunks 透传 │
                                                              ←──────────────┤
                                                              delta 事件追加到消息
取消：AbortController 触发 → fetch abort → BFF 关闭上游 → CozyEngineV2 检测客户端断连 → 中止 orchestrator
```

**关键点**：
- 流式解析在 `lib/api/chat.ts` 内部，业务代码看到 `for await (const delta of streamChat(req))` AsyncIterable 形态
- 乐观消息：用户消息 `sending`、assistant 占位 `streaming`、delta 追加、完成 `done`、失败 `error` + "重试"按钮
- 取消语义：AbortController + BFF 关流 + CozyEngineV2 检测断连
- 断流：保留已生成内容，标记 `error`，按钮"重新生成"（创建新消息，原消息标 `superseded`）
- **不**做流恢复（成本/收益不对等），刷新后从 `GET /v1/sessions/{id}/messages` 重新拉全量
- Token 统计：assistant 消息完成时，从 CozyEngineV2 响应尾部 `usage` 字段透传回前端，写入 `message.metadata`

### 6.2 流 B：自定义 LLM Provider 接入

```
用户在 settings/providers 填 base_url + api_key + model
  → "测试连接" → POST /api/cozy/providers/test （不存库）
      → POST /v1/users/me/providers/test
          → CozyEngineV2 后端以 {base_url, api_key, model} 跑一次最小请求（max_tokens=1）
      ← {ok: true, latency_ms: 234}
  → "保存" → POST /api/cozy/providers
      → POST /v1/users/me/providers
          → INSERT user_provider_configs (api_key encrypted)
      ← {id, label, base_url, model}
用户编辑 personality → model 下拉里出现 "<用户自定义>:<model>" 选项
  → 选中 → 保存 personality
  → 后续该 personality 的 chat 走 model 字段 "<provider_id>:<model_name>" 编码
  → CozyEngineV2 引擎池 user-scoped 解析 → 注入 key → 走 OpenAI 兼容协议
```

**关键点**：
- Key 用 `SYSTEM_MASTER_KEY` 对称加密存后端，前端永远拿不到明文
- 测试连接不存库，避免误存临时 key
- 删除保护：被任何 personality 引用的 provider 不允许删除，返回 `PROVIDER_IN_USE`
- v1.0 仅全局默认 + personality 级；多 provider 切换、人格级 provider 列为扩展点

### 6.3 流 C：Web 嵌入 Widget

```
第三方网站引入 <script src=".../loader.js?key=...&personality=...&theme=...">
  → loader.js 创建 <iframe> 注入 DOM 右下角
      → iframe 加载 /widget
          → 读 query string 配置
          → 检查 cookie / localStorage 看是否有有效 JWT（无则用 ?key 换 JWT）
          → 拉人格详情
          → 应用主题 (accent=#xxx)
          → 渲染浮动气泡
用户点气泡 → 展开 chat panel
  → 预填消息（?prefill=...）时自动塞入 composer
  → postMessage("cozy:session_started", {sessionId, personalityId}) → parent
  → LLM 识别意图 → tool_call → postMessage("cozy:tool_call", ...) → parent
  → parent 回 "cozy:tool_result" → iframe 收到 → 注入 LLM 上下文
```

**IframeEvent schema**：
```typescript
type IframeEvent =
  | { type: "cozy:ready" }
  | { type: "cozy:session_started"; sessionId: string; personalityId: string }
  | { type: "cozy:tool_call"; name: string; args: any }
  | { type: "cozy:tool_result"; name: string; result: any; isError?: boolean }
  | { type: "cozy:resize"; height: number }
```

**关键点**：
- loader.js 是独立 4KB 文件，**不进 widget bundle**
- `postMessage` 时 `targetOrigin` 严格用首次握手记录的 origin，**不传 `"*"`**
- 预填消息：`?prefill=...` 自动塞入 composer，用户回车即发送
- 隐藏历史：`?history=hidden` 不显示切换会话按钮、不持久化 localStorage 里的 sessionId 列表
- JWT 来源：嵌入场景用 `?key=<service_jwt>` 短时 token 换 CozyEngineV2 的 JWT

### 6.4 流 D：语音对话（非实时 STT/TTS）

```
用户按住 mic 按钮 → useRecorder()（基于 capability）
  → 录音中（平台：web=MediaRecorder、Capacitor/Tauri 原生权限）
用户释放 mic → stopRecording() → Blob (audio/webm; codecs=opus)
  → sendVoice(audio) → POST /api/cozy/voice/chat (multipart, session_id, personality_id)
      → POST /v1/voice/chat
          → CozyEngineV2 → CozyVoice STT → Brain 推理（含记忆注入）→ CozyVoice TTS
      ← {transcript, reply_text, reply_audio_url, message_id}
  → append text msg to history
  → 可选自动播放 audio (reply_audio_url)
```

**关键点**：
- 前端**零** STT/TTS 代码，全部走 BFF 上传音频
- 转写后的文字进消息流（与文本输入统一），音频 URL 仅作"重新播放"按钮
- iOS 锁屏后行为需测试；Tauri 需 `capabilities/default.json` 配 `microphone:allow-record`；Capacitor 需 `Info.plist` / `AndroidManifest.xml` 配权限

### 6.5 流 E：Realtime 实时语音通话（LiveKit）

```
用户点 "语音通话"
  → fetch LK token → POST /api/cozy/voice/token {session_id, personality_id}
      → GET /v1/voice/token （签发 LiveKit JWT）
  → openRealtime() → livekit-client connect(LIVEKIT_URL, token)
      → publish mic track (Opus 16kHz) → LiveKit Server
          → CozyVoice LiveKit Worker 加入 room
              → STT 实时识别 → Brain 实时推理（人格+记忆注入）→ TTS 实时合成
              → publish AI audio track → 用户听到
用户挂断
  → closeRealtime() → room.disconnect()
  → upload summary → POST /api/cozy/voice/summary {session_id, turns, tool_calls}
      → POST /v1/chat/voice_summary
          → Brain 落 messages + tool_calls
          → 异步 fire-and-forget save_conversation → CozyMemory
```

**关键点**：
- `livekit-client` SDK 是 web/移动壳统一依赖，**不需要三套实现**
- Realtime UI 状态机：`idle → connecting → connected → active → disconnecting → disconnected`
- Realtime 工具调用：仅 `COZYVOICE_REALTIME_MODE=openai` 模式支持（Realtime API 原生 function calling）；`rtvoice` 模式不支持，UI 在该模式下隐藏"启用工具"开关
- 失败降级：连接失败自动降级到流 D 非实时
- 平台矩阵：Web 全部支持、Tauri 桌面需 `microphone:allow-record`、Capacitor iOS 后台限制需测试（v1.0 已知风险）
- 移动/桌面壳的 LiveKit 行为与 web 一致（同一 SDK）

### 6.6 附带：鉴权流

- 登录：`POST /api/cozy/auth/login` → 转发 → 返回 JWT → HttpOnly cookie（web）+ Zustand persist（壳子）
- Token 续期：JWT 过期前 5 分钟自动 `POST /api/cozy/auth/refresh`；失败触发 `auth.logout()` + 跳 `/login`
- 登出：清 cookie + 清 Zustand + 通知 CozyEngineV2 `/v1/auth/logout`

### 6.7 附带：异步任务流

- 用户点 "深度分析" → `POST /api/cozy/chat/async` → 转发 → 返回 `{task_id, status: "pending"}`
- 前端开 2 秒轮询 / 或通过 WebSocket 接收推送
- 任务完成 → CozyEngineV2 WebSocket 推 `task_completed` 事件 → toast + OS 通知
- 用户点 toast → 跳到对应 session，加载 deferred response

### 6.8 附带：记忆可视化（前端只读）

```
GET /api/cozy/memory/preview
  → BFF 调 CozyMemory get_context + get_profile
  → 返回 {short_term[], long_term[], profile, knowledge[], errors}

UI 在 settings/memory 展示 "我记住的关于你的信息" + "刚用到的相关知识"
  → 单条记忆提供 "删除" 按钮 → DELETE /api/cozy/memory/{id} 透传到 CozyMemory（软删除）
```

**关键点**：
- 记忆预览仅对长会话用户可见（消息数 > 20）
- 用"基于你和 AI 的 N 次对话记住"等**模糊措辞**，不暴露 CozyMemory 内部数据结构
- 前端**不感知**正常聊天时的记忆调用（CozyEngineV2 自动 fire-and-forget）

---

## 7. 错误处理

### 7.1 错误统一形态

BFF 所有响应：
```typescript
type ApiSuccess<T> = { ok: true; data: T }
type ApiError = {
  ok: false;
  error: {
    code: ErrorCode;          // 见 7.2
    message: string;          // 内部日志
    userMessage: string;      // 面向用户的中文文案
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}
```

BFF 在 `lib/api/errors.ts` 实现 `normalize()`：把 CozyEngineV2 形态或网络异常统一映射为 `ApiError`。

### 7.2 错误码字典

| Code | HTTP | 来源 | 用户文案 | retryable | 触发场景 |
|---|---|---|---|---|---|
| `NETWORK_OFFLINE` | 0 | fetch | 网络连接中断 | ✅ | 浏览器 offline / DNS 失败 |
| `TIMEOUT` | 0 | fetch | 请求超时，请重试 | ✅ | 30s 内无响应 |
| `ABORTED` | - | AbortController | （不显示） | - | 用户主动停止 |
| `UNAUTHORIZED` | 401 | CozyEngineV2 | 请重新登录 | ❌ | JWT 过期/无效（refresh 失败后） |
| `FORBIDDEN` | 403 | CozyEngineV2 | 没有权限 | ❌ | 越权访问 |
| `NOT_FOUND` | 404 | CozyEngineV2 | 资源不存在 | ❌ | session/personality 已删 |
| `RATE_LIMITED` | 429 | CozyEngineV2 | 请求过于频繁，请稍后再试 | ✅ | 限流 |
| `PROVIDER_QUOTA_EXCEEDED` | 502/503 | CozyEngineV2 → LLM | AI 服务商额度已用完 | ✅ | OpenAI/Anthropic quota |
| `PROVIDER_UNAVAILABLE` | 502/503 | CozyEngineV2 → LLM | AI 服务暂时不可用，已自动尝试备用 | ✅ | 主 provider 全挂 |
| `PERSONALITY_NOT_FOUND` | 404 | CozyEngineV2 | 人格已删除，请重新选择 | ❌ | personality 引用了已删的 |
| `SESSION_CLOSED` | 400 | CozyEngineV2 | 会话已结束 | ❌ | session 已 ended_at |
| `VALIDATION_ERROR` | 422 | CozyEngineV2 | （表单字段级错误） | ❌ | zod 校验失败 |
| `INSUFFICIENT_BALANCE` | 402 | CozyEngineV2 | 余额不足 | ❌ | 自定义 provider 配额 |
| `PROVIDER_IN_USE` | 409 | CozyEngineV2 | 此 provider 正在被 X 个会话引用 | ❌ | 删自定义 LLM 时 |
| `STREAM_INTERRUPTED` | - | SSE parser | 生成中断，可点击重试 | ✅ | SSE 断流 |
| `WS_DISCONNECTED` | - | WebSocket | 实时连接已断开，正在重连… | ✅ | WS 断 |
| `MIC_DENIED` | - | Capability | 请在浏览器设置中允许麦克风权限 | ❌ | getUserMedia 拒绝 |
| `MIC_UNSUPPORTED` | - | Capability | 当前设备不支持录音 | ❌ | 无 MediaRecorder |
| `LIVEKIT_FAILED` | - | livekit-client | 语音通话连接失败，已切换到文字模式 | ❌ | Realtime 进房失败 |
| `UNKNOWN` | 5xx | * | 出了点小问题，请稍后再试 | ✅ | 兜底 |

### 7.3 处理策略矩阵

| 错误层 | 触发点 | 处理策略 | 用户可见行为 |
|---|---|---|---|
| **网络层** | 浏览器 offline | 全局监听 → Zustand `network.online: false` | 顶栏红条 |
| | fetch 失败 / timeout | `lib/api/client.ts` 自动重试 1 次（指数退避 1s、2s） | 错误 toast + "重试" 按钮 |
| | SSE 流中断 | 标记 assistant `error` + "重新生成" | 错误消息卡 + 按钮 |
| **鉴权层** | 401 | 自动 refresh → 重放原请求；refresh 失败跳 `/login` | 自动恢复 |
| | 403 | 跳 `/forbidden` | 整页错误 |
| **业务层** | 429 | 退避 5s 后自动重试 1 次 | 倒计时提示 |
| | `PROVIDER_QUOTA` | 提示切到默认 provider 或等待 | 内联建议 |
| | `PERSONALITY_NOT_FOUND` | 自动清掉 session 的 personality_id 引用 | 模态框 |
| | `STREAM_INTERRUPTED` | 保留内容，标记 `error`，按钮"重新生成" | 错误卡 + 按钮 |
| **体验层** | React 组件抛错 | 全局 `<ErrorBoundary>` | 单组件回退 |
| | 路由 404 | Next.js `not-found.tsx` | 自定义 404 |
| | 资源 404 | Sentry 上报 + 静默降级 | 不打扰 |

### 7.4 SSE 流中断恢复

```
[流进行中]
  → fetch ReadableStream error/abort/解码失败
    → lib/api/chat.ts 抛 ApiError(STREAM_INTERRUPTED)
      → session store: assistant 状态 streaming → error
        → UI 渲染：
            ┌────────────────────────────────────┐
            │ [Cozy Orange 头像]                 │
            │ 已生成内容：…（灰色斜体）            │
            │ ───────────────────                │
            │ ⚠ 生成中断                         │
            │ [重新生成]  [复制]  [反馈]          │
            └────────────────────────────────────┘
用户点 "重新生成"
  → 复用 user message，重新发起 SSE
  → 新 assistant 消息追加到原消息下方
  → 旧消息标 superseded=true（灰显）
```

**关键点**：
- **不自动重连**长流：网络抖动期内自动重试 1 次（仅 chunk < 3 时）
- **不重发整条消息**："重新生成"创建新消息
- **不做断点续传**

### 7.5 离线/在线状态

```typescript
type NetState = "online" | "offline" | "degraded"

window.addEventListener("online",  () => useUIStore.setState({ network: "online" }))
window.addEventListener("offline", () => useUIStore.setState({ network: "offline" }))

// health probe：每 30s ping BFF /api/cozy/health，连续 2 次失败 → degraded
```

`network !== "online"` 时：Composer disabled、顶栏离线提示、退出登录可用。

### 7.6 平台特定错误

| 平台 | 错误 | 处理 |
|---|---|---|
| Tauri 桌面 | Rust 端 panic | 原生 dialog + Sentry |
| | 文件系统权限不足 | toast + 引导设置 |
| Capacitor 移动 | iOS 后台杀进程 | 进入前提示（v1.0 不做 KeepAwake） |
| | Android 麦克风被占用 | Capability 层抽象，错误统一 `MIC_DENIED` |
| Web 嵌入 widget | X-Frame-Options 阻止 | fallback `window.open` 弹窗 |
| | postMessage parent 不响应 | 5s 超时静默 |

### 7.7 错误上报

- **Sentry** 接入：捕获未处理异常、Promise rejection、SSE 解析错误
- **不上报**：用户主动 abort、网络离线、401 跳登录
- **采样**：生产 100%、开发 0%
- **上下文**：userId、sessionId、personalityId、platform、UA、app version、route、requestId

### 7.8 降级路径总览

```
理想路径                  →   降级路径
─────────────────────────────────────────────────
Realtime 语音通话          →   非实时录音 + 文字（流 D）
流式 SSE                   →   重新生成按钮
WebSocket 实时             →   短轮询（2s）
MediaRecorder 录音         →   文字输入
图片理解                   →   仅文本
多主题动态切换              →   仅系统 light/dark
OS 通知                    →   in-app toast
LiveKit 实时                →   流 D
CozyMemory 失败            →   后端已容错，前端无感
CozyVoice 不可用           →   隐藏 mic 按钮
自定义 LLM provider 失败   →   fallback 到默认 provider
```

---

## 8. 测试方案

### 8.1 测试金字塔

```
       E2E (Playwright)         10-15 个关键场景
       集成测试 (Vitest)         BFF 路由 + store + capability
       单元测试 (Vitest)         lib/api、stores、utils、components
```

- 不引入 Storybook / Chromatic（v1.0 范围外）
- 不引入后端集成测试
- CI 时间预算 ≤ 5 分钟

### 8.2 测试工具

| 类型 | 工具 | 备注 |
|---|---|---|
| 单元/集成 | **Vitest 1.x** | ESM 原生、watch 极快 |
| 组件 | **@testing-library/react + user-event** | 测可访问交互 |
| HTTP mock | **MSW 2.x** | 同时拦截浏览器和 Node fetch，**BFF/前端/集成测试复用同一份 mock** |
| E2E | **Playwright** | 一份测试覆盖 web 自有站 + 嵌入 widget（不同 baseURL） |
| SSE 测试 | MSW SSE handlers（v2 内置） | |
| WebSocket 测试 | mock-socket 或自实现 | |
| LiveKit 测试 | livekit-client 接受自定义 url | v1.0 跳过真实 LiveKit |
| 覆盖率 | @vitest/coverage-v8，**目标 70%** | `lib/api/**` `app/api/**` 100% |
| 桌面 | tauri-driver（v1.0 跳过） | |
| 移动 | Appium（v1.0 跳过） | |

### 8.3 必须测的层

#### A. 契约层（100% 覆盖）

**`lib/api/**`**：
- `streamChat` 正常流解析（3-5 chunk + [DONE]）
- `streamChat` 中途断流
- `streamChat` 用户 abort
- `streamChat` 服务端 error event
- 401 触发 refresh → 重放原请求
- 401 refresh 失败 → 跳登录
- 429 退避重试
- 5xx 退避重试

**`app/api/cozy/**`**：
- 鉴权注入（缺 JWT → 401）
- SSE 透传（上游吐什么就吐什么，不缓冲）
- SSE 错误规范化
- WebSocket 中转
- Provider 创建/测试/删除

#### B. 状态层（高覆盖）

- **stores/**：auth setAuth/logout/hydrate、session appendMessage/updateStreamingMessage/markError、ui 主题切换、persist 三端
- **hooks/**：useRecorder 状态机、useStreamChat cancel、useNetworkStatus

#### C. 业务模块

| 模块 | 关键路径 |
|---|---|
| features/chat | MessageBubble 渲染、Composer 提交、流式追加、停止生成、重新生成 |
| features/sessions | 列表加载、删除、切换时取消上一条流 |
| features/personalities | 卡片、详情、选择 |
| features/providers | 表单校验、测试连接、删除保护 |
| features/voice | mic 权限拒绝、录音→发送→接收→播放 |
| features/embed | loader 注入、postMessage、prefill、隐藏历史 |

#### D. 组件层（按需）

- `components/chat/MessageBubble` 快照
- `components/chat/ToolCallViewer` 折叠/展开
- 不测 shadcn 基础组件

### 8.4 不测的层

- 设计 tokens（CSS variables，视觉靠人眼）
- shadcn 基础组件
- BFF 调 CozyEngineV2 的网络细节（信任 fetch）
- 性能基准
- E2E 偶发场景

### 8.5 E2E 关键场景（15 个）

```
E2E-01  登录 → 看到会话列表
E2E-02  新建会话 → 选人格 → 发送消息 → 看到流式回复
E2E-03  中途点 "停止生成" → assistant 标 error
E2E-04  断网 → Composer disabled → 顶栏离线 → 恢复自动重连
E2E-05  SSE 断流 → 消息 error → "重新生成" 工作
E2E-06  切主题 → 整站颜色变化，刷新后保持
E2E-07  Widget 加载 → 点击气泡 → 展开 → 发送消息
E2E-08  Widget 预填消息自动发送
E2E-09  自定义 LLM 新建 → 测试连接 → 保存 → 在人格里选
E2E-10  录音 → 转写 → 看到回复 + 听到回复音频
E2E-11  Realtime 通话 → 进房 → 听到 AI → 挂断 → 看到 turns 写入历史
E2E-12  Tauri 桌面打开 → 应用启动 → 加载会话
E2E-13  移动壳打开 → iOS/Android 启动 → 加载会话
E2E-14  Token 过期 → 自动 refresh → 失败跳登录
E2E-15  主题 dark/light 切换在所有页面（含 widget）保持一致
```

E2E 用 Playwright 跑两个 baseURL：`http://localhost:3000`（web）和 `http://localhost:3000/widget?...`（嵌入）。桌面/移动靠手动 smoke（README 写步骤）。

### 8.6 Mock 策略

**MSW handlers 复用**（一份 fixtures 给所有测试用）：

```
mocks/
├─ handlers/
│  ├─ cozy.chat.handlers.ts
│  ├─ cozy.sessions.handlers.ts
│  ├─ cozy.personalities.handlers.ts
│  ├─ cozy.providers.handlers.ts
│  ├─ cozy.voice.handlers.ts
│  ├─ cozy.auth.handlers.ts
│  └─ cozy.ws.handlers.ts
├─ fixtures/
└─ server.ts
```

**后端契约测试**（防 BFF 和后端漂移）：
```
tests/contract/
├─ chat.contract.test.ts
├─ sessions.contract.test.ts
├─ personalities.contract.test.ts
└─ voice.contract.test.ts
```

用 `nock` 或 MSW 把 CozyEngineV2 的实际响应**录制**为 fixture（v1.0 启动时人工录制一次）。

### 8.7 CI 流水线

```yaml
on: [push, pull_request]
jobs:
  lint:
    - pnpm install --frozen-lockfile
    - pnpm lint && pnpm format:check && pnpm typecheck
  unit-integration:
    - pnpm test:unit
    - pnpm test:contract
    - coverage → codecov
  build-matrix:
    matrix: [web, widget, desktop-mac, desktop-win, mobile-ios, mobile-android]
    - 各自构建（**只验证构建成功**）
  e2e:
    needs: [unit-integration, build-matrix]
    - pnpm test:e2e
```

### 8.8 验收标准

| 类别 | 标准 |
|---|---|
| 类型 | `pnpm typecheck` 0 错误 |
| Lint | 0 error、warning ≤ 0 |
| 单元 + 集成 | 全绿；`lib/api/**` `app/api/**` ≥ 90%、整体 ≥ 70% |
| 契约 | 全部 4 个通过 |
| 构建 | 4 个形态本地构建成功 |
| E2E | 15 个场景全绿 |
| 手动 smoke | 桌面/移动关键流程跑通 |
| 性能 | LCP < 2.5s、widget bundle < 150KB gzip |
| 可访问性 | axe 0 critical（E2E 加 `@axe-core/playwright`） |

---

## 9. 约束与依赖

### 9.1 上游依赖（CozyEngineV2 假设已具备）

| 能力 | 端点 | 状态 |
|---|---|---|
| 流式聊天 | `POST /v1/chat/completions` | ✅ 已存在 |
| 异步任务 | `POST /v1/chat/async` | ✅ 已存在 |
| WebSocket | `WS /v1/ws/chat` | ✅ 已存在 |
| 语音非实时 | `POST /v1/voice/chat` | ✅ 已存在 |
| 语音 Realtime 上下文 | `POST /v1/chat/voice_context` | ✅ 已存在 |
| 语音 Realtime 总结 | `POST /v1/chat/voice_summary` | ✅ 已存在 |
| 语音 LiveKit Token | `GET /v1/voice/token` | ✅ 已存在 |
| 鉴权 | `/v1/auth/*` | ✅ 已存在 |
| 人格 | `/v1/personalities/*` | ✅ 已存在 |
| 会话 | `/v1/sessions/*` | ✅ 已存在 |
| Tool 列表 | `/v1/tools/*` | ✅ 已存在 |
| 自定义 LLM Provider | `GET/POST/DELETE /v1/users/me/providers` | ⚠️ **CozyEngineV2 增量** |
| Provider 连接测试 | `POST /v1/users/me/providers/test` | ⚠️ **CozyEngineV2 增量** |
| 记忆预览 | `GET /api/cozy/memory/preview`（前端 BFF）→ CozyMemory | ✅ BFF 增量，CozyMemory 已存在 |
| 记忆删除 | `DELETE /api/cozy/memory/{id}` | 同上 |

### 9.2 跨服务依赖

| 服务 | URL | 鉴权 |
|---|---|---|
| CozyEngineV2 | `https://api.cozycopilot.com`（生产） | JWT（X-Cozy-Token header） |
| CozyMemory | `http://cozymemory:8001/api/v1`（内网） | X-Cozy-API-Key |
| CozyVoice | `http://cozyvoice:8002/v1/voice/*`（内网） | X-Cozy-API-Key |
| LiveKit Server | `wss://livekit.cozycopilot.com:7880` | LiveKit JWT |

### 9.3 浏览器/平台要求

| 平台 | 最低版本 |
|---|---|
| Web (Chrome/Edge) | 110+（支持 ReadableStream、fetch SSE、EventSource） |
| Web (Safari) | 16+ |
| Tauri macOS | 11 Big Sur+ |
| Tauri Windows | Windows 10+ |
| Capacitor iOS | 14+ |
| Capacitor Android | 7+ (API 24) |

### 9.4 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| CozyEngineV2 增量（user_provider_configs）未交付 | 自定义 LLM 不可用 | 明确写为前置依赖；接口契约先 mock，CozyEngineV2 交付后切换 |
| iOS 后台杀进程导致 LiveKit 断 | Realtime 通话中断 | 失败降级到流 D；v1.1 评估 KeepAwake 插件 |
| Capacitor iOS 麦克风权限拒绝率 | 用户看不到 mic 按钮 | UI 引导去 iOS 设置；error message 明确 |
| Web 嵌入第三方网站 X-Frame-Options | widget 不可嵌入 | fallback `window.open` 弹窗；提供独立链接 |
| LiveKit 自建服务成本 | Realtime 通话带宽大 | 文档化部署成本；v1.1 评估 OpenAI Realtime API 直连 |
| Sentry 数据合规 | 错误上报含敏感信息 | 配置 beforeSend 过滤；key 永不写入 context |

---

## 10. 开放问题（v1.0 范围内需解决）

| 编号 | 问题 | 解决时机 |
|---|---|---|
| Q1 | CozyEngineV2 增量（user_provider_configs）API 最终 schema | 实施前与 CozyEngineV2 团队对齐 |
| Q2 | LiveKit token 签发服务是 CozyEngineV2 自带还是独立 | 实施前确认 |
| Q3 | CozyVoice 在生产部署的 SLA 和故障切换策略 | 实施前确认 |
| Q4 | 多主题预设是否要做成"市场"模式（用户上传） | v1.0 仅内置 5 套，市场模式 v2.0 |
| Q5 | widget 的 loader.js 商业化计费模型 | 商业化阶段决定 |
| Q6 | 自定义 LLM Key 在 UI 撤销/重置流程 | 实施前决定 |

---

## 11. 验收里程碑

| 里程碑 | 完成标准 |
|---|---|
| M1 骨架 | Next.js 项目跑通、4 形态构建成功、登录/会话列表/流式聊天可用 |
| M2 BFF 完整 | 所有 BFF 路由覆盖、契约测试全绿、错误码字典实现 |
| M3 多端壳 | Tauri 桌面 + Capacitor 移动壳跑通、OS 通知/麦克风权限就位 |
| M4 高级能力 | 自定义 LLM / 异步任务 / 文件上传 / ToolCall 可视化 / WebSocket 实时 |
| M5 语音 | TTS/STT 非实时 + Realtime 通话 + LiveKit 集成 |
| M6 嵌入 widget | loader.js + postMessage 协议 + 预填/隐藏历史 全部跑通 |
| M7 视觉打磨 | 多主题预设、warmth 调性、可访问性扫描、E2E 15 场景全绿 |
| M8 上线 | CI 全绿、性能预算达标、手动 smoke 通过、文档齐备 |

---

## 12. 附录 A：API 契约摘要

（详细 schema 见 CozyEngineV2 OpenAPI）

### BFF 路由 → CozyEngineV2 映射

| BFF | CozyEngineV2 | 方法 |
|---|---|---|
| `/api/cozy/chat` | `/v1/chat/completions` | POST (SSE 透传) |
| `/api/cozy/chat/async` | `/v1/chat/async` | POST |
| `/api/cozy/chat/voice` | `/v1/voice/chat` | POST (multipart) |
| `/api/cozy/chat/voice-token` | `/v1/voice/token` | GET |
| `/api/cozy/chat/voice-summary` | `/v1/chat/voice_summary` | POST |
| `/api/cozy/chat/voice-context` | `/v1/chat/voice_context` | POST |
| `/api/cozy/sessions` | `/v1/sessions` | GET, POST |
| `/api/cozy/sessions/[id]` | `/v1/sessions/{id}` | GET, DELETE, PATCH |
| `/api/cozy/personalities` | `/v1/personalities` | GET, POST |
| `/api/cozy/providers` | `/v1/users/me/providers` | GET, POST |
| `/api/cozy/providers/[id]` | `/v1/users/me/providers/{id}` | GET, DELETE |
| `/api/cozy/providers/test` | `/v1/users/me/providers/test` | POST |
| `/api/cozy/memory/preview` | (BFF 调 CozyMemory) | GET |
| `/api/cozy/memory/[id]` | (BFF 调 CozyMemory) | DELETE |
| `/api/cozy/auth/login` | `/v1/auth/login` | POST |
| `/api/cozy/auth/refresh` | `/v1/auth/refresh` | POST |
| `/api/cozy/auth/logout` | `/v1/auth/logout` | POST |
| `/api/ws/chat` | `/v1/ws/chat` | WS |

### 客户端 → BFF 主要类型

```typescript
type ChatRequest = {
  sessionId: string;
  personalityId: string;
  message: string;
  model?: string;  // "<provider_id>:<model_name>" or "default"
}

type ChatDeltaEvent =
  | { type: "delta"; content: string }
  | { type: "tool_call_start"; name: string; args: unknown }
  | { type: "tool_call_result"; name: string; result: unknown; isError?: boolean }
  | { type: "done"; usage?: { promptTokens: number; completionTokens: number } }
  | { type: "error"; code: ErrorCode; message: string }

type Personality = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  status: "draft" | "active" | "archived";
  brain: { systemPrompt: string; modelOverride?: string; temperature: number; maxTokens: number };
  voice: { voiceId?: string; ttsProviderOverride?: string };
  context: { tokenBudget: number; knowledgeDatasets: string[] };
  skills: { allowedTools: string[]; requireApproval: string[]; maxToolCallsPerTurn: number };
}

type Provider = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  // apiKey never returned to client
}
```

---

**Spec 完。** 等待用户复核。
